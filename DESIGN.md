# Design

<!-- impeccable:design-schema 1 -->

## World

**The screening room.** The site is a dark room where the shows bring their own light. Ground is near-black `#09090a`; the only colour comes from the covers and from each show's tone, pushed to a vivid version (`vivid()`) for accents and a near-black version (`deepOf()`) for the fields a show owns. Sections are full-bleed scenes, not boxes; tiles remain only where the content is a list or a figure.

The live thing: the first screen is a tilted wall of the 56 most-watched covers drifting up and down in alternate columns (faster when you scroll), dimmed behind the question "Where people stop watching", with a search box that answers instantly: type a title and each result already says where to read on ("Read the manga from chapter 81").

Then **the top ten** as five-by-two big covers (a snap row on phones) and **the story** of No. 1: its anime cover steps aside, the manga cover opens and the chapter counts up. Scrolling only moves the page: nothing is pinned or scrubbed, each section plays its animation once when it arrives (owner's call).

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

- Ground `#09090a`, steps `#131315` / `#1c1c1f` / `#28282c`. Ink `#f3f2ef`, muted `#a4a4a9`. Paper `#f3f2ef` on `#0d0d0e` for the few solid tiles.
- Show tone: `--tone` = the cover colour at saturation 58–86%, lightness 62% (ink picked by `toneInk()` for 4.5:1); `--deep` = the same hue at lightness 10% for the section a show owns.
- Data: `--hot #ff6a4d` for filler and "people quit". Nothing else is warm.

## Layout

- Home: floating header (blurred bar over the first screen) → full-screen cover wall with the headline, lede, actions and the finder → top ten grid (snap row under 900px) → story with No. 1 → rankings on the black ground → "Where the manga picks up" wall → three figure tiles → FAQ → footer.
- Series: header → pair of covers on the left; title on the show's deep field, the answer in the show's vivid tone, three fact tiles, rating → tabs → pane → related covers.
- Gutters `clamp(16px,4vw,64px)` for scenes; 8px board inside lists.

## Motion

GSAP 3 (ScrollTrigger, SplitText) plus Lenis smooth scrolling, all vendored in `vendor/`, with Emil Kowalski's rules: strong ease-out, no ease-in, UI under 300ms, transform/opacity/clip-path only. Runs only when GSAP is present, the page is not a prerender snapshot and reduced motion is off; otherwise everything is static and complete.

- **Opening:** the cover wall settles out of the dark (scale 1.14 → 1), the headline rises line by line from a mask, then lede, finder and actions.
- **Cover wall (React Bits ScrollVelocity, ported to columns):** alternate columns drift up and down at a steady pace on GSAP's ticker, unlinked from scroll.
- **Top ten:** on arrival the heading rises and the covers open as shutters in order.
- **Story:** a timed sequence on arrival: the anime cover steps aside, the manga cover opens from the bottom edge, the lines light up, the chapter counts up (React Bits CountUp).
- **Rankings (React Bits ScrollFloat, played once rather than scrubbed), hand-off wall shutters, figure CountUp, title marquee at a steady drift, rating ClickSpark.**
- **Feedback:** presses scale to .94–.98 in 100–160ms; hover only under `(hover:hover)`.

## States

Hover, `:active`, `:focus-visible` (3px paper ring), disabled (pager, send), loading ("Loading reports…"), empty ("No series matches", "Your list is empty", "No reports yet"), error (sign-in code wrong, save failed), all in the product's voice. Covers show the show's tone while loading and a titled placeholder when missing.

## Checks

design-taste inspector: **0 FAIL** on home and a series page at 1440 / 768 / 390. `impeccable detect` on the rendered pages at 1440 and 390: only the advisory "one typeface on everything", by intent. Functional tests pass (navigation, tag filter, rating, OTP sign-in, cover images, spoiler reveal). Remaining inspector WARNs are defended: no video (no honest footage source), size count (a data-dense catalogue), the hero 'void' (the cover wall fills it; the inspector reads background images as empty), and the snap row of the top ten on phones (cut on purpose to show it scrolls).

## Known gaps

- The drop-map chart, arc bars and filler grid keep their earlier data visualisation, recoloured for the dark board.
- No footage; every picture is a cover from AniList.
