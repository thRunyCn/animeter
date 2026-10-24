# Design

<!-- impeccable:design-schema 1 -->

## World

**The board.** The whole site is one dark board of tiles fitted edge to edge with 8px gaps, like covers laid out on a desk at night. Every tile holds one thing: the name, a cover, a sentence, a figure, a list, a link. There are no bands, rules or shadows; tiles separate by stepping in tone. The only colour that isn't stone comes from the shows: each anime's cover tone is the accent wherever that show is on screen (the "My list" tile, the chapter tile, the open FAQ answer, the footer link).

On this page, **each show's anime cover and its book cover** become **a pair of tiles side by side, with the chapter where the anime stops printed in the tile beside them**.

The live thing: the first screen's six-cover picker. Choosing a show swaps both cover tiles (they open like shutters from the bottom edge), rewrites the chapter and the sentence, and repaints every accent tile on the page in that show's colour.

## Mode

Read / Operate. Someone mid-show wants an answer in seconds (where people quit, which filler to skip, which chapter to read next) and then acts. Expression lives in the board's scale and the covers; inside each tile, real data, native controls and scanability win.

## Type

One family: **Instrument Sans** (self-hosted variable, weight 400–700, width 75–100%). General Sans was dealt but its host is unreachable from the build, so Instrument Sans stands in.
- Display 600 at width 80%, tracking −0.035em to −0.055em, leading .8–.95 (hero name 15vw, "Rankings" 12.4vw, footer wordmark full tile width as SVG).
- Statements 500 at 20–28px, leading 1.3.
- Body 400/500, 17–19px, measure ≤ 70ch.
- Small 16px; true fine print 13–14px only for counts on tags and pick numbers.
Japanese titles fall back to a system JP sans.

## Colour

- Ground `#171615`, tile steps `#22211f` / `#2d2b28` / `#3a3834`.
- Ink `#eeece8`, muted `#b4afa7`.
- Paper tile `#eeece8` with ink `#1a1918`; stone tile `#cdc3b6`.
- Accent: the current show's `--tone` (its cover colour); `toneInk()` picks dark or white ink for ≥4.5:1.
- Data: coral `--hot #e5704f` for filler and "people quit"; mixed episodes `#f2b6a2`. Nothing else is warm.

## Layout

A 12-column board, 8px gaps and 8px outer margins, one radius (6px, 4px inside tiles).
- Home: header tiles → six-tile first screen (name, anime cover, book cover, statement, chapter tile in the show's colour, picker) → rankings (title tile, tools tile, row tiles, pager) → "Where the manga picks up" (stone heading tile, eight book covers with their chapter, a paper marquee tile) → three stepped figure tiles → FAQ (sticky heading, accordion tiles, one open at a time) → footer as the last two rows of the board.
- Series: header tiles → sticky pair of cover tiles on the left; title (paper), answer (show colour), three fact tiles and the rating tile on the right → tab strip tile → pane tile → related covers.
- Phone: one or two columns of tiles; name, statement, covers, picker, chapter in that order.

## Motion

GSAP 3 (ScrollTrigger, SplitText; vendored in `vendor/`) with Emil Kowalski's rules: strong ease-out (`expo.out`, CSS `cubic-bezier(.23,1,.32,1)`), no ease-in, UI under 300ms, transform/opacity/clip-path only. Runs only when GSAP is present, the page is not a prerender snapshot and reduced motion is off; otherwise a short CSS rise plays, or nothing.

- **Board intro (once per load):** tiles settle in at 60ms stagger, the name rises letter by letter inside its tile, the two covers open as shutters (1.1s) while the pictures settle from 1.12 scale.
- **Cover shutter (the signature move):** a pick closes both cover tiles, swaps them and reopens them from the bottom edge; the chapter and sentence lift in. Interruptible: a second pick takes over.
- **Rankings (React Bits ScrollFloat):** the giant word is scrubbed from stretched to set; rows arrive in 40ms batches (opacity, so they stay focusable).
- **Hand-off wall:** book covers open as shutters in batches; the marquee tile (React Bits ScrollVelocity) drifts and leans with scroll speed.
- **Figures (React Bits CountUp):** the stepped tiles rise in order and their numbers count up.
- **Rating (React Bits ClickSpark):** eight ticks in the show's colour burst from the pressed score.
- **Feedback:** every button, tile link and tab scales to .94–.97 on press (100–160ms); hover only under `(hover:hover)`.

## States

Hover, `:active`, `:focus-visible` (3px paper ring), disabled (pager, send), loading ("Loading reports…"), empty ("No series matches", "Your list is empty", "No reports yet"), error (sign-in code wrong, save failed), all in the product's voice. Covers show the show's tone while loading and a titled placeholder when missing.

## Checks

design-taste inspector: **0 FAIL** on home and a series page at 1440 / 768 / 390. `impeccable detect` on the rendered pages at 1440 and 390: only the advisory "one typeface on everything", by intent. Functional tests pass (navigation, tag filter, rating, OTP sign-in, cover images, spoiler reveal). Remaining inspector WARNs are defended: no video (no honest footage source), size count (a data-dense catalogue), the marquee tile measured as an empty middle, and the 13px pick and tag counters.

## Known gaps

- The drop-map chart, arc bars and filler grid keep their earlier data visualisation, recoloured for the dark board.
- No footage; every picture is a cover from AniList.
