// Mirrors the desktop Explorer toggle: the title doubles as a button that
// folds the list away, with the chevron rotating to match.
function toggleRecentNotes(this: HTMLElement) {
  const recentNotes = this.closest(".recent-notes") as HTMLElement | null
  if (!recentNotes) return

  const collapsed = recentNotes.classList.toggle("collapsed")
  this.setAttribute("aria-expanded", collapsed ? "false" : "true")

  const content = recentNotes.querySelector(".recent-notes-content")
  content?.setAttribute("aria-expanded", collapsed ? "false" : "true")
}

document.addEventListener("nav", () => {
  const buttons = document.getElementsByClassName(
    "recent-notes-toggle",
  ) as HTMLCollectionOf<HTMLElement>

  for (const button of buttons) {
    button.addEventListener("click", toggleRecentNotes)
    window.addCleanup(() => button.removeEventListener("click", toggleRecentNotes))
  }
})
