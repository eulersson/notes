# Customizations

This site is Quartz 5 with a layer of custom code on top.
The custom code is compiled together with Quartz, like in Quartz 4: there are no separate plugin repositories.

## Branches

| Branch   | What it holds                                                             |
| -------- | ------------------------------------------------------------------------- |
| `v5`     | Upstream Quartz (`upstream/v5`), untouched                                |
| `custom` | `v5` plus the customizations below, no notes                              |
| `main`   | `custom` plus `content/`; Cloudflare Pages deploys it (see DEPLOYMENT.md) |
| `v4`     | Upstream Quartz 4, kept for history                                       |

## Upgrading Quartz

```sh
git fetch upstream
git checkout v5 && git merge --ff-only upstream/v5 && git push origin v5
git checkout custom && git merge v5
npm install
npx tsc --noEmit && npm test
git push origin custom
git checkout main && git pull && git merge custom
npx quartz build --serve   # look at the site with the notes
git push origin main
```

Merge rather than running `npx quartz upgrade`, which pulls upstream into whatever branch is checked out.

When upstream bumps dependencies, `package.json` and `package-lock.json` conflict.
Take upstream's versions and add the custom dependencies back:

```sh
git checkout --theirs package.json package-lock.json
npm install @ffmpeg-installer/ffmpeg hast-util-to-string mdast-util-to-hast
npm install --save-dev remark-breaks
git add package.json package-lock.json
```

## Where things live

| Customization                                                         | Where                                                                                              |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Site settings, Quartz plugins and their layout                        | `quartz.config.yaml`                                                                               |
| Custom plugins added to the build, "Recent" sidebar                   | `quartz.ts`                                                                                        |
| Transformers (captions, small text, Tibetan, lightbox, video, blocks) | `quartz/plugins/transformers/`                                                                     |
| Video posters                                                         | `quartz/plugins/emitters/videoPosters.ts`, `quartz/util/video.ts`, cached in `posters/`            |
| Social preview images (Tokyo Night colors, Tibetan text)              | `quartz/plugins/emitters/ogImages.ts`, `quartz/static/ddc_uchen.ttf`                               |
| "Recent" sidebar                                                      | `quartz/components/RecentNotes.tsx`, `styles/recentNotes.scss`, `scripts/recentNotes.inline.ts`    |
| ` ```recent-notes ` blocks                                            | `quartz/plugins/transformers/recentNotes.ts`, rendered by `quartz/components/renderRecentNotes.ts` |
| URLs without dashes or quotes                                         | `quartz/util/path.ts`, `quartz/util/ctx.ts`                                                        |
| Transcluding sections of the same note                                | `quartz/components/renderPage.tsx`                                                                 |
| `.html` attachments served as pages                                   | `quartz/plugins/emitters/assets.ts`                                                                |
| Google Analytics consent mode                                         | `quartz/plugins/emitters/componentResources.ts`                                                    |
| Styles: Tibetan font, highlights, text size, mobile drawer            | `quartz/styles/custom.scss`, `quartz/styles/tibetan.scss`                                          |
| Tokyo Night colors, matched to the Obsidian vault's Style Settings    | theme colors in `quartz.config.yaml`, the rest in `quartz/styles/custom.scss`                      |

Quartz's own components (Explorer, Search, Graph, …) are npm plugins now.
Their source is no longer in this repository, so they are adjusted through options in `quartz.config.yaml` and CSS in `custom.scss`.
`custom.scss` is not in Quartz's CSS layer, so its rules win over the plugins' rules whatever their specificity.

## What to check after an upgrade

- `npx tsx --test quartz/util/path.test.ts`: the URL rules wrap functions that `quartz/util/path.ts` re-exports from `@quartz-community/utils`.
- `quartz.ts` places the custom transformers next to ObsidianFlavoredMarkdown, Description, Latex and Assets by name, and stops the build if one of them is missing.
- Captions under embedded videos (`![[clip.mp4|caption]]`): `MediaCaptions` reads the `wikilink` nodes of ObsidianFlavoredMarkdown.
- Social preview images, e.g. `public/tibetan-language/diary/2026-11-og-image.webp`: `quartz.ts` puts `OgImages` in the og-image plugin's place, keeping that plugin's `<meta>` tags.
  `OgImages` keeps the plugin's emitter name, `CustomOgImages`, which `quartz/components/Head.tsx` looks for to leave out its default image tags.
- Breadcrumbs on notes whose names contain dashes or quotes, e.g. "Thought — Buddha Nature and Jesus".
- On a phone: the Explorer drawer, with "Recent" docked at its bottom.

Avoid en/em dashes and quotes in folder names.
Folder pages and breadcrumbs work out folder paths with Quartz's stock rules, which keep those characters, so such a folder would not list its notes.
