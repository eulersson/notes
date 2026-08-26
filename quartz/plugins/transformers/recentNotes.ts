import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { Root, Code } from "mdast"

export interface Options {
  /** Fence language that marks a block, shared with the Obsidian plugin. */
  language: string
  defaultLimit: number
  defaultShowDate: boolean
  defaultShowTags: boolean
}

const defaultOptions: Options = {
  language: "recent-notes",
  defaultLimit: 10,
  defaultShowDate: true,
  defaultShowTags: false,
}

interface BlockOptions {
  limit: number
  showDate: boolean
  showTags: boolean
}

function parseBoolean(raw: string, fallback: boolean): boolean {
  const value = raw.toLowerCase()
  if (value === "true" || value === "yes") return true
  if (value === "false" || value === "no") return false
  return fallback
}

/**
 * Reads the `key: value` lines inside the fence. This mirrors the parser in the
 * `recent-notes` Obsidian plugin — keep the two in step, since the same block
 * has to render in both places.
 */
function parseBlockOptions(source: string, opts: Options): BlockOptions {
  const parsed: BlockOptions = {
    limit: opts.defaultLimit,
    showDate: opts.defaultShowDate,
    showTags: opts.defaultShowTags,
  }

  for (const line of source.split("\n")) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith("#")) continue

    const separator = trimmed.indexOf(":")
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim().toLowerCase()
    const value = trimmed.slice(separator + 1).trim()

    if (key === "limit") {
      const limit = Number.parseInt(value, 10)
      if (Number.isFinite(limit) && limit > 0) parsed.limit = limit
    } else if (key === "showdate") {
      parsed.showDate = parseBoolean(value, parsed.showDate)
    } else if (key === "showtags") {
      parsed.showTags = parseBoolean(value, parsed.showTags)
    }
  }

  return parsed
}

/**
 * Turns a ```recent-notes fence into an empty placeholder element.
 *
 * The list itself cannot be built here: a transformer only ever sees one file,
 * and `BuildCtx.allFiles` carries paths rather than dates. `renderRecentNotes`
 * fills the placeholder in at render time, where every page's frontmatter and
 * dates are available.
 */
export const RecentNotesBlock: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }

  return {
    name: "RecentNotesBlock",
    markdownPlugins() {
      return [
        () => {
          return (tree: Root) => {
            visit(tree, "code", (node: Code, index, parent) => {
              if (node.lang !== opts.language) return
              if (!parent || index === undefined) return

              const block = parseBlockOptions(node.value, opts)
              parent.children[index] = {
                type: "paragraph",
                children: [],
                data: {
                  hName: "div",
                  hProperties: {
                    className: ["recent-notes"],
                    "data-recent-notes": "",
                    "data-limit": String(block.limit),
                    "data-show-date": String(block.showDate),
                    "data-show-tags": String(block.showTags),
                  },
                },
              }
            })
          }
        },
      ]
    },
  }
}
