/**
 * PB UI Kit — accessible, dependency-free component helpers.
 *
 * This module is additive: it does not touch any existing DOM
 * or generation logic. Importers opt in by calling the API.
 *
 * Public API:
 *   Toast.show({ title?, message, kind?, duration?, dismissible? })
 *   Toast.dismissAll()
 *   Skeleton.mount(target, { variant? })
 *   Skeleton.unmount(target)
 *   EmptyState.render(target, { icon?, title, body?, actions? })
 *   Dialog.open({ title, body, actions?, dismissible? })  → returns { close }
 *   announce(message, { assertive? })
 *   Focus.trap(container) → releaseFn
 *   Preview.setLoading(bool, ratio?)   — wires preview skeleton
 *   enhanceSwitches()                  — upgrades .toggle-row to role=switch
 *   enhanceRadioGroup(container, opts) — arrow-key nav for button groups
 */

const doc = document;
const raf = (fn) => requestAnimationFrame(fn);

/* ------------------------------------------------------------------ */
/* Internal utilities                                                  */
/* ------------------------------------------------------------------ */

function el(tag, attrs = {}, children = []) {
  const node = doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === "string" ? doc.createTextNode(c) : c);
  }
  return node;
}

function ensureRegion(id, attrs) {
  let region = doc.getElementById(id);
  if (!region) {
    region = el("div", { id, ...attrs });
    doc.body.appendChild(region);
  }
  return region;
}

/* ------------------------------------------------------------------ */
/* Screen-reader announcer                                             */
/* ------------------------------------------------------------------ */

const A11Y_REGION_ID = "pb-a11y-live";

export function announce(message, { assertive = false } = {}) {
  const region = ensureRegion(A11Y_REGION_ID, {
    class: "pb-sr-only",
    "aria-live": assertive ? "assertive" : "polite",
    "aria-atomic": "true",
    role: "status",
  });
  // Toggle content so screen readers re-announce even for duplicate strings
  region.textContent = "";
  raf(() => { region.textContent = String(message ?? ""); });
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

const TOAST_REGION_ID = "pb-toast-region";
const TOAST_ICONS = {
  info: "ℹ",
  success: "✓",
  warn: "⚠",
  danger: "✕",
};

export const Toast = {
  /**
   * Show a toast.
   * @param {Object|string} opts  Either message string or full options.
   * @returns {{ dismiss: () => void }}
   */
  show(opts) {
    if (typeof opts === "string") opts = { message: opts };
    const {
      title = "",
      message = "",
      kind = "info",
      duration = 3200,
      dismissible = true,
    } = opts || {};

    const region = ensureRegion(TOAST_REGION_ID, {
      class: "pb-toast-region",
      role: "region",
      "aria-label": "Notifications",
    });

    const toast = el("div", {
      class: `pb-toast pb-toast--${kind}`,
      role: kind === "danger" ? "alert" : "status",
      "aria-live": kind === "danger" ? "assertive" : "polite",
    });

    toast.appendChild(el("span", {
      class: "pb-toast__icon",
      "aria-hidden": "true",
      text: TOAST_ICONS[kind] ?? TOAST_ICONS.info,
    }));

    const body = el("div", { class: "pb-toast__body" });
    if (title) body.appendChild(el("div", { class: "pb-toast__title", text: title }));
    if (message) body.appendChild(el("div", { class: "pb-toast__msg", text: message }));
    toast.appendChild(body);

    const dismiss = () => {
      if (toast.dataset.leaving) return;
      toast.dataset.leaving = "true";
      toast.addEventListener("animationend", () => toast.remove(), { once: true });
    };

    if (dismissible) {
      toast.appendChild(el("button", {
        class: "pb-toast__close",
        type: "button",
        "aria-label": "Dismiss notification",
        onclick: dismiss,
        text: "✕",
      }));
    }

    region.appendChild(toast);
    if (duration > 0) setTimeout(dismiss, duration);
    return { dismiss };
  },

  dismissAll() {
    const region = doc.getElementById(TOAST_REGION_ID);
    if (!region) return;
    region.querySelectorAll(".pb-toast").forEach((t) => {
      if (!t.dataset.leaving) {
        t.dataset.leaving = "true";
        t.addEventListener("animationend", () => t.remove(), { once: true });
      }
    });
  },
};

/* ------------------------------------------------------------------ */
/* Skeleton                                                            */
/* ------------------------------------------------------------------ */

export const Skeleton = {
  mount(target, { variant = "rect" } = {}) {
    const host = resolve(target);
    if (!host) return;
    host.dataset.pbSkeletonPrev = host.dataset.pbSkeletonPrev ?? host.innerHTML;
    host.classList.add("pb-skeleton", `pb-skeleton--${variant}`);
    host.setAttribute("aria-busy", "true");
    host.setAttribute("aria-live", "polite");
    host.innerHTML = "";
  },
  unmount(target) {
    const host = resolve(target);
    if (!host) return;
    host.classList.remove("pb-skeleton", "pb-skeleton--text", "pb-skeleton--title",
                          "pb-skeleton--rect", "pb-skeleton--circle");
    host.removeAttribute("aria-busy");
    if (host.dataset.pbSkeletonPrev != null) {
      host.innerHTML = host.dataset.pbSkeletonPrev;
      delete host.dataset.pbSkeletonPrev;
    }
  },
};

/* ------------------------------------------------------------------ */
/* Empty State                                                         */
/* ------------------------------------------------------------------ */

export const EmptyState = {
  /**
   * Render a stateless empty-state block into a target element.
   * @param {HTMLElement|string} target
   * @param {{icon?:string, title:string, body?:string, actions?:Array<{label:string, onClick:Function, kind?:string}>}} config
   */
  render(target, { icon = "🎟️", title, body = "", actions = [] } = {}) {
    const host = resolve(target);
    if (!host) return;
    host.innerHTML = "";
    host.classList.add("pb-empty-state");
    host.setAttribute("role", "status");

    host.appendChild(el("div", { class: "pb-empty-state__icon", "aria-hidden": "true", text: icon }));
    host.appendChild(el("div", { class: "pb-empty-state__title", text: title }));
    if (body) host.appendChild(el("div", { class: "pb-empty-state__body", text: body }));
    if (actions.length) {
      const bar = el("div", { class: "pb-empty-state__actions" });
      for (const a of actions) {
        bar.appendChild(el("button", {
          type: "button",
          class: `pb-btn ${a.kind ? `pb-btn--${a.kind}` : "pb-btn--subtle"}`,
          onclick: a.onClick,
          text: a.label,
        }));
      }
      host.appendChild(bar);
    }
  },
};

/* ------------------------------------------------------------------ */
/* Dialog / modal                                                      */
/* ------------------------------------------------------------------ */

let openDialogs = 0;

export const Dialog = {
  /**
   * Open an accessible modal dialog.
   * @returns {{ close: () => void, root: HTMLElement }}
   */
  open({ title = "", body = "", actions = [], dismissible = true } = {}) {
    const previouslyFocused = doc.activeElement;
    const titleId = `pb-dlg-title-${Math.random().toString(36).slice(2, 8)}`;

    const backdrop = el("div", {
      class: "pb-dialog-backdrop",
      role: "presentation",
    });

    const bodyEl = typeof body === "string"
      ? el("div", { html: body })
      : body;

    const footer = actions.length
      ? el("div", { class: "pb-dialog__footer" }, actions.map((a) =>
          el("button", {
            type: "button",
            class: `pb-btn ${a.kind ? `pb-btn--${a.kind}` : ""}`.trim(),
            onclick: () => a.onClick?.({ close }),
            text: a.label,
          })))
      : null;

    const dialog = el("div", {
      class: "pb-dialog",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": titleId,
    }, [
      el("div", { class: "pb-dialog__header" }, [
        el("h2", { class: "pb-dialog__title", id: titleId, text: title }),
        dismissible ? el("button", {
          class: "pb-btn pb-btn--ghost pb-btn--sm pb-btn--icon-only",
          type: "button",
          "aria-label": "Close dialog",
          onclick: () => close(),
          text: "✕",
        }) : null,
      ]),
      el("div", { class: "pb-dialog__body" }, bodyEl),
      footer,
    ]);

    backdrop.appendChild(dialog);
    doc.body.appendChild(backdrop);
    openDialogs++;
    doc.body.style.overflow = "hidden";

    const release = Focus.trap(dialog);

    const onKey = (e) => {
      if (e.key === "Escape" && dismissible) { e.preventDefault(); close(); }
    };
    doc.addEventListener("keydown", onKey);

    if (dismissible) {
      backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) close();
      });
    }

    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      doc.removeEventListener("keydown", onKey);
      release?.();
      backdrop.dataset.leaving = "true";
      backdrop.addEventListener("animationend", () => {
        backdrop.remove();
        openDialogs = Math.max(0, openDialogs - 1);
        if (openDialogs === 0) doc.body.style.overflow = "";
        if (previouslyFocused && typeof previouslyFocused.focus === "function") {
          previouslyFocused.focus();
        }
      }, { once: true });
    }

    // Auto-focus first focusable element
    raf(() => {
      const first = dialog.querySelector(
        'a, button, [tabindex]:not([tabindex="-1"]), input, select, textarea'
      );
      (first ?? dialog).focus?.();
    });

    return { close, root: dialog };
  },
};

/* ------------------------------------------------------------------ */
/* Focus trap                                                          */
/* ------------------------------------------------------------------ */

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export const Focus = {
  trap(container) {
    if (!container) return () => {};
    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const focusables = [...container.querySelectorAll(FOCUSABLE_SELECTOR)]
        .filter((n) => n.offsetParent !== null || n === doc.activeElement);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && doc.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && doc.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKey);
    return () => container.removeEventListener("keydown", onKey);
  },
};

/* ------------------------------------------------------------------ */
/* Preview loading integration                                         */
/* ------------------------------------------------------------------ */

/**
 * Toggle a skeleton in the preview panel while a banner renders.
 * Non-invasive: only touches data-state on the panel and appends a
 * skeleton node when needed. Does not modify #preview or main.js.
 */
export const Preview = {
  setLoading(loading, ratioString) {
    const panel = doc.querySelector(".preview-panel");
    if (!panel) return;

    if (loading) {
      panel.setAttribute("data-state", "loading");
      let skel = panel.querySelector(".pb-preview-skeleton");
      if (!skel) {
        skel = el("div", {
          class: "pb-preview-skeleton",
          role: "status",
          "aria-label": "Rendering banner preview",
        }, [
          el("div", { class: "pb-preview-skeleton__bar pb-preview-skeleton__bar--wide" }),
          el("div", { class: "pb-preview-skeleton__bar pb-preview-skeleton__bar--narrow" }),
        ]);
        const area = panel.querySelector(".preview-area") || panel;
        area.appendChild(skel);
      }
      if (ratioString) {
        skel.style.setProperty("--pb-preview-ratio", ratioString);
      }
    } else {
      panel.removeAttribute("data-state");
      const skel = panel.querySelector(".pb-preview-skeleton");
      if (skel) skel.remove();
    }
  },
};

/* ------------------------------------------------------------------ */
/* Progressive enhancement of existing controls                        */
/* ------------------------------------------------------------------ */

/**
 * Adds role="switch"/keyboard support to the existing .toggle-row / .toggle-switch,
 * without changing the click handler wired in HTML.
 */
export function enhanceSwitches() {
  doc.querySelectorAll(".toggle-row").forEach((row) => {
    if (row.dataset.pbEnhanced) return;
    row.dataset.pbEnhanced = "true";
    const sw = row.querySelector(".toggle-switch");
    const label = row.querySelector(".toggle-label");
    if (!sw) return;

    row.setAttribute("role", "switch");
    row.setAttribute("tabindex", "0");
    row.setAttribute("aria-checked", sw.classList.contains("active") ? "true" : "false");
    if (label) row.setAttribute("aria-label", label.textContent.trim());

    row.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        row.click();
      }
    });

    // Keep aria-checked in sync via a mutation observer on the switch class list.
    const observer = new MutationObserver(() => {
      row.setAttribute("aria-checked", sw.classList.contains("active") ? "true" : "false");
    });
    observer.observe(sw, { attributes: true, attributeFilter: ["class"] });
  });
}

/**
 * Adds arrow-key navigation to a group of buttons (radio-group-like).
 * Does not intercept clicks — only enhances keyboard flow.
 *
 * @param {HTMLElement|string} container
 * @param {{ orientation?: "horizontal"|"vertical"|"grid", role?: string }} opts
 */
export function enhanceRadioGroup(container, { orientation = "grid", role = "group" } = {}) {
  const host = resolve(container);
  if (!host || host.dataset.pbEnhancedGroup) return;
  host.dataset.pbEnhancedGroup = "true";
  host.setAttribute("role", role);

  const focusables = () =>
    [...host.querySelectorAll("button")].filter((b) => !b.disabled && b.offsetParent !== null);

  host.addEventListener("keydown", (e) => {
    const items = focusables();
    if (!items.length) return;
    const idx = items.indexOf(doc.activeElement);
    if (idx === -1) return;

    let next = -1;
    const isHoriz = orientation !== "vertical";
    const isVert = orientation !== "horizontal";
    if ((e.key === "ArrowRight" && isHoriz) || (e.key === "ArrowDown" && isVert)) next = (idx + 1) % items.length;
    else if ((e.key === "ArrowLeft" && isHoriz) || (e.key === "ArrowUp" && isVert)) next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;

    if (next >= 0) {
      e.preventDefault();
      items[next].focus();
    }
  });
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function resolve(target) {
  if (!target) return null;
  return typeof target === "string" ? doc.querySelector(target) : target;
}

/* Expose to window for legacy inline callers (main.js, HTML onclicks) */
if (typeof window !== "undefined") {
  window.PB = window.PB || {};
  Object.assign(window.PB, { Toast, Skeleton, EmptyState, Dialog, Focus, Preview, announce, enhanceSwitches, enhanceRadioGroup });
}
