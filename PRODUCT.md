# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Anime viewers deciding what to watch next or whether to keep going with a series: someone halfway through a long show wondering if it gets better, someone who wants to skip filler, and someone who just finished a season and wants the manga chapter to read next. Mostly English-speaking, often on a phone. (Inferred from the site's content and the owner's requests; not interviewed.)

## Product Purpose
Animeter ranks 1,001 anime and, for each one, answers the practical questions a watcher has: where other viewers really quit, which arcs are worth it, which episodes are filler, and which manga chapter picks up after the anime ends. Success is a visitor finding that answer in seconds and coming back for the next show.

## Positioning
Most anime databases list scores and synopses. Animeter is built around the moment someone stops watching: drop-off reports from signed-in viewers, filler and arc guidance per episode range, and a sourced manga hand-off chapter for 373 series.

## Operating Context
Visitors arrive from search on a specific show ("does X get good", "X filler list", "X manga after anime"), read one series page, sometimes rate it or report where they stopped, and keep a personal list. Static pages are prerendered for search; votes, ratings and lists load live from Supabase.

## Capabilities and Constraints
- Routes: home, rankings, all anime A to Z, genres, series pages with tabs (overview, seasons, arcs, key events, filler, manga), my list/profile, about, 404.
- Email sign-in with magic link or 6-digit code; rating, drop reports, personal list.
- One source file `page.src.html` builds both the static site (GitHub Pages, `docs/`) and a claude.ai artifact version.
- Static, prerendered HTML; no server. Fonts self-hosted for the static build.
- The Supabase service_role key is never requested or used.
- Covers come from AniList; each series carries a `tone` colour taken from its cover.

## Brand Commitments
Name: Animeter. Interface copy is English. Owner communicates in Turkish.

## Evidence on Hand
Real data: AniList scores and popularity (fetched 2026-10-18), 1,001 series, 373 sourced manga hand-off chapters, arcs, key events and filler ranges with sources. Anime and manga cover art per series (`docs/covers/`). There are no testimonials, user counts or press; none may be invented. Visitor drop-off data starts empty until people report.

## Product Principles
- The answer first: every series page leads with where to stop, skip or continue.
- Sourced or labelled: every chapter, arc and filler range has a source; community numbers say how many people reported.
- Fast on a phone: static pages, no blocking scripts.
- The show is the hero: cover art and the series' own colour carry the identity, not chrome.
