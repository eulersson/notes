import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { FullSlug, SimpleSlug, resolveRelative } from "../util/path"
import { QuartzPluginData } from "../plugins/vfile"
import { byDateAndAlphabetical } from "./PageList"
import style from "./styles/recentNotes.scss"

// @ts-ignore
import script from "./scripts/recentNotes.inline"
import { Date, getDate } from "./Date"
import { GlobalConfiguration } from "../cfg"
import { i18n } from "../i18n"
import { classNames } from "../util/lang"

interface Options {
  title?: string
  limit: number
  linkToMore: SimpleSlug | false
  showTags: boolean
  filter: (f: QuartzPluginData) => boolean
  sort: (f1: QuartzPluginData, f2: QuartzPluginData) => number
}

const defaultOptions = (cfg: GlobalConfiguration): Options => ({
  limit: 3,
  linkToMore: false,
  showTags: true,
  filter: () => true,
  sort: byDateAndAlphabetical(cfg),
})

let numRecentNotes = 0
export default ((userOpts?: Partial<Options>) => {
  const RecentNotes: QuartzComponent = ({
    allFiles,
    fileData,
    displayClass,
    cfg,
  }: QuartzComponentProps) => {
    const opts = { ...defaultOptions(cfg), ...userOpts }
    const pages = allFiles.filter(opts.filter).sort(opts.sort)
    const remaining = Math.max(0, pages.length - opts.limit)
    const id = `recent-notes-${numRecentNotes++}`
    return (
      <div class={classNames(displayClass, "recent-notes")}>
        <button
          type="button"
          class="title-button recent-notes-toggle"
          aria-expanded={true}
          aria-controls={id}
        >
          <h2>{opts.title ?? i18n(cfg.locale).components.recentNotes.title}</h2>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="5 8 14 8"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="fold"
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
        <div id={id} class="recent-notes-content" aria-expanded={true} role="group">
          <ul class="recent-ul">
            {pages.slice(0, opts.limit).map((page) => {
              const title = page.frontmatter?.title ?? i18n(cfg.locale).propertyDefaults.title
              const tags = page.frontmatter?.tags ?? []

              return (
                <li class="recent-li">
                  <div class="section">
                    <div class="desc">
                      <h3>
                        <a href={resolveRelative(fileData.slug!, page.slug!)} class="internal">
                          {title}
                        </a>
                      </h3>
                    </div>
                    {page.dates && (
                      <p class="meta">
                        <Date date={getDate(cfg, page)!} locale={cfg.locale} />
                      </p>
                    )}
                    {opts.showTags && (
                      <ul class="tags">
                        {tags.map((tag) => (
                          <li>
                            <a
                              class="internal tag-link"
                              href={resolveRelative(fileData.slug!, `tags/${tag}` as FullSlug)}
                            >
                              {tag}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
          {opts.linkToMore && remaining > 0 && (
            <p>
              <a href={resolveRelative(fileData.slug!, opts.linkToMore)}>
                {i18n(cfg.locale).components.recentNotes.seeRemainingMore({ remaining })}
              </a>
            </p>
          )}
        </div>
      </div>
    )
  }

  RecentNotes.css = style
  RecentNotes.afterDOMLoaded = script
  return RecentNotes
}) satisfies QuartzComponentConstructor
