# Tasks — Spec 005

Rule for every task that touches a file of `js/`: at the end, `node scripts/stamps.mjs`, then re-pin the hash of the first inline script in the CSP `<meta>` of `index.html` (the failing `verifierCsp` prints the expected value), then the scoped tests, then the commit (plan R3, owner's answer Q1).

- [x] **T-01** Write spec and plan (spec approved 2026-11-19; plan approved 2026-11-19).
- [x] **T-02** The helpers in `js/base.js` (`SafeHtml`, `esc`, `html`, `raw`), README line of `js/base.js` updated, stamps and CSP re-pin; unit test of `html` in the browser page (the five characters, nested `SafeHtml`, arrays, `null`, numbers, the literal parts untouched), with its recorded breakage (S1, AC-5).
- [x] **T-03** The check `verifierEchappement` in `tests/helpers/controles-statiques.mjs` with its seven negative tests (untagged template with `${}` assigned to a sink; untagged `title="${…}"`; `innerHTML = variable`; `insertAdjacentHTML` with a variable; `document.write`; a `raw()` outside the allow-list; a stale allow-list entry) and the single allow-list entry for `js/i18n-apply.js`. **Its first run on the unfixed `js/m4-hud.js` must fail on the 12 sites; the output is recorded in the evidence table before the fix** (S3, AC-1, AC-2).
- [x] **T-04** The setter `hostile(texte)` in `js/test-hook.js` (inside the guard of spec 004) and `tests/echappement.spec.mjs` in French, English and German. **Its first run on the unfixed HUD must fail; the output is recorded before the fix** (S4, AC-3).
- [ ] **T-05** Rewrite of the sinks of `js/m4-hud.js` (plan 5.3) so the check and the browser test go green, with `compare-traces` unchanged (S1, S2, AC-1, AC-3, AC-4).
- [ ] **T-06** `scripts/compare-hud.mjs` (development only) and its recorded breakage; run on scenarios A to G in the three languages against `main` (S2, AC-4).
- [ ] **T-07** Full `npm test` green on Node 24 locally (the known failure of `tests/liens.spec.mjs:127`, action A-17, is reported as such) and the `Checks` run green on GitHub; evidence table complete; self-critique and "rapport d'étonnement" in `docs/continuous-improvement.md`; proposal of the new Convention for CLAUDE.md written for the owner. The pull request only on the owner's explicit request (AC-5).

## Evidence table (per convention "every new check proves it can fail")

| Check | Proof that it fails |
|---|---|
| `html` helper (T-02) | `tests/echappement.spec.mjs`: a copy of `js/base.js` where `esc` does nothing → the test reports "five characters" and "an attribute cannot be closed" (run 2026-11-19, 2 tests green). |
| `verifierEchappement` (T-03) | First run on the unfixed `js/m4-hud.js` (2026-11-19): **35 reports**, among them the 12 `.innerHTML =` lines 41, 45, 57, 67, 71, 72, 74, 81, 82, 89, 91, 102 and 23 untagged templates (`row`, `chip`, `frz`, the log lines…); the same file, kept as `tests/fixtures/m4-hud-avant-spec-005.txt`, is asserted on those 12 lines for good. Negative tests on synthetic snippets: untagged template into `innerHTML`; raw value in an attribute; `innerHTML = variable` and `+=`; `insertAdjacentHTML`, `outerHTML`, `document.write`/`writeln`, `createContextualFragment`, `DOMParser`; `raw()` outside the allow-list; a stale allow-list entry; an unreadable file. Every other file of `js/` and the inline scripts of `index.html` pass. |
| Browser test of S4 (T-04) | First run on the unfixed HUD (2026-11-19, fr, en and de alike): red with 7 findings: the string is not shown verbatim in `#log`, `#reasons`, `#tabs`, `#exL12`; the log line grows attributes (`DIV[class,window.__pwn]`, the string closed the `class` attribute); **17 elements created** from it. Kept as `test.fail()` until T-05, which removes it. A copy of the page whose `esc` does nothing is also reported by `#log`, `#reasons` and the created elements (written now, meaningful once the HUD is fixed, T-05). |
| `compare-hud` (T-06) | *to fill*: a copy where one class or one tooltip of a panel is changed → first difference reported. |
| `compare-traces` unchanged (T-05) | Existing: its recorded breakage of spec 002. |
