import test, { describe } from "node:test"
import assert from "node:assert"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkBreaks from "remark-breaks"
import remarkRehype from "remark-rehype"
import { toHtml } from "hast-util-to-html"
import { Root } from "hast"
import { captionImages, parseImageLayout } from "./imageCaptions"

const captionable = new Set(["img", "video", "audio"])

// Markdown images carry the same alt text as Obsidian embeds: ![right|35%](a.png) stands for
// ![[a.png|right|35%]]. remark-breaks turns a newline into <br>, as on the site.
function render(markdown: string): string {
  const processor = unified().use(remarkParse).use(remarkBreaks).use(remarkRehype)
  const tree = processor.runSync(processor.parse(markdown)) as Root
  captionImages(tree, captionable)
  return toHtml(tree)
}

describe("parseImageLayout", () => {
  test("takes the alignment and width words out of the caption", () => {
    assert.deepStrictEqual(parseImageLayout("right|35%"), {
      caption: "",
      align: "right",
      width: "35%",
    })
    assert.deepStrictEqual(parseImageLayout("Stupa at Ghiling|left|40%"), {
      caption: "Stupa at Ghiling",
      align: "left",
      width: "40%",
    })
  })

  test("words may come in any order, any case, with spaces", () => {
    assert.deepStrictEqual(parseImageLayout("35% | Right | Caption"), {
      caption: "Caption",
      align: "right",
      width: "35%",
    })
  })

  test("a caption is only the words that are not layout", () => {
    assert.deepStrictEqual(parseImageLayout("Grew by 40%"), { caption: "Grew by 40%" })
    assert.deepStrictEqual(parseImageLayout("Turn left"), { caption: "Turn left" })
    assert.deepStrictEqual(parseImageLayout("a|b"), { caption: "a|b" })
    assert.deepStrictEqual(parseImageLayout(""), { caption: "" })
  })

  test("a width is a whole percentage from 1 to 100", () => {
    assert.deepStrictEqual(parseImageLayout("100%"), { caption: "", width: "100%" })
    assert.deepStrictEqual(parseImageLayout("0%"), { caption: "0%" })
    assert.deepStrictEqual(parseImageLayout("150%"), { caption: "150%" })
    assert.deepStrictEqual(parseImageLayout("12.5%"), { caption: "12.5%" })
  })
})

describe("captionImages", () => {
  test("a caption alone makes a captioned figure, as before", () => {
    assert.strictEqual(
      render("![A caption](a.png)"),
      '<figure class="captioned"><img src="a.png" alt="A caption"><figcaption>A caption</figcaption></figure>',
    )
  })

  test("a file name is not a caption", () => {
    assert.strictEqual(render("![a.png](a.png)"), '<p><img src="a.png" alt="a.png"></p>')
  })

  test("layout words go on the figure and out of the alt text", () => {
    assert.strictEqual(
      render("![right|35%](a.png)"),
      '<figure data-align="right" class="image-layout sized" style="--image-width: 35%"><img src="a.png" alt=""></figure>',
    )
    assert.strictEqual(
      render("![Stupa|left|40%](a.png)"),
      '<figure data-align="left" class="captioned image-layout sized" style="--image-width: 40%"><img src="a.png" alt="Stupa"><figcaption>Stupa</figcaption></figure>',
    )
    assert.strictEqual(
      render("![60%](a.png)"),
      '<figure class="image-layout sized" style="--image-width: 60%"><img src="a.png" alt=""></figure>',
    )
  })

  test("center alone is the default and needs no figure", () => {
    assert.strictEqual(render("![center](a.png)"), '<p><img src="a.png" alt=""></p>')
  })

  test("an image that starts a paragraph moves out in front of its text", () => {
    assert.strictEqual(
      render("![right|30%](a.png)\nThe text beside it."),
      '<figure data-align="right" class="image-layout sized" style="--image-width: 30%"><img src="a.png" alt=""></figure><p>The text beside it.</p>',
    )
  })

  test("an image without caption or layout words stays in its paragraph", () => {
    assert.strictEqual(
      render("![a.png](a.png)\nThe text after it."),
      '<p><img src="a.png" alt="a.png"><br>\nThe text after it.</p>',
    )
  })

  test("an image inside a sentence keeps its place and can still float", () => {
    assert.strictEqual(
      render("Before ![right|30%](a.png) after."),
      '<p>Before <img src="a.png" alt="" data-align="right" class="sized" style="--image-width: 30%"> after.</p>',
    )
  })

  test("a linked image takes the link into the figure", () => {
    assert.strictEqual(
      render("[![Map|right](a.png)](https://example.org)"),
      '<figure data-align="right" class="captioned image-layout"><a href="https://example.org"><img src="a.png" alt="Map"></a><figcaption>Map</figcaption></figure>',
    )
  })

  test("a video takes its caption from data-caption", () => {
    const tree: Root = {
      type: "root",
      children: [
        {
          type: "element",
          tagName: "p",
          properties: {},
          children: [
            {
              type: "element",
              tagName: "video",
              properties: { src: "clip.mp4", dataCaption: "A clip|right" },
              children: [],
            },
          ],
        },
      ],
    }
    captionImages(tree, captionable)
    assert.strictEqual(
      toHtml(tree),
      '<figure class="captioned"><video src="clip.mp4"></video><figcaption>A clip|right</figcaption></figure>',
    )
  })
})
