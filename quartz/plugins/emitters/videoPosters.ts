import path from "path"
import fs from "fs"
import { execFile } from "child_process"
import { promisify } from "util"
import sharp from "sharp"
import { FilePath, joinSegments, slugifyFilePath } from "../../util/path"
import { QuartzEmitterPlugin } from "../types"
import { glob } from "../../util/glob"
import { Argv } from "../../util/ctx"
import { QuartzConfig } from "../../cfg"
import { isVideoPath, posterPath } from "../../util/video"

const execFileAsync = promisify(execFile)

interface Options {
  /** Seconds into the clip to grab the still from. Falls back to frame 0 if the clip is shorter. */
  seekSeconds: number
  /** Longest edge of the generated poster, in pixels. */
  maxSize: number
  /** WebP quality, 1-100. */
  quality: number
  /**
   * Directory (relative to the repo root) where posters are cached between builds.
   * Commit it: CI hosts have no ffmpeg, and a cached poster is used verbatim there.
   */
  cacheDir: string
}

const defaultOptions: Options = {
  seekSeconds: 1,
  maxSize: 720,
  quality: 72,
  cacheDir: "posters",
}

let ffmpegBin: string | null | undefined = undefined

/** Locate an ffmpeg we can call, preferring a bundled static build over PATH. */
async function findFfmpeg(): Promise<string | null> {
  if (ffmpegBin !== undefined) return ffmpegBin

  const candidates: string[] = []
  // Optional dependencies, so the specifiers stay non-literal and aren't bundled.
  // Install one of these to get posters generated on a CI host that has no ffmpeg:
  // `@ffmpeg-installer/ffmpeg` ships the binary as a platform-matched npm package
  // (same trick sharp uses), `ffmpeg-static` downloads it from GitHub on install.
  for (const specifier of ["@ffmpeg-installer/ffmpeg", "ffmpeg-static"]) {
    try {
      const mod = await import(specifier)
      const resolved = mod.default ?? mod
      const bin = (typeof resolved === "string" ? resolved : resolved?.path) as string | null
      if (bin) candidates.push(bin)
    } catch {
      // not installed, try the next one
    }
  }
  candidates.push("ffmpeg")

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["-version"])
      ffmpegBin = candidate
      return ffmpegBin
    } catch {
      continue
    }
  }

  ffmpegBin = null
  return ffmpegBin
}

/** Decode a single frame to PNG on stdout. ffmpeg applies any rotation matrix for us. */
async function grabFrame(ffmpeg: string, src: string, seek: number): Promise<Buffer> {
  const { stdout } = await execFileAsync(
    ffmpeg,
    // -ss before -i seeks by keyframe, which is both fast and enough for a thumbnail
    [
      "-v",
      "error",
      "-ss",
      String(seek),
      "-i",
      src,
      "-frames:v",
      "1",
      "-f",
      "image2",
      "-c:v",
      "png",
      "-",
    ],
    { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
  )
  return stdout as unknown as Buffer
}

/** Write `<cacheDir>/<slug>` for a video, returning false if no frame could be extracted. */
async function generatePoster(
  srcVideo: string,
  destPoster: string,
  opts: Options,
): Promise<boolean> {
  const ffmpeg = await findFfmpeg()
  if (!ffmpeg) return false

  let frame: Buffer | undefined
  for (const seek of [opts.seekSeconds, 0]) {
    try {
      const out = await grabFrame(ffmpeg, srcVideo, seek)
      if (out.length > 0) {
        frame = out
        break
      }
    } catch {
      continue
    }
  }
  if (!frame) return false

  await fs.promises.mkdir(path.dirname(destPoster), { recursive: true })
  await sharp(frame)
    .resize({ width: opts.maxSize, height: opts.maxSize, fit: "inside", withoutEnlargement: true })
    .webp({ quality: opts.quality })
    .toFile(destPoster)
  return true
}

const videosToPoster = async (argv: Argv, cfg: QuartzConfig) =>
  (await glob("**", argv.directory, ["**/*.md", ...cfg.configuration.ignorePatterns])).filter(
    isVideoPath,
  )

export const VideoPosters: QuartzEmitterPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  let warnedNoFfmpeg = false

  /**
   * Produce (or reuse) the poster for one video and copy it into the output dir.
   * Returns the emitted path, or null when no poster could be produced — callers
   * treat that as "leave the video as-is", which is the pre-plugin behaviour.
   */
  const emitPoster = async (argv: Argv, fp: FilePath): Promise<FilePath | null> => {
    const srcVideo = joinSegments(argv.directory, fp) as FilePath
    const slug = posterPath(slugifyFilePath(fp))
    const cached = path.join(process.cwd(), opts.cacheDir, slug)

    let usable = fs.existsSync(cached)
    // Regenerate when the video is newer than its poster, but only if we can: on a
    // fresh clone every mtime is checkout time, so a stale-looking poster beats none.
    if (usable) {
      const [video, poster] = await Promise.all([
        fs.promises.stat(srcVideo),
        fs.promises.stat(cached),
      ])
      if (video.mtimeMs > poster.mtimeMs && (await findFfmpeg())) usable = false
    }

    if (!usable && !(await generatePoster(srcVideo, cached, opts))) {
      if (!(await findFfmpeg()) && !warnedNoFfmpeg) {
        warnedNoFfmpeg = true
        console.warn(
          `\nVideoPosters: ffmpeg not found, so videos without a cached poster in \`${opts.cacheDir}/\` render without one.`,
        )
      }
      return null
    }

    const dest = joinSegments(argv.output, slug) as FilePath
    await fs.promises.mkdir(path.dirname(dest), { recursive: true })
    await fs.promises.copyFile(cached, dest)
    return dest
  }

  return {
    name: "VideoPosters",
    async *emit({ argv, cfg }) {
      for (const fp of await videosToPoster(argv, cfg)) {
        const dest = await emitPoster(argv, fp)
        if (dest) yield dest
      }
    },
    async *partialEmit(ctx, _content, _resources, changeEvents) {
      for (const changeEvent of changeEvents) {
        if (!isVideoPath(changeEvent.path)) continue
        const slug = posterPath(slugifyFilePath(changeEvent.path))

        if (changeEvent.type === "delete") {
          await Promise.all(
            [
              joinSegments(ctx.argv.output, slug),
              path.join(process.cwd(), opts.cacheDir, slug),
            ].map((fp) => fs.promises.rm(fp, { force: true })),
          )
          continue
        }

        const dest = await emitPoster(ctx.argv, changeEvent.path)
        if (dest) yield dest
      }
    },
  }
}
