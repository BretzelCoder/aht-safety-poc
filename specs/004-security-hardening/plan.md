# Plan — Spec 004

> Validated: 2026-11-18 (the owner approved the fixes at the end of the audit discussion; this plan records the HOW and the measured facts that shaped it)
> Amended 2026-11-18 while implementing T-04, recorded per rule 5: the browser hashes inline scripts **after** the HTML input preprocessing (CRLF → LF), so the hashes, verifierCsp and the copy re-pinning all hash the LF-normalized content; `verifierAnalytics` now skips `gc.zgo.at` inside the CSP meta (policy text, not analytics code); the copy builders re-pin the copy's hashes so the deliberately broken copies of the start-up guard keep working.

## 1. Measured facts (2026-11-18, headless Chromium 159 on a Windows CRLF checkout)
1. **`'self'` does not allow `file://` subresources.** A copy of the page with a policy lacking `file:` never starts: every script is blocked, no network request is even attempted, the start-up guard itself is unreachable. → the policy must carry the `file:` scheme source in `script-src`, `style-src` and `default-src` (harmless on HTTPS: browsers refuse `file:` subresources there anyway).
2. **A hex digest is not a hash.** A first attempt embedded `sha256-<hex>` digests: Chromium rejected them (CSP hashes are base64). → the S2 check computes base64, exactly like the browser.
3. **Hash-allowlisted inline scripts work**, on `file://` and on an origin, as soon as every inline script of the page is listed (a policy with one hash and two inline scripts blocks the second — probe "mini page", recorded as negative input for S2).
4. **The browser hashes after CRLF → LF normalization.** A correct base64 hash computed on the raw CRLF bytes of a Windows checkout is still rejected; the same hash computed on the LF-normalized script content is accepted (the HTML input preprocessing normalizes line endings before the policy is compared). → hashes, checker and copy re-pinning all hash `contenu.replace(/\r\n/g, '\n')`; verifierCsp reads `index.html` as it is on disk and does the normalisation itself, so the same check holds on a CRLF and on an LF checkout (test with both).
5. **Deliberately broken copies touch inline scripts.** The start-up-guard tests patch the manifest or inject a registration through inline script edits; hash-locked, every such copy would break before showing its own message. → the copy builders re-pin the copy's policy on its own inline scripts (function `recalageCsp` in `tests/helpers/copie-page.mjs`, applied by `telecharger`, `copierPage` and its `ecrire('index.html', …)`).

> Amended 2026-11-19 after the review of the branch, per rule 5: the CSP check allowlists sources per directive and reports unexpected directives and inline scripts with attributes; the hook check requires the assignment inside the guard's block, comments blanked; stale wording about "raw bytes / CRLF kept" corrected in the spec, `index.html` and the helpers.

## 2. Shaping choices
- **Where the policy lives**: one `<meta http-equiv="Content-Security-Policy">` right after `<meta charset>`, before any resource. GitHub Pages sends no header, and meta-CSP cannot set `frame-ancestors` anyway (out of scope, F2).
- **Directive set**: `default-src 'self' file:`, `script-src 'self' file: <inline script hashes> https://gc.zgo.at`, `style-src 'self' file: 'unsafe-inline' https://fonts.googleapis.com` (`unsafe-inline`: the page styles by `style=` attributes everywhere; no `<style>` element exists), `font-src https://fonts.gstatic.com`, `connect-src https://<endpoint>.goatcounter.com`, `img-src 'self' file: data: https://*.goatcounter.com` (GoatCounter's image-beacon fallback), `base-uri 'none'`, `form-action 'none'`.
- **Hash comments**: the meta carries a French comment above it explaining that the hashes pin the inline scripts, that `node scripts/stamps.mjs` runs first (the manifest lives inside one), and that the S2 check fails on every other drift.
- **Hook gate**: one `if (location.hostname !== GC_HOST)` guard reusing the same constant as `js/analytics.js` (same allowance, same host, one source of truth), `js/test-hook.js` returning early on the published site.
- **CI pins**: full 40-hex SHAs resolved from the upstream tags with `git ls-remote` (checkout v7, setup-node v7, cache v6 — all lightweight tags, so the tag object is the commit), version kept as `# vX` comment.
- **Which checks, where**: three pure functions in `tests/helpers/controles-statiques.mjs` (policy, hook gate, CI pins), exercised in `tests/statique.spec.mjs` against the real files and against deliberately broken copies (the house pattern of T-04/T-05). The copy funnel of the start-up-guard spec (spec 003) re-pins the copies' hashes: see measured fact 5.

## 3. Risks
- **The policy breaks the page in a way the suite does not reach** (fonts CSS, async analytics on the rehearsal server): the suite already covers the start-up guard, the three-language renders and the GitHub Pages rehearsal; no pause, no plus.
- **CSP silent for visitors**: mitigated by S2 (nothing loads that the policy does not allow, else the check fails first).
- **`file:` weakens the published policy?** No: `file:` is inert behind HTTPS (browser refuse), measured fact 1 stays a local-copy need.

## 4. Task order (atomic commits, `feat(004):` …)
1. **T-02** hook gate (code + stamps + check S6 + negative test) - smallest, validates the harness before the policy.
2. **T-03** CI pins (workflow + check S7 + negative test).
3. **T-04** CSP (meta + S2 check + negative tests), stamps first, hashes computed last.
4. **T-05** full `npm test`, update this plan if a measured fact moves (rule 5).
