import { QuartzTransformerPlugin } from "../types"
import { Root as MdRoot, Code } from "mdast"
import { Root as HtmlRoot, Element, ElementContent } from "hast"
import { visit } from "unist-util-visit"
import { toString } from "hast-util-to-string"
import { toHast } from "mdast-util-to-hast"
import { unified } from "unified"
import remarkParse from "remark-parse"

/**
 * In-body table of contents, rendered from a ```toc fence.
 *
 * The fence is authored in Obsidian by the `automatic-table-of-contents`
 * community plugin (MIT, johansatge). The option grammar below is a port of
 * that plugin's `src/options.ts` and the traversal in `renderList` follows its
 * `src/headings.ts`, because the same block has to mean the same thing in both
 * places. Change one, change the other.
 */

type Style = "nestedList" | "nestedOrderedList" | "inlineFirstLevel"

interface BlockOptions {
  title: string
  style: Style
  minLevel: number
  maxLevel: number
  include: RegExp | null
  exclude: RegExp | null
  includeLinks: boolean
  hideWhenEmpty: boolean
}

export interface Options {
  /** Fence languages that mark a block. Both are registered by the plugin. */
  languages: string[]
  /**
   * Mirrors the plugin's settings tab. Those defaults live in the vault's
   * `data.json`, which never reaches Quartz, so anything changed there has to
   * be repeated here or the site will disagree with Obsidian.
   */
  defaults: Partial<BlockOptions>
}

const defaultOptions: Options = {
  languages: ["toc", "table-of-contents"],
  defaults: {},
}

const builtinDefaults: BlockOptions = {
  title: "",
  style: "nestedList",
  minLevel: 0,
  maxLevel: 0,
  include: null,
  exclude: null,
  includeLinks: true,
  hideWhenEmpty: false,
}

const styles: Style[] = ["nestedList", "nestedOrderedList", "inlineFirstLevel"]

type OptionType = "string" | "value" | "number" | "boolean" | "regexp"

// `debugInConsole` is accepted so the shared block parses cleanly, then ignored.
const optionTypes: Record<string, OptionType> = {
  title: "string",
  style: "value",
  minLevel: "number",
  maxLevel: "number",
  include: "regexp",
  exclude: "regexp",
  includeLinks: "boolean",
  hideWhenEmpty: "boolean",
  debugInConsole: "boolean",
}

function parseOptionLine(line: string): [string, unknown] | null {
  const matches = line.match(/([a-zA-Z0-9._ ]+):(.*)/)
  if (line.startsWith("#") || !matches || !matches[1] || !matches[2]) return null

  const name = matches[1].trim()
  const type = optionTypes[name]
  if (!type) return null

  let value = matches[2].trim()
  // A string or a regexp may legitimately contain "#", so only strip trailing
  // comments from the other types.
  if (type !== "string" && type !== "regexp") {
    value = value.replace(/#[^#]*$/, "").trim()
  }

  const invalid = new Error(`Invalid value for \`${name}\``)
  switch (type) {
    case "number": {
      const parsed = Number.parseInt(value, 10)
      if (parsed < 0) throw invalid
      // An unparseable number reads as 0, which every check below treats as
      // "no limit" — the same thing it does in Obsidian.
      return [name, Number.isNaN(parsed) ? 0 : parsed]
    }
    case "boolean": {
      if (value !== "true" && value !== "false") throw invalid
      return [name, value === "true"]
    }
    case "value": {
      if (!styles.includes(value as Style)) throw invalid
      return [name, value as Style]
    }
    case "string": {
      if (value === "null" || value === '""' || value === "''") return [name, ""]
      return [name, value]
    }
    case "regexp": {
      if (value === "null" || value.length === 0) return null
      const match = /^\/(.*)\/([a-z]*)/.exec(value)
      if (!match || !match[1]) throw invalid
      try {
        return [name, new RegExp(match[1], match[2] ?? "")]
      } catch {
        throw invalid
      }
    }
  }
}

function parseBlockOptions(source: string, defaults: Partial<BlockOptions>): BlockOptions {
  const options: BlockOptions = { ...builtinDefaults, ...defaults }
  for (const line of source.split("\n")) {
    const parsed = parseOptionLine(line)
    if (parsed) (options as unknown as Record<string, unknown>)[parsed[0]] = parsed[1]
  }
  return options
}

interface Heading {
  level: number
  text: string
  id: string
}

interface StoredBlock {
  options: BlockOptions | null
  error: string | null
}

function element(tagName: string, className?: string, children: ElementContent[] = []): Element {
  return {
    type: "element",
    tagName,
    properties: className ? { className: [className] } : {},
    children,
  }
}

function text(value: string): ElementContent {
  return { type: "text", value }
}

function isAllowed(label: string, opts: BlockOptions): boolean {
  if (opts.include) return opts.include.test(label)
  if (opts.exclude) return !opts.exclude.test(label)
  return true
}

function label(heading: Heading, opts: BlockOptions): ElementContent {
  if (!opts.includeLinks) return text(heading.text)
  return {
    type: "element",
    tagName: "a",
    properties: {
      // Unencoded, matching the sidebar TableOfContents component — these ids
      // are frequently non-ASCII (Tibetan) and browsers resolve them fine.
      href: `#${heading.id}`,
      // `internal` is what gives a wikilink its pill styling. CrawlLinks would
      // normally add it, but this runs after CrawlLinks, so set it here — and
      // opt out of the hover preview, which would otherwise refetch the page
      // the reader is already on.
      className: ["internal", "toc-block-link"],
      "data-no-popover": "true",
    },
    children: [text(heading.text)],
  }
}

/** Renders the nested styles. Mirrors `getMarkdownListFromHeadings`. */
function renderList(headings: Heading[], opts: BlockOptions): Element | null {
  const minLevel =
    opts.minLevel > 0 ? opts.minLevel : Math.min(...headings.map((heading) => heading.level))

  const entries: { depth: number; heading: Heading }[] = []
  let unallowedLevel = 0
  for (const heading of headings) {
    // A heading rejected by include/exclude takes its whole subtree with it,
    // until a heading at or above its own level reopens the list.
    if (unallowedLevel > 0 && heading.level > unallowedLevel) continue
    if (heading.level <= unallowedLevel) unallowedLevel = 0
    if (!isAllowed(heading.text, opts)) {
      unallowedLevel = heading.level
      continue
    }
    if (heading.level < minLevel) continue
    if (opts.maxLevel > 0 && heading.level > opts.maxLevel) continue
    if (heading.text.length === 0) continue
    entries.push({ depth: heading.level - minLevel, heading })
  }

  if (entries.length === 0) return null

  const tagName = opts.style === "nestedOrderedList" ? "ol" : "ul"
  const root = element(tagName, "toc-block-list")
  const stack: { list: Element; lastItem: Element | null }[] = [{ list: root, lastItem: null }]

  for (const entry of entries) {
    // Obsidian indents by `level - minLevel` tabs, so a jump from h2 straight
    // to h4 nests by two. A list can only ever open one level at a time, so
    // clamp rather than invent empty wrapper items.
    const depth = Math.min(entry.depth, stack.length)
    while (stack.length - 1 > depth) stack.pop()

    if (depth === stack.length) {
      const parent = stack[stack.length - 1]
      // Only reachable when the previous entry opened an item to nest under.
      if (!parent.lastItem) continue
      const sublist = element(tagName)
      parent.lastItem.children.push(sublist)
      stack.push({ list: sublist, lastItem: null })
    }

    const item = element("li", "toc-block-item", [label(entry.heading, opts)])
    const top = stack[stack.length - 1]
    top.list.children.push(item)
    top.lastItem = item
  }

  return root
}

/** Renders `inlineFirstLevel`. Mirrors `getMarkdownInlineFirstLevelFromHeadings`. */
function renderInline(headings: Heading[], opts: BlockOptions): Element | null {
  const minLevel =
    opts.minLevel > 0 ? opts.minLevel : Math.min(...headings.map((heading) => heading.level))

  const items = headings.filter(
    (heading) =>
      heading.level === minLevel && heading.text.length > 0 && isAllowed(heading.text, opts),
  )
  if (items.length === 0) return null

  const container = element("span", "toc-block-inline")
  items.forEach((heading, index) => {
    if (index > 0) container.children.push(text(" | "))
    container.children.push(label(heading, opts))
  })
  return container
}

/**
 * Renders the `title` option, which accepts Markdown.
 *
 * Parsed with a bare remark rather than the page's own processor, so the
 * site-wide smartypants pass does not reach it — straight quotes in a title
 * stay straight.
 */
function renderTitle(title: string, inline: boolean): ElementContent[] {
  if (title.length === 0) return []
  const root = toHast(unified().use(remarkParse).parse(title)) as HtmlRoot
  const children = root.children as ElementContent[]
  const only = children[0]
  if (inline && children.length === 1 && only.type === "element" && only.tagName === "p") {
    return only.children as ElementContent[]
  }
  return [element("div", "toc-block-title", children)]
}

export const TableOfContentsBlock: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }

  return {
    name: "TableOfContentsBlock",
    markdownPlugins() {
      return [
        () => {
          return (tree: MdRoot, file) => {
            const blocks: StoredBlock[] = []

            // Swapped out here, in the markdown phase, so the fence never
            // reaches rehype-pretty-code and get highlighted as source.
            visit(tree, "code", (node: Code, index, parent) => {
              if (!node.lang || !opts.languages.includes(node.lang)) return
              if (!parent || index === undefined) return

              let stored: StoredBlock
              try {
                stored = { options: parseBlockOptions(node.value, opts.defaults), error: null }
              } catch (err) {
                stored = { options: null, error: (err as Error).message }
              }

              parent.children[index] = {
                type: "paragraph",
                children: [],
                data: {
                  hName: "div",
                  hProperties: {
                    className: ["toc-block"],
                    "data-toc-block": String(blocks.push(stored) - 1),
                  },
                },
              }
            })

            file.data.tocBlocks = blocks
          }
        },
      ]
    },
    htmlPlugins() {
      return [
        () => {
          return (tree: HtmlRoot, file) => {
            const blocks = file.data.tocBlocks
            if (!blocks || blocks.length === 0) return

            const placeholders: Element[] = []
            const titleHeadings = new Set<Element>()

            visit(tree, "element", (node: Element) => {
              const classes = (node.properties?.className ?? []) as string[]
              if (!Array.isArray(classes) || !classes.includes("toc-block")) return
              placeholders.push(node)
              // A Markdown `title` may itself be a heading. It is not part of
              // the page's outline, so keep it out of every block's listing.
              visit(node, "element", (child: Element) => {
                if (/^h[1-6]$/.test(child.tagName)) titleHeadings.add(child)
              })
            })

            if (placeholders.length === 0) return

            const headings: Heading[] = []
            visit(tree, "element", (node: Element) => {
              if (!/^h[1-6]$/.test(node.tagName)) return
              if (titleHeadings.has(node)) return
              const classes = (node.properties?.className ?? []) as string[]
              // The footnotes plugin injects a visually hidden "Footnotes"
              // heading that is not part of the note.
              if (Array.isArray(classes) && classes.includes("sr-only")) return
              const id = node.properties?.id
              if (typeof id !== "string") return
              headings.push({ level: Number(node.tagName[1]), text: toString(node).trim(), id })
            })

            placeholders.forEach((node, ordinal) => {
              const raw = node.properties?.dataTocBlock ?? node.properties?.["data-toc-block"]
              const index = Number.parseInt(String(raw ?? ordinal), 10)
              const block = blocks[Number.isNaN(index) ? ordinal : index]
              if (!block) return

              if (block.error || !block.options) {
                node.children = [
                  element("p", "toc-block-error", [
                    text(`Could not render table of contents (${block.error})`),
                  ]),
                ]
                return
              }

              const options = block.options
              const inline = options.style === "inlineFirstLevel"
              const body =
                headings.length === 0
                  ? null
                  : inline
                    ? renderInline(headings, options)
                    : renderList(headings, options)

              if (!body) {
                if (options.hideWhenEmpty) {
                  node.children = []
                  node.properties = {
                    ...node.properties,
                    className: ["toc-block", "toc-block-hidden"],
                  }
                  return
                }
                node.children = [
                  ...renderTitle(options.title, inline),
                  element("p", "toc-block-empty", [
                    element("em", undefined, [text("Table of contents: no headings found")]),
                  ]),
                ]
                return
              }

              node.children = [...renderTitle(options.title, inline), body]
            })
          }
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap {
    tocBlocks: StoredBlock[]
  }
}
