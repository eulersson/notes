# Deployment

`notes.ramn.dev` is built and served by **Cloudflare Pages**, connected to
`github.com/eulersson/notes` through the Git integration. Every push to `main`
triggers a build.

Content is not hand-edited in this repository. The
[obsidian-github-exporter](https://github.com/eulersson/obsidian-github-exporter)
Obsidian plugin writes every note marked `publish: true` into `content/` via the
GitHub API, producing one `Update published content` commit per publish.

## Cloudflare Pages settings

| Setting                | Value                                       |
| ---------------------- | ------------------------------------------- |
| Production branch      | `main`                                      |
| Build output directory | `public`                                    |
| Build command          | see below — **not** the default `npx quartz build` |

### Build command

```sh
if [ "$(git rev-parse --is-shallow-repository)" = "true" ]; then git fetch --unshallow; fi && npx quartz build
```

**The deepening step is required.** Cloudflare Pages clones the repository
shallow (`--depth=1`), so the build only ever sees the tip commit. Quartz's
`CreatedModifiedDate` transformer resolves each note's date from *the last
commit that touched this file*, and in a one-commit clone that is the same
commit for every file — so without the unshallow, **every note on the site is
dated at deploy time**.

The `if` guard keeps the build working should the clone ever arrive complete: a
bare `git fetch --unshallow` exits non-zero on a non-shallow repository and
would fail the build.

The cost is small. The shallow clone already carries all ~300 MB of
`content/Attachments`, so deepening pulls only historical blobs — measured at
+62 MB and +43 s.

## How note dates are resolved

`quartz.config.ts` sets `defaultDateType: "modified"` and:

```ts
Plugin.CreatedModifiedDate({ priority: ["frontmatter", "git", "filesystem"] })
```

so the date rendered on a page is `modified`, resolved in this order:

1. **frontmatter** — `modified`, `lastmod`, `updated` or `last-modified`
   (`created` / `date` for the created date). Nothing sets these today.
2. **git** — what the site actually uses. Note that the `git` source only ever
   fills `modified`; it never provides `created`.
3. **filesystem** — mtime, which on Cloudflare is checkout time, i.e. useless.

Two consequences of relying on git:

- Dates are **publish times, not writing times** — when the exporter committed
  the note, not when it was written in Obsidian.
- Dates are **committer** times, not author times (`@napi-rs/simple-git`'s
  `getFileLatestModifiedDate` offers no choice), so any history rewrite resets
  them. A rewrite on 2026-07-05 flattened the committer date of 149 of the 184
  notes in `content/` onto that single day, even though their author dates
  still span 2025-11 → 2026-08. Avoid rebasing `main`.

To decouple the dates from git history entirely, put `created` / `updated` in
the notes' frontmatter — `frontmatter` outranks `git` in the priority list
above, and the exporter copies frontmatter through verbatim.

## Verifying a deploy

`index.xml` carries the resolved dates and is the fastest check:

```sh
curl -s https://notes.ramn.dev/index.xml | grep -oE '<pubDate>[^<]*</pubDate>' | sort -u
```

Several distinct values means the history is deep enough. A **single** value,
equal to the tip commit's timestamp, means the build ran against a shallow
clone again — check the build command first.

> [!NOTE]
> Notes with no prose (a lone image embed, say) render no date line at all:
> `ContentMeta` returns nothing when the page has no text. Their dates are
> still correct in `index.xml` and the sitemap.
