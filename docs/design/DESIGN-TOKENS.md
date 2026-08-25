# Commerce Insight — Design System (Phase 2)

**Status:** Derived and verified · awaiting sign-off
**Source of truth:** [`assets/brand/commerce-insight-logo-master.jpg`](../../assets/brand/commerce-insight-logo-master.jpg)
**Machine-readable output:** [`tokens.css`](tokens.css) — 80 tokens, the approved reference

> **`tokens.css` is the approved reference, NOT the shipped file.** The
> application ships `src/app/globals.css`, which carries the same colour values
> under Tailwind v4 `@theme` names: `--r-sm/md/lg` ship as `--radius-sm/md/lg`,
> `--t-*` as `--text-*`, `--ease` as `--ease-brand`, `--font-body` as
> `--font-sans`, and the `--s-*` spacing steps come from Tailwind's own scale.
> **Every colour token matches exactly** — Phase 14 recomputed all 15 contrast
> pairings below against the shipped values and all 15 agreed to two decimal
> places. Edit `globals.css`; this file records the decisions and the reasoning.
**Governs:** Master Plan §08 (brand direction), §09 (design system), §20 (accessibility)

---

## 1. The colours are sampled, not chosen

The logo is a flat two-colour mark on white. Counting every pixel in the
2560×2560 master:

| Colour | Hex | Share of logo | Where it appears |
| --- | --- | ---: | --- |
| Navy | `#002D66` | 7.63% | Graduate figure, cap, open book, pen nib, wordmark, tagline |
| Orange | `#EA853F` | 1.32% | The arc over the figure, and the rule beside the tagline |
| White | `#FFFFFF` | 81.64% | Ground |

No third colour exceeds 0.01%. That ratio — **~82% white, ~8% navy, ~1% orange**
— is itself the brand instruction, and it matches the master directive's
"Blue + White first, Orange second" almost exactly. The design system just
holds the mark's own discipline.

### This settles the open decision

`docs/README.md` recorded a conflict: the master directive said deep blue +
white + orange; the vision brief said navy/charcoal + **gold/amber**.

**The logo decides it: blue + white + orange.** There is no gold in the mark.
The gold direction was almost certainly carried over from the old Lovable
site's navy/gold/crimson palette — which the AI builder invented, and which
was never Commerce Insight's brand.

### What the logo also tells us about type

The wordmark **COMMERCE INSIGHT** is set in a high-contrast serif; the tagline
*"Exclusive Institute for Commerce Education"* is a humanist sans. The Master
Plan proposed Source Serif 4 + IBM Plex Sans before the logo arrived. That
pairing turns out to mirror the mark's own structure — serif for authority,
sans for clarity. Kept, now with a reason rather than a preference.

---

## 2. The one rule that constrains everything

The logo orange **cannot be used for text on a light ground.**

| Pairing | Ratio | AA (4.5:1) |
| --- | ---: | --- |
| `#EA853F` on white | **2.65:1** | ❌ fails — also fails the 3:1 large-text floor |
| `#BC5915` on white | 4.59:1 | ✅ passes |

So the system splits orange in two:

- **`--accent` = `#EA853F`** — the true logo orange. Fills, rules, arcs, active
  indicators, badges, icons. **Never text on light.**
- **`--accent-text` = `#BC5915`** — same hue and saturation, darkened until it
  clears AA. For orange text and orange links on light grounds.

On dark grounds and inside navy bands the logo orange is fine as text
(7.10:1 and 5.06:1), so `--accent` is re-pointed at it there.

Master Plan §08 predicted this ("brand oranges frequently fail AA on white and
need darkening for text use while the original stays for fills"). It was right,
and the numbers now back it.

---

## 3. Verified pairings — every combination the site actually ships

Computed with the WCAG 2.2 relative-luminance formula.

### Light theme

| Use | Foreground | Background | Ratio | |
| --- | --- | --- | ---: | --- |
| Body text | `#181E25` | `#FFFFFF` | 16.78:1 | ✅ AAA |
| Muted text | `#50637C` | `#FFFFFF` | 6.15:1 | ✅ AA |
| Headings | `#002D66` | `#FFFFFF` | 13.40:1 | ✅ AAA |
| Links | `#0051B8` | `#FFFFFF` | 7.32:1 | ✅ AAA |
| Accent text | `#BC5915` | `#FFFFFF` | 4.59:1 | ✅ AA |
| Body on surface | `#181E25` | `#F8F9FB` | 15.93:1 | ✅ AAA |
| Rules (visibility) | `#DDE2E9` | `#FFFFFF` | 1.30:1 | ✅ visible |

### Navy band (white text on brand)

| Use | Foreground | Background | Ratio | |
| --- | --- | --- | ---: | --- |
| Text on navy | `#FFFFFF` | `#002D66` | 13.40:1 | ✅ AAA |
| Secondary on navy | `#CCE2FF` | `#002D66` | 10.14:1 | ✅ AAA |
| Orange on navy | `#EA853F` | `#002D66` | 5.06:1 | ✅ AA |

### Dark theme

| Use | Foreground | Background | Ratio | |
| --- | --- | --- | ---: | --- |
| Body text | `#DCE6F4` | `#0A121C` | 14.93:1 | ✅ AAA |
| Muted text | `#8FA0BA` | `#0A121C` | 7.08:1 | ✅ AAA |
| Headings | `#7FB0FF` | `#0A121C` | 8.56:1 | ✅ AAA |
| Accent | `#EA853F` | `#0A121C` | 7.10:1 | ✅ AAA |
| Body on surface | `#DCE6F4` | `#111C2A` | 13.62:1 | ✅ AAA |

**14 of 14 shipped pairings pass AA. Most pass AAA.** The only failing
combination in the system is the guard-rail above, and it is forbidden by name.

---

## 4. Neutrals are biased, not default

The greys sit at the **brand hue (214°) at 22% saturation** rather than being
neutral grey. `#181E25` instead of `#18181B`. The difference is small per-pixel
and obvious across a page: the neutrals read as belonging to the navy rather
than as a framework default dropped underneath it.

Full ramp: `--ink-950` → `--ink-50` (11 steps), in [`tokens.css`](tokens.css).

---

## 5. The rest of the system

| Primitive | Decision | Why |
| --- | --- | --- |
| **Radii** | 4px inputs · 8px cards · 12px modals · full for avatars only | Master directive §5 warns against "excessive rounded cards" — heavy rounding is the clearest template tell |
| **Elevation** | 3 levels, all tinted `rgba(0,45,102,…)` | Black shadows on a navy-biased palette read as dirt |
| **Separators** | 1px `--rule` preferred over shadow | The system should read as a document, not a stack of floating cards |
| **Spacing** | 4px base, restricted set (4/8/12/16/24/32/48/64/96/128) | Unrestricted spacing is how a site drifts into looking assembled |
| **Body floor** | never below 16px on mobile | Below 16px iOS Safari zooms on input focus and the layout jumps — functional, not aesthetic |
| **Motion** | Specified: band entry, card hover, stat count-up. **Shipped: card hover only** — see below | Master directive §36 — motion communicates hierarchy, nothing else |
| **Status colours** | green/amber/red, separate from the accent hue | Semantic colour must never compete with brand orange for meaning |

### Motion, as actually shipped

Phase 14 audited this row against the source and found the specification ahead
of the implementation:

| Effect | Specified | Shipped | Why |
| --- | :-: | :-: | --- |
| Card hover | Yes | **Yes** | `transition-colors` (17 uses), `transition-shadow` (1) |
| Band entry | Yes | **No** | The `.animate-rise` utility existed and was used by zero components, while still shipping in the CSS bundle. Removed in Phase 14; eight lines to restore if a real use appears. |
| Stat count-up | Yes | **No** | It would animate towards institute statistics that do not exist. Cannot be built without inventing them, so it is not built. |

`@media (prefers-reduced-motion: reduce)` in the base layer governs every
transition that does ship.

---

## 6. Theming mechanics

Three viewer states, not two:

1. **No stamp** (default "system") — only `prefers-color-scheme` applies
2. **`data-theme="light"`** — beats a dark OS setting
3. **`data-theme="dark"`** — beats a light OS setting

`:root` carries the **complete** light palette. The dark blocks redefine only
the semantic layer. No colour is ever declared solely inside a media query or
`[data-theme]` block — that is the classic bug where a page renders one theme's
text on the other theme's ground.

---

## 7. Outstanding on the brand

| Item | Status | Impact |
| --- | --- | --- |
| Vector logo (SVG / AI / PDF) | ❌ Not supplied | We have a 2560px JPEG. Fine for raster use; it will soften on a large hero and cannot be recoloured cleanly. **Requested.** |
| Transparent version (PNG/SVG) | ❌ Not supplied | The JPEG has white baked in, so the logo cannot sit on a navy band or a photograph without a white box around it. **This blocks the dark-theme header and the footer.** |
| Horizontal / stacked lock-ups | ❌ Not supplied | Current mark is square-ish with the wordmark beneath. A horizontal lock-up is needed for the desktop header. Can be composed from the vector once supplied. |
| Monochrome version | ❌ Not supplied | Needed for the favicon at 16px and any single-colour print use. |
| Clear-space / min-size rules | ❌ Not defined | We will propose these and the institute can confirm. |

None of these block Phase 3. All of them block a polished header, so they are
worth requesting now.

---

## Provenance

Colours sampled with Pillow over the full 2560×2560 master (every pixel counted,
not eyedropped). Contrast computed with the WCAG 2.2 relative-luminance formula.
Both are reproducible — the commands are in the session log and the results are
in the tables above.
