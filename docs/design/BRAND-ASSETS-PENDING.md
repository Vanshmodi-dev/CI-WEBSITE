# Brand assets — outstanding dependency

**Status:** Open · does not block Phase 3 · blocks specific UI listed below
**Owner:** Commerce Insight
**Raised:** 21 August 2026

## What we hold

| Asset | File | Notes |
| --- | --- | --- |
| Primary mark | [`assets/brand/commerce-insight-logo-master.jpg`](../../assets/brand/commerce-insight-logo-master.jpg) | 2560×2560, JPEG, **RGB with no alpha channel** (verified). White background baked in. |

Everything the design system needs for *colour* came from this file, so the
palette is settled (see [`DESIGN-TOKENS.md`](DESIGN-TOKENS.md)). What is missing
affects *placement*, not colour.

## What is missing

| # | Asset | Blocks | Severity |
| --- | --- | --- | --- |
| 1 | **Transparent master** — SVG preferred, or PNG with alpha | The mark on any navy band, any photograph, and the dark theme. Currently the footer and dark-theme header fall back to a typographic wordmark. | **High** |
| 2 | **Vector master** — SVG / AI / PDF | Crisp rendering above ~200px. The JPEG will soften on a large hero lock-up. Also needed to derive #3 and #4 cleanly. | Medium |
| 3 | **Horizontal lock-up** | A proper desktop header. We currently compose the square mark + a typographic name side by side. | Medium |
| 4 | **Monochrome / single-colour version** | The 16px favicon, and any single-colour print use. | Medium |
| 5 | **Clear-space and minimum-size rules** | Consistent placement. We can propose these from the artwork and have the institute confirm. | Low |

## The constraint this puts on the code

Enforced in [`src/components/domain/logo.tsx`](../../src/components/domain/logo.tsx):

- `<LogoMark>` — the JPEG. **Light grounds only.**
- `<LogoWordmark>` — the name set in Source Serif 4. Safe anywhere. Used by the
  footer and any dark surface.
- `<LogoLockup>` — composes the two, and omits the image entirely when
  `onBand` is set.

### Why we are not keying out the white

Removing a white background from a JPEG is destructive. JPEG compression leaves
non-uniform pixels around every edge, so a chroma-key on a mark with curves, a
pen nib and fine serifs produces haloed, semi-transparent fringes. The result
would look visibly worse than not using the logo at all — and it would be
irreversible without the original.

This is also an explicit client instruction: use the JPEG only where its white
background is appropriate, and wait for the official asset.

## What unblocks when each arrives

- **#1 transparent master** → the mark returns to the footer and the dark-theme
  header; `<LogoWordmark>` stops being a fallback and becomes a deliberate
  choice for small sizes only.
- **#2 vector** → hero lock-ups and OG images render crisply at any size.
- **#3 horizontal lock-up** → `<LogoLockup>` collapses to a single image.
- **#4 monochrome** → real favicon and app icons ship.

None of these change the palette, the type pairing, or any token. They are
placement fixes, isolated to one component file by design.
