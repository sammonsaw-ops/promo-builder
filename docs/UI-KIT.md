# PB UI Kit

A small, dependency-free, accessible component system for the Raffle Promo
Builder. It is **additive**: it lives alongside the legacy styles and does not
override existing classes. All component classes are namespaced with `pb-*`,
and all JavaScript is exported from a single ES module.

- **CSS**: `styles.css` (bottom section — `── PB UI KIT ──`)
- **JS**: `js/ui/components.js` (ES module, also globally exposed as `window.PB`)
- **HTML wiring**: loaded in `index.html` before `js/main.js`

## Goals

1. **Reusable** — every component is a single class or a single function call.
2. **Accessible** — WCAG 2.1 AA baseline; ARIA roles, focus rings, live regions, keyboard flows.
3. **Production-ready** — loading states, empty states, error states, motion tokens, `prefers-reduced-motion`, forced-colors mode.
4. **Zero build step** — plain CSS variables, plain ES module, no framework, no bundler.
5. **Progressive** — the legacy app runs identically if `components.js` fails to load; the kit only *enhances*.

---

## Design tokens

All tokens are CSS custom properties on `:root`. Reference them from
component styles or from ad-hoc markup.

| Group | Tokens |
| --- | --- |
| Spacing (4px grid) | `--pb-space-0` … `--pb-space-12` |
| Radii | `--pb-radius-xs / sm / md / lg / xl / full` |
| Motion | `--pb-duration-fast / base / slow`, `--pb-ease-out`, `--pb-ease-in-out` |
| Elevation | `--pb-elev-1` … `--pb-elev-4` |
| Focus | `--pb-focus-ring`, `--pb-focus-ring-color` |
| Semantic surface | `--pb-surface`, `--pb-surface-muted`, `--pb-surface-sunken`, `--pb-border`, `--pb-border-strong`, `--pb-text`, `--pb-text-muted`, `--pb-text-subtle` |
| Status | `--pb-info / success / warn / danger` with matching `-bg` / `-border` variants |

Existing tokens (`--gray-*`, `--accent`, `--success`, `--font`, `--shadow-*`) are preserved and referenced by the new tokens where appropriate, so both palettes stay in sync.

---

## Components

### Button — `.pb-btn`

```html
<button class="pb-btn pb-btn--primary">Save</button>
<button class="pb-btn pb-btn--ghost pb-btn--sm">Cancel</button>
<button class="pb-btn pb-btn--danger" aria-busy="true">Delete</button>
```

**Variants**: `--primary`, `--success`, `--danger`, `--ghost`, `--subtle`.
**Sizes**: default (36px), `--sm` (30px), `--lg` (44px).
**Modifiers**: `--block` (full width), `--icon-only` (square).

**Loading state** — set `aria-busy="true"`. The label is visually hidden and replaced by a spinner using `currentColor`. The button remains focusable and its ARIA state is announced by screen readers.

**Disabled** — use the native `disabled` attribute or `aria-disabled="true"`. Both are supported; pointer events are removed and opacity drops.

### Card — `.pb-card`

```html
<section class="pb-card">
  <header class="pb-card__header">
    <span class="pb-card__title">Details</span>
  </header>
  <div class="pb-card__body">…content…</div>
  <footer class="pb-card__footer">
    <button class="pb-btn pb-btn--ghost">Cancel</button>
    <button class="pb-btn pb-btn--primary">Save</button>
  </footer>
</section>
```

Add `.pb-card--flat` to remove elevation or `.pb-card--muted` for a sunken surface.

### Field — `.pb-field`, `.pb-input`, `.pb-select`, `.pb-textarea`

```html
<div class="pb-field" data-invalid="false">
  <label class="pb-field__label" for="orgName">
    Organization <span class="pb-field__hint">(required)</span>
  </label>
  <input id="orgName" class="pb-input" placeholder="e.g. Northside Hockey">
  <p class="pb-field__helper">Shown on the banner header.</p>
  <p class="pb-field__error">Please enter a name.</p>
</div>
```

Set `data-invalid="true"` on the wrapper to flip the input into error style. `pb-field__error` is only visually meaningful when the wrapper is invalid; wire it to `aria-describedby` on the input for screen readers.

### Badge — `.pb-badge`

```html
<span class="pb-badge pb-badge--success">Ready</span>
<span class="pb-badge pb-badge--warn">Draft</span>
```

Variants: `--neutral / --info / --success / --warn / --danger`.

### Divider — `.pb-divider`

```html
<hr class="pb-divider">
<div class="pb-divider pb-divider--labeled">Or</div>
```

### Toast (JS)

```js
PB.Toast.show({ title: 'Copied!', message: 'Image copied to clipboard.', kind: 'success' });
PB.Toast.show({ message: 'Render failed', kind: 'danger', duration: 5000 });
PB.Toast.show('Saved.');            // shorthand
PB.Toast.dismissAll();
```

**Options**: `title?`, `message`, `kind: 'info'|'success'|'warn'|'danger'`, `duration` (ms; 0 = sticky), `dismissible` (default true).

The toast region is a `role="region"` with `aria-label="Notifications"`. Individual toasts are `role="status"` (or `role="alert"` for `danger`) with matching `aria-live`. The close button has a proper `aria-label`.

### Skeleton (JS)

```js
PB.Skeleton.mount('#profileCard', { variant: 'rect' });
// …fetch/render…
PB.Skeleton.unmount('#profileCard');
```

Variants: `text | title | circle | rect`. The skeleton preserves original content in `data-pb-skeleton-prev` and restores it on unmount. `aria-busy="true"` is applied while mounted.

### Empty state (JS or class)

```js
PB.EmptyState.render('#dashboard', {
  icon: '📭',
  title: 'No banners yet',
  body: 'Fill in the form to generate your first raffle promo.',
  actions: [
    { label: 'Get Started', kind: 'primary', onClick: () => focusFirstField() },
  ],
});
```

Or use the class directly:

```html
<div class="pb-empty-state" role="status">
  <div class="pb-empty-state__icon" aria-hidden="true">📭</div>
  <div class="pb-empty-state__title">No banners yet</div>
  <div class="pb-empty-state__body">Fill in the form to generate your first raffle promo.</div>
</div>
```

### Dialog (JS)

```js
const dlg = PB.Dialog.open({
  title: 'Delete this template?',
  body: '<p>This cannot be undone.</p>',
  actions: [
    { label: 'Cancel', kind: 'ghost', onClick: ({ close }) => close() },
    { label: 'Delete', kind: 'danger', onClick: ({ close }) => { doDelete(); close(); } },
  ],
});
```

**Accessibility**: `role="dialog"`, `aria-modal="true"`, focus is trapped inside, ESC closes, backdrop click closes, focus returns to the previously focused element on close. Body scroll is locked while any dialog is open.

### Tooltip — `.pb-tooltip`

```html
<button class="pb-tooltip pb-btn pb-btn--icon-only" data-tooltip="Copy to clipboard" aria-label="Copy">📋</button>
```

Tooltip is CSS-only; it appears on `:hover` and `:focus-within`.

### Tabs — `.pb-tabs` / `.pb-tab`

```html
<div class="pb-tabs" role="tablist">
  <button class="pb-tab" role="tab" aria-selected="true">Standard</button>
  <button class="pb-tab" role="tab" aria-selected="false">Sport</button>
</div>
```

Combine with `PB.enhanceRadioGroup(tablist, { orientation: 'horizontal', role: 'tablist' })` for arrow-key navigation.

### Progress — `.pb-progress`

```html
<div class="pb-progress" role="progressbar" aria-valuenow="42" aria-valuemin="0" aria-valuemax="100">
  <div class="pb-progress__bar" style="--pb-progress-value: 42%"></div>
</div>

<!-- Indeterminate -->
<div class="pb-progress pb-progress--indeterminate" role="progressbar">
  <div class="pb-progress__bar"></div>
</div>
```

### Spinner — `.pb-spinner`

```html
<span class="pb-spinner" role="status" aria-label="Loading"></span>
```

Sizes: default (20px), `--sm`, `--lg`.

### Screen-reader announcer (JS)

```js
PB.announce('Banner generated');
PB.announce('Render failed', { assertive: true });
```

Writes to a hidden `aria-live` region. Use for status changes that aren't already tied to a visible status element.

### Focus trap (JS)

```js
const release = PB.Focus.trap(myPanel);
// …later…
release();
```

Used internally by `Dialog.open`; exposed for custom overlays.

---

## Progressive enhancement helpers

These run on `DOMContentLoaded` from `main.js` and upgrade the existing markup without replacing it.

- **`enhanceSwitches()`** — finds every `.toggle-row`, adds `role="switch"`, `tabindex="0"`, keeps `aria-checked` in sync via a MutationObserver, and wires `Space`/`Enter` to trigger the existing click handler.
- **`enhanceRadioGroup(container, opts)`** — arrow-key + Home/End navigation over the buttons inside `container`. Applied to `#sportGrid`, `#ratioGrid`, and `.mode-switcher`. Does not intercept clicks.
- **`Preview.setLoading(bool, ratio?)`** — toggles a shimmering aspect-correct skeleton in the preview panel via `data-state="loading"`. Called by the wrapped `generatePoster()` on first render.

---

## Accessibility baseline

- `:focus-visible` ring on every interactive element (opt-out only in high-contrast mode where the OS provides its own).
- `prefers-reduced-motion: reduce` disables shimmer, dialog scaling, toast slide-in.
- `forced-colors: active` swaps borders to `CanvasText` and focus rings to system `Highlight`.
- Every icon-only button ships with `aria-label`; decorative emojis carry `aria-hidden="true"`.
- Live regions for status (`role="status"`, `aria-live="polite"`) and errors (`role="alert"`, `aria-live="assertive"`).
- All new components pass automated axe-core checks with zero violations on their default markup.

---

## API contract & versioning

`window.PB` is the stable public surface:

```ts
PB.Toast:        { show(opts|string): { dismiss() }, dismissAll(): void }
PB.Skeleton:     { mount(target, opts?), unmount(target) }
PB.EmptyState:   { render(target, cfg) }
PB.Dialog:       { open(cfg): { close(), root } }
PB.Focus:        { trap(el): releaseFn }
PB.Preview:      { setLoading(bool, ratioStr?) }
PB.announce(msg, opts?)
PB.enhanceSwitches()
PB.enhanceRadioGroup(container, opts?)
```

Everything else — internal helpers, mutation observers, focusable selectors — is implementation detail and may change without notice. Never reach into internals from application code; add a new public method instead.

---

## Best practices

- **Compose, don't override.** Use `.pb-btn` + a variant, not deep selectors. Never target `.pb-btn > *`.
- **Semantic first.** Reach for `<button>`, `<a href>`, `<h2>`, `<label>` before `role="…"`.
- **Announce state changes.** If a change isn't visible near the current focus, call `PB.announce()`.
- **Never leave a loading state silent.** Use `aria-busy`, `PB.Skeleton`, or `PB.Preview.setLoading` so assistive tech knows work is in progress.
- **Handle the empty state on day one.** Every list, table, or preview area should render `pb-empty-state` when there is no data — not blank whitespace.
- **Respect motion preferences.** Custom animations added on top of this kit must honor `prefers-reduced-motion: reduce`.
- **Test with the keyboard.** If you can't Tab-reach and Enter/Space-activate a control, it's broken. Focus rings must be visible in all themes.

---

## Extending the kit

To add a new component:

1. Add a CSS block under the `── PB UI KIT ──` section, prefixed with `pb-`.
2. If it needs behavior, add a small helper in `components.js`, expose it via the `window.PB` bridge at the bottom.
3. Add a section to this doc: markup example, options, accessibility notes.
4. Bump the internal changelog comment in `components.js` if there's a public API change.

Keep helpers under ~80 lines each. If a helper grows past that, split it into its own file under `js/ui/`.
