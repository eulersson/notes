import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { Root } from "mdast"
import path from "path"
import { FilePath, slugifyFilePath } from "../../util/path"
import { escapeHTML } from "../../util/escape"

// Same extension lists as ObsidianFlavoredMarkdown uses for its embeds
const videoExtensions = new Set([
  ".mp4",
  ".webm",
  ".ogv",
  ".avi",
  ".mov",
  ".flv",
  ".wmv",
  ".mkv",
  ".mpg",
  ".mpeg",
  ".3gp",
  ".m4v",
])
const audioExtensions = new Set([".mp3", ".wav", ".m4a", ".ogg", ".oga", ".aac", ".flac"])

// An embed's alias is `caption`, `caption|300` or `caption|300x200`; only the caption is kept
const embedAliasRegex = /^(?<alt>(?!^\d*x?\d*$).*?)?(\|?\s*?(?<width>\d+)(x(?<height>\d+))?)?$/

/** A `[[...]]` / `![[...]]` node, as parsed by ObsidianFlavoredMarkdown */
interface WikilinkNode {
  type: "wikilink"
  path?: string
  alias?: string
  embedded?: boolean
}

/**
 * Keeps the alias of an embedded video or audio, `![[clip.mp4|A caption]]`, as a `data-caption`
 * attribute for ImageCaptions to turn into a <figcaption>.
 *
 * ObsidianFlavoredMarkdown drops that alias when it turns the embed into a <video>/<audio>, so
 * this has to run just before it (see quartz.ts): it emits the element itself, the same way
 * ObsidianFlavoredMarkdown would, plus the caption. Embeds without a caption are left to it.
 */
export const MediaCaptions: QuartzTransformerPlugin = () => {
  return {
    name: "MediaCaptions",
    markdownPlugins() {
      return [
        () => {
          return (tree: Root) => {
            visit(
              tree,
              (node) => (node.type as string) === "wikilink",
              (node, index, parent) => {
                const link = node as unknown as WikilinkNode
                if (!link.embedded || !parent || index === undefined) return

                const fp = link.path?.trim() ?? ""
                const ext = path.extname(fp).toLowerCase()
                const tag = videoExtensions.has(ext)
                  ? "video"
                  : audioExtensions.has(ext)
                    ? "audio"
                    : undefined
                if (!tag) return

                const caption = embedAliasRegex.exec(link.alias?.trim() ?? "")?.groups?.alt?.trim()
                if (!caption) return

                const url = slugifyFilePath(fp as FilePath)
                parent.children[index] = {
                  type: "html",
                  value: `<${tag} src="${url}" data-caption="${escapeHTML(caption)}" controls></${tag}>`,
                }
              },
            )
          }
        },
      ]
    },
  }
}
