import { QuartzTransformerPlugin } from "../types"
import { visit } from "unist-util-visit"
import { Root } from "hast"

interface Options {
  /** Show image counter (e.g. "3 / 7") in the overlay */
  showCounter: boolean
}

const defaultOptions: Options = {
  showCounter: true,
}

const lightboxStyle = `
.lightbox-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.85);
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.2s ease, visibility 0.2s ease;
  cursor: zoom-out;
}

.lightbox-overlay.active {
  opacity: 1;
  visibility: visible;
}

.lightbox-overlay img {
  max-width: 90vw;
  max-height: 85vh;
  object-fit: contain;
  border-radius: 4px;
  cursor: pointer;
  transition: opacity 0.15s ease;
  user-select: none;
  -webkit-user-select: none;
}

.lightbox-overlay img.lightbox-loading {
  opacity: 0.4;
}

.lightbox-btn {
  position: absolute;
  top: 25%;
  width: 20vw;
  height: 50vh;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: flex;
  align-items: center;
  z-index: 1;
  transition: color 0.15s ease;
  user-select: none;
  -webkit-user-select: none;
}

.lightbox-btn svg {
  width: 24px;
  height: 24px;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lightbox-btn:hover {
  color: rgba(255, 255, 255, 0.95);
}

.lightbox-btn.prev { left: 0; justify-content: flex-start; padding-left: 16px; }
.lightbox-btn.next { right: 0; justify-content: flex-end; padding-right: 16px; }

.lightbox-close {
  position: absolute;
  top: 12px;
  right: 12px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  padding: 8px;
  z-index: 1;
  transition: color 0.15s ease;
}

.lightbox-close svg {
  width: 20px;
  height: 20px;
  stroke: currentColor;
  stroke-width: 2;
  fill: none;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lightbox-close:hover {
  color: rgba(255, 255, 255, 0.95);
}

.lightbox-counter {
  position: absolute;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
}

/* only show arrows when there are multiple images */
.lightbox-overlay.single .lightbox-btn {
  display: none;
}

.lightbox-overlay.single .lightbox-counter {
  display: none;
}

/* make content images look clickable */
article img {
  cursor: zoom-in;
}

@media (max-width: 600px) {
  .lightbox-btn { width: 15vw; }
  .lightbox-btn svg { width: 20px; height: 20px; }
  .lightbox-overlay img {
    max-width: 96vw;
    max-height: 80vh;
  }
}
`

const lightboxScript = `
document.addEventListener("nav", () => {
  // Build or reuse the overlay DOM
  let overlay = document.getElementById("lightbox-overlay");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "lightbox-overlay";
    overlay.className = "lightbox-overlay";
    overlay.innerHTML = \`
      <button class="lightbox-close" aria-label="Close"><svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      <button class="lightbox-btn prev" aria-label="Previous"><svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg></button>
      <img src="" alt="" />
      <button class="lightbox-btn next" aria-label="Next"><svg viewBox="0 0 24 24"><polyline points="9 6 15 12 9 18"/></svg></button>
      <div class="lightbox-counter"></div>
    \`;
    document.body.appendChild(overlay);
  }

  const lbImg = overlay.querySelector("img");
  const prevBtn = overlay.querySelector(".prev");
  const nextBtn = overlay.querySelector(".next");
  const closeBtn = overlay.querySelector(".lightbox-close");
  const counter = overlay.querySelector(".lightbox-counter");

  let images = [];
  let currentIndex = 0;

  function collectImages() {
    const article = document.querySelector("article");
    if (!article) return [];
    return Array.from(article.querySelectorAll("img"));
  }

  function show(index) {
    images = collectImages();
    if (images.length === 0) return;
    currentIndex = ((index % images.length) + images.length) % images.length;
    const src = images[currentIndex].src;

    // Show loading state then swap
    lbImg.classList.add("lightbox-loading");
    const temp = new Image();
    temp.onload = () => {
      lbImg.src = src;
      lbImg.alt = images[currentIndex].alt || "";
      lbImg.classList.remove("lightbox-loading");
    };
    temp.onerror = () => {
      lbImg.src = src;
      lbImg.alt = images[currentIndex].alt || "";
      lbImg.classList.remove("lightbox-loading");
    };
    temp.src = src;

    // If image is already cached, just set it immediately
    if (temp.complete) {
      lbImg.src = src;
      lbImg.alt = images[currentIndex].alt || "";
      lbImg.classList.remove("lightbox-loading");
    }

    overlay.classList.toggle("single", images.length <= 1);
    counter.textContent = images.length > 1 ? (currentIndex + 1) + " / " + images.length : "";
    overlay.classList.add("active");
    document.body.style.overflow = "hidden";
  }

  function hide() {
    overlay.classList.remove("active");
    document.body.style.overflow = "";
  }

  function next() { show(currentIndex + 1); }
  function prev() { show(currentIndex - 1); }

  // Click handlers on article images
  images = collectImages();
  images.forEach((img, i) => {
    const handler = (e) => {
      e.preventDefault();
      e.stopPropagation();
      show(i);
    };
    img.addEventListener("click", handler);
    window.addCleanup(() => img.removeEventListener("click", handler));
  });

  // Click image in overlay → next; click backdrop → close
  const onLbImgClick = (e) => { e.stopPropagation(); next(); };
  lbImg.addEventListener("click", onLbImgClick);
  window.addCleanup(() => lbImg.removeEventListener("click", onLbImgClick));

  const onOverlayClick = (e) => {
    if (e.target === overlay) hide();
  };
  overlay.addEventListener("click", onOverlayClick);
  window.addCleanup(() => overlay.removeEventListener("click", onOverlayClick));

  const onClose = (e) => { e.stopPropagation(); hide(); };
  closeBtn.addEventListener("click", onClose);
  window.addCleanup(() => closeBtn.removeEventListener("click", onClose));

  const onPrev = (e) => { e.stopPropagation(); prev(); };
  prevBtn.addEventListener("click", onPrev);
  window.addCleanup(() => prevBtn.removeEventListener("click", onPrev));

  const onNext = (e) => { e.stopPropagation(); next(); };
  nextBtn.addEventListener("click", onNext);
  window.addCleanup(() => nextBtn.removeEventListener("click", onNext));

  // Keyboard navigation
  const onKey = (e) => {
    if (!overlay.classList.contains("active")) return;
    switch (e.key) {
      case "Escape": hide(); break;
      case "ArrowLeft": prev(); break;
      case "ArrowRight": next(); break;
    }
  };
  document.addEventListener("keydown", onKey);
  window.addCleanup(() => document.removeEventListener("keydown", onKey));

  // Touch swipe support
  let touchStartX = 0;
  const onTouchStart = (e) => { touchStartX = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (!overlay.classList.contains("active")) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 50) {
      dx > 0 ? prev() : next();
    }
  };
  overlay.addEventListener("touchstart", onTouchStart, { passive: true });
  overlay.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addCleanup(() => {
    overlay.removeEventListener("touchstart", onTouchStart);
    overlay.removeEventListener("touchend", onTouchEnd);
  });
});
`

export const Lightbox: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "Lightbox",
    htmlPlugins() {
      return [
        () => {
          return (tree: Root) => {
            // Add a data attribute to each image so they're identifiable
            let imgIndex = 0
            visit(tree, "element", (node) => {
              if (node.tagName === "img" && node.properties) {
                node.properties["data-lightbox"] = imgIndex++
              }
            })
          }
        },
      ]
    },
    externalResources() {
      return {
        css: [{ content: lightboxStyle, inline: true }],
        js: [
          {
            loadTime: "afterDOMReady",
            contentType: "inline",
            script: opts.showCounter
              ? lightboxScript
              : lightboxScript.replace(
                  `counter.textContent = images.length > 1 ? (currentIndex + 1) + " / " + images.length : ""`,
                  `counter.textContent = ""`,
                ),
          },
        ],
      }
    },
  }
}
