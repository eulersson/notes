import { QuartzTransformerPlugin } from "../types"
import { SKIP, visit } from "unist-util-visit"
import { Root, Element, ElementContent } from "hast"

interface Options {
  /** Also turn the alias of an embedded video/audio into a caption */
  captionMedia: boolean
}

const defaultOptions: Options = {
  captionMedia: true,
}

const captionStyle = `
article figure:is(.captioned, .image-layout) {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 1.5rem 0;
}

article figure:is(.captioned, .image-layout) > img,
article figure:is(.captioned, .image-layout) > a > img,
article figure.captioned > video,
article figure.captioned > audio {
  margin: 0;
  display: block;
}

article figure:is(.captioned, .image-layout) > a {
  display: block;
  max-width: 100%;
}

article figure.captioned > figcaption {
  margin-top: 0.6rem;
  max-width: 40rem;
  font-family: var(--bodyFont);
  font-size: 0.8rem;
  line-height: 1.5;
  font-style: italic;
  text-align: center;
  text-wrap: balance;
  /* --gray is too faint against --light in both themes; dim the body colour instead */
  color: var(--darkgray);
  opacity: 0.75;
}

/* video is full-bleed, so let its caption line up with the player edges */
article figure.captioned > video,
article figure.captioned > audio {
  width: 100%;
}

/* Layout words, ![[photo.jpg|Caption|right|35%]]: see parseImageLayout. */

/* a width in % of the text column */
article .sized {
  width: var(--image-width);
}

article figure.sized > img,
article figure.sized > a,
article figure.sized > a > img {
  width: 100%;
}

article figure.sized:not([data-align="left"], [data-align="right"]) {
  margin-inline: auto;
}

/* left and right: the text wraps around the image */
article :is(figure, img)[data-align="left"] {
  float: left;
  margin: 0.3rem 1.5rem 1rem 0;
}

article :is(figure, img)[data-align="right"] {
  float: right;
  margin: 0.3rem 0 1rem 1.5rem;
}

/* a floated figure is as wide as its image, and the caption wraps to that width */
article figure:is([data-align="left"], [data-align="right"]) > figcaption {
  width: 0;
  min-width: 100%;
}

/* Any other image starts below a floated one rather than squeezing in beside it,
   and the article ends below its last one. */
article figure:not([data-align="left"], [data-align="right"]),
article img:not([data-align="left"], [data-align="right"]) {
  clear: both;
}

article::after {
  content: "";
  display: block;
  clear: both;
}

/* A phone has no room beside an image: it stops floating and is centered at
   twice its width, at most the full column. 800px is Quartz's $mobile. */
@media all and (max-width: 800px) {
  article :is(figure, img):is([data-align="left"], [data-align="right"]) {
    float: none;
    margin: 1.5rem auto;
  }

  article .sized:is([data-align="left"], [data-align="right"]) {
    width: min(100%, 2 * var(--image-width));
  }
}
`

/** Text nodes that only carry markdown whitespace don't count as content. */
const isBlank = (node: ElementContent) =>
  (node.type === "text" && node.value.trim() === "") || node.type === "comment"

/**
 * The single element child of `node`, ignoring whitespace and decorative svg
 * icons (CrawlLinks appends one inside external links) — or undefined.
 */
function soleElement(node: Element): Element | undefined {
  const kids = node.children.filter(
    (child) => !isBlank(child) && !(child.type === "element" && child.tagName === "svg"),
  )
  if (kids.length !== 1) return undefined
  return kids[0].type === "element" ? kids[0] : undefined
}

// An image embedded without a caption, `![[pic.png]]`, gets its file path as alt text (and so
// does an embed of an image the site doesn't have). That is not a caption.
const imageFileName = /\.(png|jpe?g|gif|bmp|webp|jxl|svg|avif|tiff?)$/i

/** The words an image's alias can carry besides its caption. */
export interface ImageLayout {
  /** The alias without its layout words, the rest still joined by pipes. */
  caption: string
  /** left and right float the image and the text wraps around it; center is the default. */
  align?: "left" | "right" | "center"
  /** A share of the text column, "1%" to "100%". */
  width?: string
}

const alignWords: readonly string[] = ["left", "right", "center"]
const percentWord = /^(\d{1,3})%$/

/**
 * Split an image's alt text into its caption and layout words. Obsidian keeps all of an
 * embed's alias in the alt text except a final pixel size, so
 * `![[photo.jpg|Stupa at Ghiling|right|35%]]` arrives as "Stupa at Ghiling|right|35%".
 * The vault reads the same words: its Image Captions plugin takes left, right and center,
 * and its Images.css snippet the percentage.
 */
export function parseImageLayout(alt: string): ImageLayout {
  const layout: ImageLayout = { caption: "" }
  const kept: string[] = []
  for (const part of alt.split("|")) {
    const word = part.trim().toLowerCase()
    const percent = Number(percentWord.exec(word)?.[1])
    if (alignWords.includes(word)) {
      layout.align = word as ImageLayout["align"]
    } else if (percent >= 1 && percent <= 100) {
      layout.width = `${percent}%`
    } else {
      kept.push(part)
    }
  }
  layout.caption = kept.join("|").trim()
  return layout
}

/** The caption of a video/audio, from the `data-caption` that MediaCaptions emits. */
function mediaCaption(node: Element): string | undefined {
  const props = node.properties ?? {}
  const raw = props.dataCaption ?? props["data-caption"]
  if (typeof raw !== "string" || raw.trim() === "") return undefined
  // the caption is now visible text; no need to repeat it as an attribute
  delete props.dataCaption
  delete props["data-caption"]
  return raw.trim()
}

/**
 * Take the layout words out of an image's alt text and put them on `box`, the figure
 * around the image or the image itself. Returns the caption left in the alt text, or
 * undefined if there is none.
 */
function applyLayout(img: Element, box: Element): string | undefined {
  const props = (img.properties ??= {})
  if (typeof props.alt !== "string") return undefined
  const layout = parseImageLayout(props.alt)
  const caption =
    layout.caption === "" || imageFileName.test(layout.caption) ? undefined : layout.caption

  if (layout.align || layout.width) {
    // the alt text is for readers, not for layout words
    props.alt = caption ?? ""
  }
  const boxProps = (box.properties ??= {})
  if (layout.align === "left" || layout.align === "right") {
    boxProps.dataAlign = layout.align
  }
  if (layout.width) {
    boxProps.className = [...classList(box), "sized"]
    const style = typeof boxProps.style === "string" ? boxProps.style.replace(/;?\s*$/, "; ") : ""
    boxProps.style = `${style}--image-width: ${layout.width}`
  }
  return caption
}

function classList(node: Element): string[] {
  const value = node.properties?.className
  return Array.isArray(value) ? value.map(String) : typeof value === "string" ? [value] : []
}

/** The media in `node`: `node` itself, or the only thing in a link, e.g. [![[img.png]]](url) */
function mediaIn(node: ElementContent | undefined, captionable: Set<string>): Element | undefined {
  if (node?.type !== "element") return undefined
  if (captionable.has(node.tagName)) return node
  const inner = node.tagName === "a" ? soleElement(node) : undefined
  return inner && captionable.has(inner.tagName) ? inner : undefined
}

/**
 * A <figure> around `content` (the media, or the link holding it), or undefined when
 * the media has neither a caption nor layout words.
 */
function figureFor(content: Element, media: Element): Element | undefined {
  const figure: Element = { type: "element", tagName: "figure", properties: {}, children: [] }
  const caption = media.tagName === "img" ? applyLayout(media, figure) : mediaCaption(media)
  const laidOut = Object.keys(figure.properties).length > 0
  if (!caption && !laidOut) return undefined

  figure.properties.className = [
    ...(caption ? ["captioned"] : []),
    ...(laidOut ? ["image-layout"] : []),
    ...classList(figure),
  ]
  figure.children = [content]
  if (caption) {
    figure.children.push({
      type: "element",
      tagName: "figcaption",
      properties: {},
      children: [{ type: "text", value: caption }],
    })
  }
  return figure
}

const imagesOnly = new Set(["img"])

/**
 * Turn images (and, with `captionable`, videos and audio) into figures with captions and
 * layout words, in place.
 */
export function captionImages(tree: Root, captionable: Set<string>) {
  visit(tree, "element", (node, index, parent) => {
    if (node.tagName !== "p" || !parent || index === undefined) return

    // A paragraph holding nothing but the media becomes a figure.
    const only = soleElement(node)
    const soleMedia = mediaIn(only, captionable)
    if (only && soleMedia) {
      const figure = figureFor(only, soleMedia)
      if (!figure) return
      parent.children[index] = figure
      return SKIP
    }

    // An image that starts a paragraph, with text after it (`![[pic.png|right|35%]]` and the
    // text on the next line), moves out in front of it, so that it can float beside it.
    const start = node.children.findIndex((child) => !isBlank(child))
    const first = node.children[start]
    const image = mediaIn(first, imagesOnly)
    if (!image || first.type !== "element") return
    const figure = figureFor(first, image)
    if (!figure) return
    let rest = node.children.slice(start + 1)
    const next = rest.findIndex((child) => !isBlank(child))
    const after = rest[next]
    if (after?.type === "element" && after.tagName === "br") rest = rest.slice(next + 1)
    if (rest.every(isBlank)) {
      parent.children[index] = figure
      return SKIP
    }
    const lead = rest[0]
    if (lead.type === "text") rest = [{ ...lead, value: lead.value.trimStart() }, ...rest.slice(1)]
    node.children = rest
    parent.children.splice(index, 0, figure)
    return [SKIP, index + 2]
  })

  // An image inside a sentence stays where it is, without a caption; it can still float.
  visit(tree, "element", (node) => {
    if (node.tagName === "img") applyLayout(node, node)
  })
}

export const ImageCaptions: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  const captionable = new Set(opts.captionMedia ? ["img", "video", "audio"] : ["img"])

  return {
    name: "ImageCaptions",
    htmlPlugins() {
      return [() => (tree: Root) => captionImages(tree, captionable)]
    },
    externalResources() {
      return {
        css: [{ content: captionStyle, inline: true }],
      }
    },
  }
}
