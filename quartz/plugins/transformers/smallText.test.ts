import test, { describe } from "node:test"
import assert from "node:assert"
import { unified } from "unified"
import remarkParse from "remark-parse"
import remarkBreaks from "remark-breaks"
import remarkRehype from "remark-rehype"
import { toHtml } from "hast-util-to-html"
import { Root } from "hast"
import { findSmallSpans, wrapSmallText } from "./smallText"

function render(markdown: string): string {
  const processor = unified().use(remarkParse).use(remarkBreaks).use(remarkRehype)
  const tree = processor.runSync(processor.parse(markdown)) as Root
  wrapSmallText(tree)
  return toHtml(tree)
}

function spans(text: string): string[] {
  return findSmallSpans(text).map(({ from, to }) => text.slice(from, to))
}

describe("findSmallSpans", () => {
  test("delimiters must hug their content", () => {
    assert.deepStrictEqual(spans("a ,,small,, b"), [",,small,,"])
    assert.deepStrictEqual(spans(",,two words,, and ,,more,,"), [",,two words,,", ",,more,,"])
    assert.deepStrictEqual(spans("a ,, b ,, c"), [])
    assert.deepStrictEqual(spans("trailing ,,"), [])
  })

  test("extra commas stay literal", () => {
    assert.deepStrictEqual(spans(",,,x,,"), [])
    assert.deepStrictEqual(spans(",,,,"), [])
    assert.deepStrictEqual(spans(",,text,,, then"), [",,text,,"])
  })

  test("spans stay on one line", () => {
    assert.deepStrictEqual(spans(",,a\nb,,"), [])
  })
})

describe("SmallText", () => {
  test("wraps plain text", () => {
    assert.strictEqual(render("a ,,small,, b"), "<p>a <small>small</small> b</p>")
  })

  test("wraps across inline formatting", () => {
    assert.strictEqual(
      render(",,a **b** c,, and ,,d *e* f,,"),
      "<p><small>a <strong>b</strong> c</small> and <small>d <em>e</em> f</small></p>",
    )
    assert.strictEqual(render("**,,b,,**"), "<p><strong><small>b</small></strong></p>")
    assert.strictEqual(render("[,,link,,](x)"), '<p><a href="x"><small>link</small></a></p>')
  })

  test("leaves code alone", () => {
    assert.strictEqual(
      render(",,see `,,x,,`,, z"),
      "<p><small>see <code>,,x,,</code></small> z</p>",
    )
    assert.strictEqual(render("```\n,,no,,\n```"), "<pre><code>,,no,,\n</code></pre>")
  })

  test("does not cross line breaks", () => {
    assert.strictEqual(render(",,a\nb,,"), "<p>,,a<br>\nb,,</p>")
  })
})
