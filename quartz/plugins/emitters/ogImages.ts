import fs from "fs"
import path from "path"
import { styleText } from "util"
import sharp, { type OverlayOptions } from "sharp"
import { QuartzEmitterPluginInstance } from "../types"
import { BuildCtx } from "../../util/ctx"
import { FullSlug, QUARTZ, joinSegments } from "../../util/path"
import { unescapeHTML } from "../../util/escape"
import { QuartzPluginData } from "../vfile"
import { write } from "./helpers"

// Social preview images (`<slug>-og-image.webp`) in the site's Tokyo Night colors, with Tibetan.
//
// It takes the place of the og-image plugin's emitter (see quartz.ts) and keeps that plugin's
// <meta> tags. The plugin draws with Satori, which only has the Latin theme fonts and can't
// shape Tibetan stacks; here the text is drawn by sharp's text renderer (Pango and HarfBuzz),
// with DDC Uchen, the site's Tibetan font, as the fallback for Tibetan characters.

// Pango finds the font files given to sharp through fontconfig, its default on Linux. On macOS it
// draws through Core Text, which ignores them, so ask for fontconfig there too. Read when the
// first text is drawn.
process.env.PANGOCAIRO_BACKEND ??= "fc"

const WIDTH = 1200
const HEIGHT = 630
const PAD = 72
const CONTENT_WIDTH = WIDTH - 2 * PAD

// The dark Tokyo Night colors of quartz.config.yaml and custom.scss
const colors = {
  background: "#222436",
  text: "#c8d3f5",
  muted: "#828bb8",
  border: "#3b4261",
  title: "#82aaff",
  tag: "#c099ff",
  headings: ["#82aaff", "#ffc777", "#c3e88d", "#4fd6be", "#c099ff", "#fca7ea"],
}

const TIBETAN_FAMILY = "DDC Uchen"
// sharp needs absolute paths to font files
const TIBETAN_FONT = path.resolve(QUARTZ, "static", "ddc_uchen.ttf")
// Tibetan looks small next to Latin at the same size; the site draws it at 1.5em
const TIBETAN_SCALE = 1.3

type Fonts = { header: string; body: string }

/** The theme's Google Fonts as TTF files (sharp needs a path), cached like the og-image plugin's. */
async function fetchTtf(family: string, weight: number): Promise<string | undefined> {
  const name = family.replaceAll(" ", "+")
  const cached = path.resolve(QUARTZ, ".quartz-cache", "fonts", `${name}-${weight}`)
  if (fs.existsSync(cached)) return cached
  try {
    // without a browser user agent, Google Fonts links TTF files
    const css = await (
      await fetch(`https://fonts.googleapis.com/css2?family=${name}:wght@${weight}`)
    ).text()
    const url = css.match(/url\((https:\/\/fonts\.gstatic\.com\/s\/.*?\.ttf)\)/)?.[1]
    if (!url) return undefined
    const data = Buffer.from(await (await fetch(url)).arrayBuffer())
    await fs.promises.mkdir(path.dirname(cached), { recursive: true })
    await fs.promises.writeFile(cached, data)
    return cached
  } catch {
    return undefined
  }
}

let fontsReady: Promise<Fonts> | undefined

/**
 * Registers the fonts with the text renderer, once per build. A font file given to sharp stays
 * registered for the rest of the process, so later text can name its family, and Pango falls
 * back to DDC Uchen for the Tibetan characters other fonts lack.
 */
function loadFonts(ctx: BuildCtx): Promise<Fonts> {
  fontsReady ??= (async () => {
    const { header, body } = ctx.cfg.configuration.theme.typography
    const fonts = {
      header: typeof header === "string" ? header : header.name,
      body: typeof body === "string" ? body : body.name,
    }
    const files = await Promise.all([
      fetchTtf(fonts.header, 700),
      fetchTtf(fonts.body, 400),
      fetchTtf(fonts.body, 600),
    ])
    if (files.includes(undefined)) {
      console.warn(
        styleText(
          "yellow",
          "Warning: could not fetch the theme fonts for social images; a system font stands in.",
        ),
      )
    }
    for (const fontfile of [...files, TIBETAN_FONT]) {
      if (fontfile) await sharp({ text: { text: "a", fontfile } }).toBuffer()
    }
    return fonts
  })()
  return fontsReady
}

const escapeMarkup = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")

// The build server has no emoji font, so emoji are left out rather than drawn as empty boxes
// (some descriptions start with "💾 Download:"), each with the space before it, or after it at
// the start.
const EMOJI =
  "(?:\\p{Emoji_Presentation}|\\p{Extended_Pictographic}\\uFE0F)(?:\\p{Emoji_Modifier}|\\u200D|\\uFE0F|\\p{Extended_Pictographic})*"
const emojiPattern = new RegExp(`^${EMOJI}\\s*|\\s?${EMOJI}`, "gu")
const withoutEmoji = (s: string) => s.replace(emojiPattern, "")

/** Pango markup for `text`, with its Tibetan runs in DDC Uchen at a larger size. */
function markup(text: string, color: string, size: number) {
  const tibetanSize = Math.round(size * TIBETAN_SCALE * 1024)
  const body = escapeMarkup(withoutEmoji(text)).replace(
    /[ༀ-࿿]+/g,
    (run) => `<span font_family="${TIBETAN_FAMILY}" size="${tibetanSize}">${run}</span>`,
  )
  return `<span foreground="${color}">${body}</span>`
}

type TextImage = { data: Buffer; width: number; height: number }

/** Draws Pango markup, wrapped to `width`, in lines `lineHeight` pixels apart. */
async function renderText(text: string, font: string, width: number, lineHeight: number) {
  // an absolute line height (in 1024ths of a point, which are pixels at sharp's 72 dpi) keeps
  // lines with taller Tibetan the same height as the rest
  const { data, info } = await sharp({
    text: {
      text: `<span line_height="${lineHeight * 1024}">${text}</span>`,
      font,
      width,
      rgba: true,
      wrap: "word-char",
    },
  })
    .png()
    .toBuffer({ resolveWithObject: true })
  return { data, width: info.width, height: info.height } satisfies TextImage
}

const graphemes = (s: string) => [...new Intl.Segmenter().segment(s)].map((g) => g.segment)

/**
 * Renders `text` in at most `maxLines` lines, cutting it at a grapheme (never inside a Tibetan
 * stack) and adding an ellipsis when it doesn't fit.
 */
async function renderLines(
  text: string,
  toMarkup: (text: string) => string,
  opts: { font: string; width: number; lineHeight: number; maxLines: number },
) {
  const fits = (img: TextImage) => img.height < opts.lineHeight * (opts.maxLines + 0.5)
  const render = (t: string) => renderText(toMarkup(t), opts.font, opts.width, opts.lineHeight)
  const full = await render(text)
  if (fits(full)) return full

  const parts = graphemes(text)
  const cut = (n: number) => parts.slice(0, n).join("").trimEnd() + "…"
  let [lo, hi] = [0, parts.length - 1]
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(await render(cut(mid)))) lo = mid
    else hi = mid - 1
  }
  return render(cut(lo))
}

const svg = (width: number, height: number, body: string) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`,
  )

// Lucide's calendar and clock, as the og-image plugin draws them
const icon = (paths: string) =>
  svg(
    26,
    26,
    `<g transform="scale(${26 / 24})" fill="none" stroke="${colors.muted}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</g>`,
  )
const calendarIcon = icon(
  '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
)
const clockIcon = icon('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>')

function getDate(data: QuartzPluginData): Date | undefined {
  const type = data.defaultDateType as keyof NonNullable<QuartzPluginData["dates"]> | undefined
  return type ? data.dates?.[type] : undefined
}

/** Words per minute as in the reading-time package, which the content-meta plugin uses. */
const readingMinutes = (text: string) =>
  Math.max(1, Math.ceil((text.trim().match(/\S+/g)?.length ?? 0) / 200))

async function renderImage(ctx: BuildCtx, data: QuartzPluginData): Promise<Buffer> {
  const cfg = ctx.cfg.configuration
  const fonts = await loadFonts(ctx)
  const layers: OverlayOptions[] = []

  // a strip of the six heading colors along the top
  const stripe = WIDTH / colors.headings.length
  layers.push({
    input: svg(
      WIDTH,
      8,
      colors.headings
        .map((c, i) => `<rect x="${i * stripe}" width="${stripe}" height="8" fill="${c}"/>`)
        .join(""),
    ),
    left: 0,
    top: 0,
  })

  // site icon and address
  let y = 56
  const iconSize = 52
  const iconPath = joinSegments(QUARTZ, "static", "icon.png")
  if (fs.existsSync(iconPath)) {
    const round = svg(iconSize, iconSize, `<circle cx="26" cy="26" r="26"/>`)
    const siteIcon = await sharp(iconPath)
      .resize(iconSize, iconSize)
      .composite([{ input: round, blend: "dest-in" }])
      .png()
      .toBuffer()
    layers.push({ input: siteIcon, left: PAD, top: y })
  }
  const site = await renderText(
    markup(cfg.baseUrl ?? cfg.pageTitle, colors.muted, 26),
    `${fonts.body} 26`,
    CONTENT_WIDTH,
    32,
  )
  layers.push({
    input: site.data,
    left: PAD + iconSize + 18,
    top: y + (iconSize - site.height) / 2,
  })
  y += iconSize + 30

  // title, with the site's title suffix in the muted color
  const suffix = cfg.pageTitleSuffix ?? ""
  const title = await renderLines(
    data.frontmatter?.title ?? "Untitled",
    (t) => markup(t, colors.title, 58) + markup(suffix, colors.muted, 58),
    { font: `${fonts.header} Bold 58`, width: CONTENT_WIDTH, lineHeight: 70, maxLines: 2 },
  )
  layers.push({ input: title.data, left: PAD, top: y })
  y += title.height + 22

  // description, in as many lines as fit above the footer
  const footerTop = HEIGHT - 112
  const descriptionLineHeight = 48
  const description =
    data.frontmatter?.socialDescription ??
    data.frontmatter?.description ??
    unescapeHTML(data.description?.trim() ?? "")
  const maxLines = Math.floor((footerTop - 20 - y) / descriptionLineHeight)
  if (description && maxLines > 0) {
    const text = await renderLines(description, (t) => markup(t, colors.text, 30), {
      font: `${fonts.body}, ${TIBETAN_FAMILY} 30`,
      width: CONTENT_WIDTH,
      lineHeight: descriptionLineHeight,
      maxLines,
    })
    layers.push({ input: text.data, left: PAD, top: y })
  }

  // footer: a rule, the date and reading time, and the tags on the right
  layers.push({
    input: svg(
      CONTENT_WIDTH,
      2,
      `<rect width="${CONTENT_WIDTH}" height="2" fill="${colors.border}"/>`,
    ),
    left: PAD,
    top: footerTop,
  })
  const rowMiddle = footerTop + 56
  let x = PAD
  const meta: [Buffer, string][] = []
  const date = getDate(data)
  if (date) {
    const formatted = date.toLocaleDateString(cfg.locale, {
      year: "numeric",
      month: "short",
      day: "2-digit",
    })
    meta.push([calendarIcon, formatted])
  }
  meta.push([clockIcon, `${readingMinutes(data.text ?? "")} min read`])
  for (const [glyph, label] of meta) {
    layers.push({ input: glyph, left: x, top: rowMiddle - 13 })
    const text = await renderText(markup(label, colors.muted, 26), `${fonts.body} 26`, 400, 32)
    layers.push({ input: text.data, left: x + 36, top: rowMiddle - text.height / 2 })
    x += 36 + text.width + 36
  }

  // tags, in their order, as many as fit, ending at the right margin
  const pillHeight = 46
  const gap = 12
  const pills: TextImage[] = []
  let pillsWidth = 0
  for (const tag of data.frontmatter?.tags ?? []) {
    const text = await renderText(
      markup(`#${tag}`, colors.tag, 24),
      `${fonts.body} Semi-Bold 24`,
      600,
      30,
    )
    const width = text.width + 30 + (pills.length > 0 ? gap : 0)
    if (x + pillsWidth + width > WIDTH - PAD) break
    pills.push(text)
    pillsWidth += width
  }
  let left = WIDTH - PAD - pillsWidth
  for (const text of pills) {
    const width = text.width + 30
    layers.push({
      input: svg(
        width,
        pillHeight,
        `<rect width="${width}" height="${pillHeight}" rx="10" fill="${colors.tag}" fill-opacity="0.15"/>`,
      ),
      left,
      top: rowMiddle - pillHeight / 2,
    })
    layers.push({ input: text.data, left: left + 15, top: rowMiddle - text.height / 2 })
    left += width + gap
  }

  return sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: colors.background },
  })
    .composite(layers.map((l) => ({ ...l, left: Math.round(l.left!), top: Math.round(l.top!) })))
    .webp({ quality: 80 })
    .toBuffer()
}

async function emitImage(ctx: BuildCtx, data: QuartzPluginData) {
  return write({
    ctx,
    content: await renderImage(ctx, data),
    slug: `${data.slug!}-og-image` as FullSlug,
    ext: ".webp",
  })
}

/** Replaces the og-image plugin's emitter, `original`, keeping its <meta> tags. */
export const OgImages = (original: QuartzEmitterPluginInstance): QuartzEmitterPluginInstance => ({
  // Head.tsx looks for this name to leave out its default og:image tags
  name: "CustomOgImages",
  getQuartzComponents: () => [],
  externalResources: original.externalResources,
  async *emit(ctx, content) {
    for (const [, file] of content) {
      if (file.data.frontmatter?.socialImage !== undefined) continue
      yield emitImage(ctx, file.data)
    }
  },
  async *partialEmit(ctx, _content, _resources, changeEvents) {
    for (const event of changeEvents) {
      const data = event.file?.data
      if (!data || data.frontmatter?.socialImage !== undefined) continue
      if (event.type === "add" || event.type === "change") yield emitImage(ctx, data)
    }
  },
})
