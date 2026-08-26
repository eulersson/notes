/**
 * Extensions that Obsidian Flavored Markdown turns into `<video>` embeds.
 * Keep in sync with the embed branch in `plugins/transformers/ofm.ts`.
 */
export const videoExtensions = [".mp4", ".webm", ".ogv", ".mov", ".mkv"]

/** Suffix shared by every generated poster, so they're easy to spot in `public/`. */
export const posterSuffix = ".poster.webp"

/**
 * Poster companion for a video asset, e.g.
 * `attachments/lo-mantang-sakar-zang.mp4` -> `attachments/lo-mantang-sakar-zang.poster.webp`
 *
 * Any `?query` or `#fragment` is preserved so media fragments keep working.
 */
export function posterPath(videoPath: string): string {
  const [base, suffix = ""] = splitSuffix(videoPath)
  return base.replace(/\.[^./]+$/, "") + posterSuffix + suffix
}

/** True if the path (ignoring query/fragment) points at something we embed as video. */
export function isVideoPath(fp: string): boolean {
  const [base] = splitSuffix(fp)
  return videoExtensions.some((ext) => base.toLowerCase().endsWith(ext))
}

function splitSuffix(fp: string): [string, string] {
  const cut = fp.search(/[?#]/)
  return cut === -1 ? [fp, ""] : [fp.slice(0, cut), fp.slice(cut)]
}
