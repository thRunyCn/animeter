# Design

<!-- impeccable:design-schema 1 -->

## World

**Colour chapters.** Every anime already carries a colour — the tone sampled from its cover — so Animeter is built as a run of flat, full-bleed fields butted edge to edge, and each series page is drenched in that show's own colour. There are no cards, rules, shadows or gradients: surfaces separate by stepping in tone, not by chrome. One typeface, square corners, data carried in two signal colours.

The home hero splits the first viewport across two fields: the ground above, the No. 1 show's tone below, with a two-line headline cut by the seam that changes ink across it. Tapping any of the top-six covers repaints the lower field in that show's colour and rewrites the sentence with its manga hand-off. The sticky header takes the colour and ink of whichever chapter is passing under it.

## Mode

Read / Operate. Someone mid-show wants an answer in seconds — where people quit, which filler to skip, which chapter to read next — then acts. Expression lives in the full-bleed colour and the display type; scanability, real data and native form controls outrank decoration inside each section.

## Type

One family: **Schibsted Grotesk** (self-hosted variable, weights 400–800), set tight.
- Display 800, tracking −0.045em to −0.075em, leading .74–.9 (hero 150px, footer wordmark full-bleed as SVG).
- Lead / answer 700 at clamp(1.5rem, 2.4rem).
- Body 400/600, 17–19px, measure ≤ 70ch.
- Small 16px (`--step-small`); true fine print 13–14px (`--step-fine`) for vote counts and the legal row only.
Japanese titles fall back to a system JP sans.

## Colour

- Grounds: `--ground #e7e8e4`, steps `#dbddd8` / `#cdd0ca`.
- Ink `#1c1c1c`, muted `#3d4247` (full ink on coloured fields for contrast).
- Chapter fields: slate `#a6b3bc`, sage `#b7c8be`, blush `#d6c4b8`, olive `#2c3620` (ink `#e3e2da`).
- Per-series `--tone` is the cover colour; `toneInk()` picks dark or white ink for ≥4.5:1 and deepens the field when neither reaches it, and computes a `--deep` for the lower headline half.
- One data colour: brick `--hot #b8402a` for the manga hand-off, filler, and "where people quit" — the three "stop / start reading here" signals. Nothing else is red.

## Layout

Full-bleed sections, inner content on one `--m` (16–40px) margin pair, max 1520px. Home: two-field hero → rankings on sage → statement-tile mosaic → FAQ bands (one tone per question) → olive footer, wordmark first. Series: tone-drenched header chapter (covers left, title + answer + facts right), tabs, pane on ground, related wall on blush. Square corners throughout; facts and tabs are light insets on the field, never bordered boxes.

## Motion

Emil Kowalski easing: ease-out `cubic-bezier(.23,1,.32,1)`, in-out `cubic-bezier(.77,0,.175,1)`, never ease-in. The seam headline arrives on load (seamA/seamB, .7s); lower chapters rise once via IntersectionObserver (`data-r`, 70ms stagger); the header colour-follow runs on scroll (300ms transition); hero cover-pick repaints the field (.45s). Controls answer the press (`:active` scale .97, 100–160ms), hover gated by `(hover:hover)`. Transform/opacity only; full reduced-motion fallback (no entrance offset, instant field repaint).

## States

Hover, `:active`, `:focus-visible` (3px ink ring), disabled (pager, send), loading (profile "Loading your list"), empty ("No series matches", "Your list is empty", "No Animeter ratings yet"), error (sign-in code wrong, save failed) — all in the product's own voice. Covers show the show's tone while the picture loads and a titled placeholder when it is missing.

## Browser surfaces

Selection ink/ground, 3px focus rings from the field ink, tabular numerals on scores, ranks, charts and the drop map. The footer wordmark ships as inline SVG so it scales to the full page width.

## Checks

design-taste inspector: **0 FAIL** on home and on a series page at 1440 / 768 / 390. `impeccable detect`: clean. Functional tests pass (navigation, tag filter, rating, drop report, OTP sign-in, cover images, spoiler reveal). Remaining inspector WARNs are defended: one typeface by intent (the sheet's dealt faces are overridden by the owner's pinned Schibsted Grotesk), no video (code-led build, no footage source), size count (a data-dense catalogue), and still-page on the sparse signed-out series pane.

## Known gaps

- The drop-map chart, arc bars and filler grid keep the previous build's data visualisation; they inherit the new tone and ink but were not recomposed.
- No motion footage; the mosaic's one photographic tile is a cover, not a clip.
