import { QuartzTransformerPlugin } from "../types"
import { Element, ElementContent, Root, Text } from "hast"
import { toString } from "hast-util-to-string"

// Renders `,,small text,,` as `<small>small text</small>`. Mirrors the
// obsidian-small-text plugin, which does the same in Obsidian's reading view.

const DELIMITER = ",,"

// Stands in for anything that is not plain text (inline code, a link, bold
// text…) when scanning, so a span can wrap it but never find a delimiter inside it.
const PLACEHOLDER = "￼"

const SKIPPED_TAGS = new Set(["code", "pre", "kbd", "script", "style", "svg", "math"])

interface SmallSpan {
  /** Offset of the opening delimiter. */
  from: number
  /** Offset just past the closing delimiter. */
  to: number
}

interface TextPosition {
  index: number
  offset: number
}

interface TextRun {
  index: number
  /** Offsets of the node's text within its parent's flattened text. */
  start: number
  end: number
}

export const SmallText: QuartzTransformerPlugin = () => {
  return {
    name: "SmallText",
    htmlPlugins() {
      return [() => (tree: Root) => wrapSmallText(tree)]
    },
  }
}

export function wrapSmallText(node: Root | Element) {
  if (node.type === "element" && isSkipped(node)) return
  if (!toString(node).includes(DELIMITER)) return

  wrapSpans(node.children as ElementContent[])

  // Also visits the new <small> elements, which may hold spans nested in bold text and the like.
  for (const child of node.children) {
    if (child.type === "element") wrapSmallText(child)
  }
}

function isSkipped(element: Element): boolean {
  const className = element.properties?.className
  return (
    SKIPPED_TAGS.has(element.tagName) ||
    (Array.isArray(className) && className.some((name) => String(name).startsWith("katex")))
  )
}

/**
 * Find every `,,small text,,` span in `text`.
 *
 * Like `**bold**`, the opening delimiter must be followed, and the closing one
 * preceded, by something other than whitespace or a comma, so `a ,, b` and `,,,`
 * stay literal. Spans never cross a line break and do not nest.
 */
export function findSmallSpans(text: string): SmallSpan[] {
  const spans: SmallSpan[] = []
  let open = text.indexOf(DELIMITER)

  while (open !== -1) {
    const close = canOpen(text, open) ? findClose(text, open + DELIMITER.length) : -1
    if (close === -1) {
      open = text.indexOf(DELIMITER, open + 1)
    } else {
      spans.push({ from: open, to: close + DELIMITER.length })
      open = text.indexOf(DELIMITER, close + DELIMITER.length)
    }
  }

  return spans
}

function canOpen(text: string, at: number): boolean {
  const after = text.charAt(at + DELIMITER.length)
  return text.charAt(at - 1) !== "," && after !== "" && !isBoundary(after)
}

/** Offset of the delimiter closing a span whose content starts at `from`, or -1. */
function findClose(text: string, from: number): number {
  const lineEnd = text.indexOf("\n", from)
  const limit = lineEnd === -1 ? text.length : lineEnd

  // Content is at least one character long.
  let at = text.indexOf(DELIMITER, from + 1)
  while (at !== -1 && at + DELIMITER.length <= limit) {
    if (!isBoundary(text.charAt(at - 1))) return at
    at = text.indexOf(DELIMITER, at + 1)
  }

  return -1
}

function isBoundary(char: string): boolean {
  return char === "," || /\s/.test(char)
}

/** Wrap the spans formed by a parent's own children, so a span can reach across `**bold**` or a link. */
function wrapSpans(children: ElementContent[]) {
  const runs: TextRun[] = []
  let flat = ""

  children.forEach((child, index) => {
    if (child.type === "text") {
      runs.push({ index, start: flat.length, end: flat.length + child.value.length })
      flat += child.value
    } else if (child.type === "element") {
      flat += child.tagName === "br" ? "\n" : PLACEHOLDER
    }
  })

  // Later spans first: splicing them out leaves the indices and offsets
  // recorded for earlier spans untouched.
  for (const span of findSmallSpans(flat).reverse()) {
    const open = locate(runs, span.from)
    const close = locate(runs, span.to - DELIMITER.length)
    if (open && close) wrap(children, open, close)
  }
}

/** Position of the delimiter at `offset`, unless it straddles two text nodes. */
function locate(runs: TextRun[], offset: number): TextPosition | undefined {
  const run = runs.find((r) => r.start <= offset && offset + DELIMITER.length <= r.end)
  return run && { index: run.index, offset: offset - run.start }
}

function wrap(children: ElementContent[], open: TextPosition, close: TextPosition) {
  const openText = (children[open.index] as Text).value
  const closeText = (children[close.index] as Text).value
  const contentStart = open.offset + DELIMITER.length

  const content =
    open.index === close.index
      ? [text(openText.slice(contentStart, close.offset))]
      : [
          text(openText.slice(contentStart)),
          ...children.slice(open.index + 1, close.index),
          text(closeText.slice(0, close.offset)),
        ]

  const small: Element = {
    type: "element",
    tagName: "small",
    properties: {},
    children: content.filter(isNotEmpty),
  }

  children.splice(
    open.index,
    close.index - open.index + 1,
    ...[
      text(openText.slice(0, open.offset)),
      small,
      text(closeText.slice(close.offset + DELIMITER.length)),
    ].filter(isNotEmpty),
  )
}

function text(value: string): Text {
  return { type: "text", value }
}

function isNotEmpty(node: ElementContent): boolean {
  return node.type !== "text" || node.value !== ""
}
