# Architecture decisions (ADR)

Claude must re-read this file before any `/plan`. Challenging a decision goes through a human discussion, never through the code.

## ADR-1 — One self-contained HTML file, vanilla JavaScript, no build
**Decision**: the whole simulator lives in `index.html` (HTML, CSS, vanilla JavaScript, HTML5 canvas), with no framework, no package manager and no build step. It is published as is by GitHub Pages from `main`.
**Why**: a teaching demo must open anywhere, even offline from a downloaded copy, and stay readable end to end by someone learning the concepts. Nothing to install, nothing to keep up to date, nothing that can break between two visits.
**Rejected alternatives**: a framework with a bundler (React, Vite…): a build chain and dependencies to maintain for no user benefit at this size. Several files loaded as ES modules: modules do not load from `file://`, which breaks the "open the file" use.
**Amendment 2026-11-15 (spec 001)**: development-only packages are allowed for the automated checks (`package.json` with `devDependencies` only, starting with `@playwright/test`). What stays: the published page loads no package, needs no build, keeps everything in `index.html` and still opens from a downloaded copy with nothing installed. Why: checking rendering, console errors and scenario outcomes needs a controlled real browser, and the owner chose robust tooling over a home-made, package-free harness.
**Amendment 2026-11-15 (spec 003)**: "one self-contained `index.html`" becomes "an `index.html` entry file plus a small set of the page's own plain files, each listed in a map (README and `CLAUDE.md`)". What stays: the published page loads no package, needs no build step, no server and no installation; it opens from `file://` and from a downloaded copy; the whole project is plain files readable end to end. Why: the file reached about 2,200 lines and the owner measured four costs (finding and reading, reviewing and merging diffs, context spent by Claude, testing a module alone) against a benefit of "one file" that the folder form keeps almost entirely (offline, no tooling). Still rejected: a bundler, a framework, a package loaded by the page, a build step that assembles a single file. Validated by the owner on 2026-11-15; applied by lot 2 of spec 003.

## ADR-2 — Translation built into the page, French by default
**Decision**: French, English and German, with French as the default. Static French text stays in the HTML and is marked with `data-i18n*` attributes; English and German live in a `STATIC` dictionary; dynamic messages are `[fr, en, de]` triplets in `MSG`. Log entries and supervisor reasons are stored as message keys with parameters and translated at display time. The language comes from `?lang=`, then the choice remembered in `localStorage`, then French. Technical terms, states, codes and standards are not translated.
**Why**: switching language must re-translate everything on screen, including the event history, without reloading the simulation. Keeping French in the HTML keeps the default page readable in the source and avoids duplicating the long guide.
**Rejected alternatives**: an i18n library: a dependency, against ADR-1. One HTML file per language: three copies of the simulator to keep in sync. Storing log entries as pre-translated text: the history could not follow a language switch.

## ADR-3 — Cookie-free analytics with GoatCounter, on GitHub Pages only
**Decision**: visits are counted with GoatCounter (shared dashboard `bretzelgoatcounter`), loaded only when the page is served from `bretzelcoder.github.io`. Page views use the path without query string; `?ref=` is reported as the referrer. A few anonymous events are recorded, namespaced `aht-safety-poc/…`: start language, language switch, scenario launched, guide opened.
**Why**: knowing whether the demo is used and where visitors come from, without cookies, consent banner or personal data (constitution principle 5). Loading nothing locally keeps a downloaded copy private and offline-friendly.
**Rejected alternatives**: Google Analytics: cookies, consent banner, heavier script. Cloudflare Web Analytics: needs a Cloudflare account and gives less control over events. No analytics: no way to know whether the demo is used.

<!-- Amend an ADR rather than rewriting it:
**Amendment YYYY-MM-DD (spec NNN)**: what changes, what stays, why. -->
