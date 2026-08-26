import { Element, Root } from "hast"
import { visit } from "unist-util-visit"
import { GlobalConfiguration } from "../cfg"
import { QuartzPluginData } from "../plugins/vfile"
import { FullSlug, resolveRelative } from "../util/path"
import { formatDate, getDate } from "./Date"
import { byDateAndAlphabetical } from "./PageList"
import { QuartzComponentProps } from "./types"

function element(tagName: string, className: string, children: Element["children"] = []): Element {
  return {
    type: "element",
    tagName,
    properties: { className: [className] },
    children,
  }
}

function text(value: string): Element["children"][number] {
  return { type: "text", value }
}

function renderTags(slug: FullSlug, tags: string[]): Element | undefined {
  if (tags.length === 0) return undefined

  const list = element("ul", "recent-notes-tags")
  for (const tag of tags) {
    const link: Element = {
      type: "element",
      tagName: "a",
      properties: {
        className: ["internal", "tag-link"],
        href: resolveRelative(slug, `tags/${tag}` as FullSlug),
      },
      children: [text(tag)],
    }
    list.children.push({
      type: "element",
      tagName: "li",
      properties: {},
      children: [link],
    })
  }

  return list
}

function renderItem(
  page: QuartzPluginData,
  cfg: GlobalConfiguration,
  slug: FullSlug,
  showDate: boolean,
  showTags: boolean,
): Element {
  const item = element("li", "recent-notes-item")

  item.children.push({
    type: "element",
    tagName: "a",
    properties: {
      className: ["internal", "recent-notes-title"],
      href: resolveRelative(slug, page.slug!),
    },
    children: [text(page.frontmatter?.title ?? page.slug!)],
  })

  const date = getDate(cfg, page)
  if (showDate && date) {
    item.children.push({
      type: "element",
      tagName: "time",
      properties: {
        className: ["recent-notes-date"],
        datetime: date.toISOString(),
      },
      children: [text(formatDate(date, cfg.locale))],
    })
  }

  if (showTags) {
    const tags = renderTags(slug, page.frontmatter?.tags ?? [])
    if (tags) item.children.push(tags)
  }

  return item
}

/**
 * Fills in the placeholders left behind by the RecentNotesBlock transformer.
 *
 * Runs at render time because this is the first point where every page's dates
 * are known. Ordering comes from `byDateAndAlphabetical`, the same sort the
 * built-in RecentNotes component uses, so an in-body list and a sidebar list
 * cannot disagree.
 */
export function renderRecentNotes(
  root: Root,
  cfg: GlobalConfiguration,
  slug: FullSlug,
  componentData: QuartzComponentProps,
) {
  visit(root, "element", (node: Element) => {
    if (node.tagName !== "div") return

    // mdast -> hast normalises `data-limit` into `dataLimit`, so read the
    // camelCased form. renderTranscludes can use the dashed keys because its
    // placeholder is built during the html phase, which skips that step.
    const properties = node.properties ?? {}
    if (properties.dataRecentNotes === undefined) return

    const limit = Number.parseInt(String(properties.dataLimit ?? "10"), 10)
    const showDate = String(properties.dataShowDate ?? "true") === "true"
    const showTags = String(properties.dataShowTags ?? "false") === "true"

    const pages = componentData.allFiles
      .filter((page) => page.slug !== undefined && page.slug !== slug)
      .sort(byDateAndAlphabetical(cfg))
      .slice(0, Number.isFinite(limit) && limit > 0 ? limit : 10)

    if (pages.length === 0) {
      node.children = [element("p", "recent-notes-empty", [text("No notes found.")])]
      return
    }

    const list = element("ul", "recent-notes-list")
    for (const page of pages) {
      list.children.push(renderItem(page, cfg, slug, showDate, showTags))
    }

    node.children = [list]
  })
}
