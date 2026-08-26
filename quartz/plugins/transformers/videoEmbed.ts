import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { Root } from "hast"
import { isVideoPath, posterPath } from "../../util/video"

interface Options {
  /**
   * Cap on how tall a video may render. Clips shot on a phone are portrait, and at
   * the default `width: 100%` a 9:16 clip is nearly twice as tall as the viewport.
   */
  maxHeight: string
}

const defaultOptions: Options = {
  maxHeight: "65vh",
}

/**
 * Size to the poster's own aspect ratio rather than filling the column, so portrait
 * clips stay thumbnail-sized instead of towering over the text around them. The second
 * selector matches the specificity of ImageCaptions' `width: 100%`; delete this whole
 * block to go back to full-bleed video.
 */
const videoEmbedStyle = (opts: Options) => `
video.video-embed,
article figure.captioned > video.video-embed {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: ${opts.maxHeight};
  margin-inline: auto;
  background-color: var(--lightgray);
}
`

export const VideoEmbed: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "VideoEmbed",
    htmlPlugins() {
      return [
        () => {
          return (tree: Root) => {
            visit(tree, "element", (node) => {
              if (node.tagName !== "video" || !node.properties) return
              const src = node.properties.src
              if (typeof src !== "string" || !isVideoPath(src)) return

              // Safari on iOS refuses to preload media, so a bare <video> never has a
              // frame to show and renders as an empty box — one per clip, a dozen on
              // pages like /mustang-trip. A build-time poster gives it something to
              // paint, and preload="none" keeps every byte of video off the page until
              // the reader actually taps play.
              node.properties.poster = posterPath(src)
              node.properties.preload = "none"
              node.properties.playsInline = true
              node.properties.className = ["video-embed"]
            })
          }
        },
      ]
    },
    externalResources() {
      return {
        css: [{ content: videoEmbedStyle(opts), inline: true }],
      }
    },
  }
}
