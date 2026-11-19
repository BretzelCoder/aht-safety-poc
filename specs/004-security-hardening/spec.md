# Spec 004 — Security hardening (CSP, test-only hook, pinned CI actions)

> Status: APPROVED
> Created: 2026-11-18 · Approved: 2026-11-18 (the owner validated the fixes M1, M2 and F1 of the security audit done in session on 2026-11-18; M3 is explicitly postponed, see section 5)
> Input: full security audit of the repository (static review of all 38 files plus the live GitHub Pages headers). Findings: M1 no CSP with full-privilege third-party scripts, M2 `window.__sim` exposed on the published site, F1 workflow actions pinned by mutable major tags, M3 unescaped HTML interpolation in the HUD (latent only), F2 no framing protection (not actionable behind GitHub Pages).

## 1. Problem / Why
The page is a static site with no backend, no user input and no secrets, so no exploitable vulnerability was found. But three hardening gaps remain, all confirmed by the audit:

- **M1** — GitHub Pages sends no Content-Security-Policy header, and the page loads two third-party scripts (`fonts.googleapis.com` CSS, GoatCounter `count.js` from `gc.zgo.at`, loaded without `integrity`) that run with full privileges in the page's origin. A compromise of either host would mean arbitrary JavaScript on the published page. Today the page keeps no visitor data (no account, no form), but previewing the risk costs almost nothing.
- **M2** — `js/test-hook.js` exposes `window.__sim` on the published site, including `l1Inject`, which forges a setpoint **with a recomputed checksum**: on the page that teaches that a forged setpoint is rejected, a forged one is accepted in production. Any script of the page (GoatCounter in practice) could call it.
- **F1** — the workflow pins `actions/checkout@v7`, `actions/setup-node@v7`, `actions/cache@v6` by mutable major tag.

## 2. Users
- **A visitor** of the published page or of a downloaded copy: must notice **no difference at all** (same look, same behaviour, same three languages, same analytics, same offline copy). Their protection is the goal.
- **The owner and contributors** (including Claude): tests must keep working from disk (`file://`) and from the rehearsal server, without any new setup.

## 3. Expected behaviour (WHAT, not HOW)
### Lot 1 — Content Security Policy (M1)
- **S1 — A policy on the page.** As a visitor, when I open the published page or a downloaded copy, then the page carries a `Content-Security-Policy` `<meta>` tag that allows only: the page's own files (`'self'`, plus `file:` so the double-clicked copy keeps working — measured: `'self'` alone blocks `file://` subresources in Chromium), the pinned hashes (base64 `sha256-…`) of the inline scripts of `index.html`, and the two allowed third-party hosts (Google Fonts for styles and fonts, `gc.zgo.at` for the analytics script, the GoatCounter endpoint for its beacons). `base-uri 'none'` and `form-action 'none'`. Everything else is blocked.
- **S2 — The policy cannot drift.** As a contributor, when an inline script of `index.html` changes, or an origin is added to the policy that is not one of the pages's allowed hosts, or a directive is missing, then an automated check fails and names what happened. The check computes the same base64 hash the browser computes, on the script content with CRLF brought back to LF (measured: a hex digest is invalid, and the browser normalises line endings before comparing, so a hash of the raw CRLF bytes is rejected on a Windows checkout; amended 2026-11-19, it said "raw bytes, CRLF must be kept" and the plan's measured fact 4 had already shown the opposite). The sources are allowlisted **directive by directive** (`'unsafe-inline'` only in `style-src`, `data:` only in `img-src`, a hash only in `script-src`), and a directive outside the expected set is reported.
- **S3 — Nothing changes for the visitor.** As a visitor, the page still starts (the start-up guard still runs: both its inline scripts are allowed by hash), the fonts still load, analytics are still reported on GitHub Pages only, and the whole of `npm test` stays green.

### Lot 2 — The test-only hook (M2)
- **S4 — No hook on the published site.** As a visitor of `bretzelcoder.github.io`, `window.__sim` does not exist (there is no test hook to call for any script of the page).
- **S5 — The checks keep the hook.** As a contributor or as Claude, when the automated checks run locally or on GitHub, then the hook exists as before (`file://`, `localhost`), and no test changes its expectations.
- **S6 — The gate cannot drift.** An automated check fails when `js/test-hook.js` creates `window.__sim` outside the block of the host guard that exempts the published site (a guard or an assignment that only exists in a comment does not count; amended 2026-11-19).

### Lot 3 — Pinned CI actions (F1)
- **S7 — Immutable pins.** As the owner, each `uses:` of the workflow names the action by its full 40-hex commit SHA (with the version kept as a comment), so a moved tag cannot change what runs on my repository. An automated check fails on a `uses:` that is not SHA-pinned.

## 4. Edge cases and errors
- **`file://` + `'self'`** nullifies the policy for local scripts but is mandatory so the downloaded copy keeps working (S1). CSP violations are silent for visitors: the static check (S2) is the guard, not the console.
- **The stamps manifest lives inside an inline script.** `node scripts/stamps.mjs` rewrites the hashes when the manifest changes; the CSP hash of the registry script is computed **after** the stamps are updated. The S2 check re-derives the hashes from the file: a stale hash (edited inline script, forgot the policy) fails `npm test`.
- **The page must start even when the policy itself is broken** (typo in the meta): the start-up guard cannot be reached, so no message shows. Accepted: the S2 check is the safety net, and a typo there is caught before publication.
- **GoatCounter sends beacons** (XHR/`sendBeacon`, with an image fallback): `connect-src` and `img-src` both allow its endpoint.
- **A future inline script** (the page should have none besides the two known ones): the check fails until its hash is added to the policy — deliberate friction, documented by a comment in `index.html`.

## 5. Out of scope (explicit)
- **M3** (unescaped HTML interpolation in the HUD, `rp()`): latent only, no reachable vector; postponed by the owner to its own spec.
- **F2** (framing): `frame-ancestors` cannot be set on GitHub Pages (headers impossible, meta ignored).
- Any change the visitor could see: no UI, no model, no wording, no favicon, no new dependency.

## 6. Acceptance criteria
- **AC-1** — `index.html` carries the policy of S1; the whole of `npm test` stays green (including the pages rehearsal under `/aht-safety-poc/` and the three-language renders).
- **AC-2** — the S2 check exists, with negative tests: a policy without an inline script's hash, a foreign origin, a directive missing — each reported, each proven able to fail.
- **AC-3** — `window.__sim` absent on `bretzelcoder.github.io` (S4): the S6 check with its negative test (guard removed → reported), plus the existing hook-based suites green unchanged (S5).
- **AC-4** — the three workflow actions pinned by SHA (S7): the check with its negative test (a mutable tag reintroduced → reported).
- **AC-5** — release stamps current (`node scripts/stamps.mjs`), README map unchanged (no file added or removed), no translation added or required.
