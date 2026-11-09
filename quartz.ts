import { loadQuartzConfig, loadQuartzLayout } from "./quartz/plugins/loader/config-loader"
import * as Plugin from "./quartz/plugins"
import RecentNotes from "./quartz/components/RecentNotes"
import { QuartzComponent } from "./quartz/components/types"

// Site settings and Quartz's plugins live in quartz.config.yaml. This file adds what YAML can't:
// the custom plugins and components in this repository (they are compiled with Quartz itself),
// and options that are functions.

const config = await loadQuartzConfig()

// Custom transformers, each placed relative to a plugin from quartz.config.yaml (by plugin name).
const { transformers, emitters } = config.plugins
insert(transformers, { before: "ObsidianFlavoredMarkdown" }, [
  // keeps the caption of an embedded video/audio, which ObsidianFlavoredMarkdown would drop
  Plugin.MediaCaptions(),
])
insert(transformers, { before: "Description" }, [
  // ,,small text,, — before Description, so the page description and search text lose the
  // delimiters
  Plugin.SmallText(),
])
insert(transformers, { after: "Latex" }, [
  Plugin.Tibetan(),
  Plugin.ImageCaptions(),
  Plugin.Lightbox(),
  Plugin.VideoEmbed(),
  Plugin.RecentNotesBlock(),
  // Must stay after Links: its html pass reads the heading ids, and keeps its own anchors out of
  // the link rewriter (which would attach hover popovers).
  Plugin.TableOfContentsBlock(),
])
insert(emitters, { after: "Assets" }, [Plugin.VideoPosters()])
// Social preview images in the site's Tokyo Night colors, with Tibetan text: OgImages draws
// them in place of the og-image plugin, whose <meta> tags it keeps.
const ogImages = emitters.findIndex((plugin) => plugin.name === "CustomOgImages")
if (ogImages === -1) {
  throw new Error(`quartz.ts: can't replace the social images: the og-image plugin is not enabled`)
}
emitters[ogImages] = Plugin.OgImages(emitters[ogImages])

export default config

// The "Recent" list at the bottom of the left sidebar, on every page type that has one.
const recentNotes = RecentNotes({
  title: "Recent",
  limit: 10,
  showTags: false,
  // the home page re-dates itself on every publish, so it would sit at the top permanently
  filter: (f) => f.slug !== "index",
})
const withRecentNotes = (left: QuartzComponent[]) => [...left, recentNotes]

const yamlLayout = await loadQuartzLayout()
export const layout = await loadQuartzLayout({
  defaults: { left: withRecentNotes(yamlLayout.defaults.left ?? []) },
  // page types whose left sidebar differs from the default (folder and tag pages leave out
  // reader mode); the 404 page has an empty one and stays that way
  byPageType: Object.fromEntries(
    Object.entries(yamlLayout.byPageType)
      .filter(([, pageLayout]) => (pageLayout.left?.length ?? 0) > 0)
      .map(([pageType, pageLayout]) => [pageType, { left: withRecentNotes(pageLayout.left!) }]),
  ),
})

function insert<T extends { name: string }>(
  list: T[],
  where: { before: string } | { after: string },
  plugins: T[],
) {
  const target = "before" in where ? where.before : where.after
  const index = list.findIndex((plugin) => plugin.name === target)
  if (index === -1) {
    throw new Error(
      `quartz.ts: can't place ${plugins.map((p) => p.name).join(", ")}: no "${target}" plugin is enabled`,
    )
  }
  list.splice("before" in where ? index : index + 1, 0, ...plugins)
}
