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
article figure.captioned {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 1.5rem 0;
}

article figure.captioned > img,
article figure.captioned > a > img,
article figure.captioned > video,
article figure.captioned > audio {
  margin: 0;
  display: block;
}

article figure.captioned > a {
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

function getCaption(node: Element): string | undefined {
  const props = node.properties ?? {}
  // `alt` for images, `data-caption` for the raw <video>/<audio> that ofm emits
  const raw = props.alt ?? props.dataCaption ?? props["data-caption"]
  if (typeof raw !== "string") return undefined
  const caption = raw.trim()
  return caption === "" ? undefined : caption
}

export const ImageCaptions: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  const captionable = new Set(opts.captionMedia ? ["img", "video", "audio"] : ["img"])

  return {
    name: "ImageCaptions",
    htmlPlugins() {
      return [
        () => {
          return (tree: Root) => {
            visit(tree, "element", (node, index, parent) => {
              // Only a paragraph holding nothing but the media becomes a figure —
              // an image sitting inline in a sentence keeps its alt text and nothing else.
              if (node.tagName !== "p" || !parent || index === undefined) return

              const only = soleElement(node)
              if (!only) return

              // the media may be wrapped in a link, e.g. [![[img.png|caption]]](url)
              const media = captionable.has(only.tagName)
                ? only
                : only.tagName === "a"
                  ? soleElement(only)
                  : undefined
              if (!media || !captionable.has(media.tagName)) return

              const caption = getCaption(media)
              if (!caption) return

              // the caption is now visible text; no need to repeat it as an attribute
              if (media.properties) {
                delete media.properties.dataCaption
                delete media.properties["data-caption"]
              }

              const figure: Element = {
                type: "element",
                tagName: "figure",
                properties: { className: ["captioned"] },
                children: [
                  only,
                  {
                    type: "element",
                    tagName: "figcaption",
                    properties: {},
                    children: [{ type: "text", value: caption }],
                  },
                ],
              }

              parent.children[index] = figure
              return SKIP
            })
          }
        },
      ]
    },
    externalResources() {
      return {
        css: [{ content: captionStyle, inline: true }],
      }
    },
  }
}
