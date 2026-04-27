// Click-to-enlarge overlay for Mermaid diagrams.
//
// VitePress renders Mermaid diagrams via vitepress-plugin-mermaid into
// `.mermaid` containers (an SVG inside a div). The big storage ER diagram
// has 22 entities crammed into ~624px of body width, which makes the
// labels unreadable on the inline view; this module adds a delegated
// click handler that opens any clicked diagram in a fullscreen modal so
// the SVG can scale up to ~95vw.
//
// Why a single delegated listener instead of per-diagram wiring: VitePress
// is an SPA and re-renders body content on route changes. A document-level
// listener survives navigations without needing teardown/re-attach
// bookkeeping.

const ROOT_ID = "mermaid-lightbox-root";

let initialized = false;

function ensureRoot(): {
  root: HTMLElement;
  svgContainer: HTMLElement;
  closeButton: HTMLElement;
} {
  const existing = document.getElementById(ROOT_ID);
  if (existing) {
    return {
      root: existing,
      svgContainer: existing.querySelector(
        ".mermaid-lightbox-svg-container",
      ) as HTMLElement,
      closeButton: existing.querySelector(
        ".mermaid-lightbox-close",
      ) as HTMLElement,
    };
  }
  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.className = "mermaid-lightbox";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-hidden", "true");
  root.innerHTML = `
    <div class="mermaid-lightbox-backdrop"></div>
    <div class="mermaid-lightbox-content" role="document">
      <button type="button" class="mermaid-lightbox-close" aria-label="Close diagram preview">×</button>
      <div class="mermaid-lightbox-svg-container"></div>
    </div>
  `;
  document.body.appendChild(root);
  return {
    root,
    svgContainer: root.querySelector(
      ".mermaid-lightbox-svg-container",
    ) as HTMLElement,
    closeButton: root.querySelector(
      ".mermaid-lightbox-close",
    ) as HTMLElement,
  };
}

export function setupMermaidLightbox(): void {
  if (initialized || typeof document === "undefined") return;
  initialized = true;

  const { root, svgContainer, closeButton } = ensureRoot();

  function close(): void {
    root.classList.remove("open");
    root.setAttribute("aria-hidden", "true");
    svgContainer.replaceChildren();
    document.body.style.overflow = "";
  }

  function open(svg: SVGElement): void {
    const clone = svg.cloneNode(true) as SVGElement;
    // Strip width/height so CSS can size the clone via viewBox.
    clone.removeAttribute("width");
    clone.removeAttribute("height");
    clone.style.width = "100%";
    clone.style.height = "auto";
    svgContainer.replaceChildren(clone);
    root.classList.add("open");
    root.setAttribute("aria-hidden", "false");
    // Prevent body scroll while modal is open
    document.body.style.overflow = "hidden";
    closeButton.focus();
  }

  closeButton.addEventListener("click", close);
  root.querySelector(".mermaid-lightbox-backdrop")?.addEventListener(
    "click",
    close,
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("open")) {
      close();
    }
  });

  // Delegated click opener.
  document.addEventListener("click", (event) => {
    const target = event.target as Element | null;
    if (!target) return;
    // Don't re-open when interacting with the modal itself.
    if (target.closest(`#${ROOT_ID}`)) return;
    const mermaidContainer = target.closest(".mermaid");
    if (!mermaidContainer) return;
    const svg = mermaidContainer.querySelector("svg");
    if (!svg) return;
    open(svg as unknown as SVGElement);
  });
}
