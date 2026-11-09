// Re-export shared path utilities from @quartz-community/utils
export {
  isFilePath,
  isFullSlug,
  isSimpleSlug,
  isRelativeURL,
  isAbsoluteURL,
  getFullSlug,
  simplifySlug,
  joinSegments,
  endsWith,
  trimSuffix,
  stripSlashes,
  getFileExtension,
  isFolderPath,
  getAllSegmentPrefixes,
  pathToRoot,
  resolveRelative,
  splitAnchor,
  transformInternalLink,
  linkPathDecodes,
} from "@quartz-community/utils"

import {
  slugifyFilePath as baseSlugifyFilePath,
  slugTag as baseSlugTag,
  transformLink as baseTransformLink,
  normalizeHastElement as baseNormalizeHastElement,
  isRelativeURL,
  joinSegments,
  resolveRelative,
} from "@quartz-community/utils"
import type { FilePath, FullSlug, RelativeURL, TransformOptions } from "@quartz-community/utils"
import type { Element as HastElement } from "hast"

// --- Custom slug rules ---
//
// On top of Quartz's own rules (lowercase, spaces to hyphens, ...), URLs replace en/em dashes
// with a hyphen and drop straight and curly quotes:
//   "Thought — Buddha Nature.md"           -> thought---buddha-nature
//   "Alexander the Great's Last 3 Wills.md" -> alexander-the-greats-last-3-wills
// These are the URLs the site has always published, so they must not change.
//
// The rule runs on the input before Quartz slugifies it. That gives the same result as running it
// afterwards (the characters involved don't overlap with Quartz's own rules), and it keeps the
// folder-note check (`folder/folder.md` -> `folder/index`) working on the cleaned names.
const customSlugChars = /[–—'"\u2018\u2019\u201C\u201D]/
function applyCustomSlugRules(s: string): string {
  return s.replace(/[–—]/g, "-").replace(/['"\u2018\u2019\u201C\u201D]/g, "")
}

export function slugifyFilePath(fp: FilePath, excludeExt?: boolean): FullSlug {
  return baseSlugifyFilePath(applyCustomSlugRules(fp) as FilePath, excludeExt)
}

// The stock rules, as community plugins compute them with their own bundled copy. For values that
// must match what plugins compute themselves, such as a page's position in the folder tree.
export { baseSlugifyFilePath as stockSlugifyFilePath }

export function slugTag(tag: string): string {
  return baseSlugTag(applyCustomSlugRules(tag))
}

// Community plugins bundle their own copy of the slug code, so links they write (e.g. wikilinks
// from ObsidianFlavoredMarkdown) still use the stock rules. Every internal link passes through
// here, in the built-in link processing, before it is resolved; applying the custom rules to the
// link's path first makes it point at the page's real URL.
export function transformLink(src: FullSlug, target: string, opts: TransformOptions): RelativeURL {
  return baseTransformLink(src, applyCustomSlugRulesToLink(target), opts)
}

function applyCustomSlugRulesToLink(link: string): string {
  // the anchor is left exactly as written; only the path part is a slug
  const hash = link.indexOf("#")
  const rawPath = hash === -1 ? link : link.slice(0, hash)
  const anchor = hash === -1 ? "" : link.slice(hash)
  let decoded: string
  try {
    decoded = decodeURI(rawPath)
  } catch {
    // not valid percent-encoding: Quartz treats it as a literal path
    return customSlugChars.test(rawPath) ? applyCustomSlugRules(rawPath) + anchor : link
  }
  if (!customSlugChars.test(decoded)) return link
  return encodeURI(applyCustomSlugRules(decoded)) + anchor
}

// A transcluded <video> carries a `poster` URL too. Rebase it like `src`/`href`, or it points at a
// 404, which on iOS leaves an empty box: Safari won't preload a frame to fall back on.
export function normalizeHastElement(
  rawEl: HastElement,
  curBase: FullSlug,
  newBase: FullSlug,
): HastElement {
  const el = baseNormalizeHastElement(rawEl, curBase, newBase) as HastElement
  rebasePosters(el, curBase, newBase)
  return el
}

function rebasePosters(el: HastElement, curBase: FullSlug, newBase: FullSlug) {
  const poster = el.properties?.poster
  if (poster !== undefined && poster !== null && isRelativeURL(String(poster))) {
    el.properties.poster = joinSegments(resolveRelative(curBase, newBase), "..", String(poster))
  }
  for (const child of el.children ?? []) {
    if (child.type === "element") rebasePosters(child, curBase, newBase)
  }
}

export type {
  FilePath,
  FullSlug,
  SimpleSlug,
  RelativeURL,
  TransformOptions,
} from "@quartz-community/utils"

// --- v5-specific exports below ---

export const QUARTZ = "quartz"

// from micromorph/src/utils.ts
// https://github.com/natemoo-re/micromorph/blob/main/src/utils.ts#L5
const _rebaseHtmlElement = (el: Element, attr: string, newBase: string | URL) => {
  const rebased = new URL(el.getAttribute(attr)!, newBase)
  el.setAttribute(attr, rebased.pathname + rebased.hash)
}
export function normalizeRelativeURLs(el: Element | Document, destination: string | URL) {
  el.querySelectorAll('[href=""], [href^="./"], [href^="../"]').forEach((item) => {
    _rebaseHtmlElement(item, "href", destination)
  })
  el.querySelectorAll('[src=""], [src^="./"], [src^="../"]').forEach((item) => {
    _rebaseHtmlElement(item, "src", destination)
  })
}
