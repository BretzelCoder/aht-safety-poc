# Plan 001 — Automated checks

> Spec: `specs/001-automated-checks/spec.md` (status APPROVED on 2026-11-15)
> Plan status: APPROVED · Approved: 2026-11-15

## 1. Summary
A development-only test harness, kept out of what the page loads. Static checks read `index.html`, the README and the specs as text. Browser checks open `index.html` from disk in headless Chromium, with network access blocked and `Math.random` replaced by a seeded generator, pause the animation loop and drive the simulation step by step through the existing `window.__sim` test hook. One test runner (Playwright Test) runs both kinds, so one command gives one report. A small link-check script runs after it and only prints warnings. A GitHub Actions workflow runs the same command on every push and pull request. The page itself gets two invisible additions: the translation tables are exposed on `window.__sim`, and `t()` records any key it cannot find.

## 2. Requirement traceability
| Requirement (spec) | Technical answer (this plan) |
|---|---|
| S1 / AC-1 | `npm test` at the repository root runs `playwright test` (static and browser checks) then `node scripts/check-links.mjs`. Every failure names the file, key, language or scenario in its assertion message. |
| S2 / AC-3 | `.github/workflows/checks.yml`, triggered on `push` (all branches) and `pull_request`; the job status appears on the commit and the pull request. No branch protection (spec section 5). |
| S3 / AC-4 | `tests/static.spec.mjs`: the inline script is extracted and compiled with `node:vm` (`new vm.Script`) without running it; the error is reported with its line number in `index.html`. |
| S4 / AC-5 | Static part (`tests/static.spec.mjs`): every `data-i18n*` key of the HTML exists in `STATIC.en` and `STATIC.de`; `STATIC.en` and `STATIC.de` have the same keys; every `MSG` entry has three non-empty strings; every string literal of the script shaped like a message key (`namespace.name`, namespace among those of `MSG`) exists in `MSG`. Runtime part (`tests/simulation.spec.mjs`): every key `t()` failed to find during all scenario runs, in all three languages, fails the check. The tables are read from `window.__sim.i18n`. |
| S5 / AC-6 | `tests/render.spec.mjs`, one test per language: open `index.html?lang=xx`, collect `pageerror` events and console errors (except the expected failures of blocked external fonts), then check `<html lang>`, the document title and the first log line against the language. |
| S6 / AC-7 | `tests/simulation.spec.mjs`, one test per scenario, outcomes read from `sim.log` (codes), truck states, `sim.collisions`, speeds and plan tags. Scenario D runs twice: losses forced to 100 % (expects `ORDER_NOT_APPLIED`), then periodic publishing (expects the stop state reached, no `ORDER_NOT_APPLIED`). Scenario E: 75 % expects `CAN_BRAKE_DEADLINE` then `CONTROLLED_STOP`; 90 % expects `DM1_BRAKE_CMD_TIMEOUT` then `EMERGENCY_BRAKE`. Pinned thresholds (measured on 2026-11-15): deadline missed from 67 %, watchdog from 84 %. |
| S7 / AC-8 | Same file. Model functions on `window.__sim` (`brakeEnvelope`, `stopDistance`): loaded downhill at −10 % (42.2 m) > empty flat (20.2 m) at 40 km/h; same deceleration at 160 t and 180 t with limit `adhesion`, limit `brake capacity` at 400 t; watered road: empty +37 % (check: > +30 %), loaded 0 % (check: < 1 %). Simulation: at every step of every scenario run, no truck position exceeds its movement authority; network cut: all trucks stop, no `EMERGENCY_BRAKE`; emergency stop: state stays `EMERGENCY_BRAKE` after the fault is removed, until "Re-arm" is clicked. |
| S8 / AC-10 | `tests/static.spec.mjs`: read the `Status:` line of each `specs/*/spec.md` except `000-template`; DRAFT or IN REVIEW fails when the checks run on `main` or on a pull request into `main` (from `GITHUB_REF` / `GITHUB_BASE_REF` in CI, from the current git branch locally). On other branches the check only lists the statuses. |
| S9 / AC-11 | `tests/static.spec.mjs`: "not a safety tool" and "not affiliated" present in the README and in the header comment of `index.html`. |
| S10 / AC-12 | Static: the analytics loader is guarded by `location.hostname === GC_HOST` with `GC_HOST = 'bretzelcoder.github.io'`, and every `track('…')` literal starts with `aht-safety-poc/`. Runtime (`render.spec`): opened from disk, the page requests nothing from `gc.zgo.at` or `goatcounter.com`. |
| S11 / AC-13 | `scripts/check-links.mjs`: collects the `http(s)` links of the README and of the `href` attributes of `index.html`, deduplicated; one request each, 15 s timeout, redirects followed. Status ≥ 400, timeout or network error: warning (`::warning::` annotation on GitHub). Exit code always 0. |
| Edge case: randomness / AC-9 | An init script replaces `Math.random` with a seeded generator before the page runs; each test pauses the loop (`ENV.paused = true`), re-seeds, then calls `resetSim()`, so the random draws no longer depend on how many animation frames ran. Verified with `--repeat-each=10`. |
| Edge case: no network / AC-14 | Every browser test aborts all requests that are not `file://`. Font failures caused by that are the only console errors ignored. One manual run with the network off during `/implement`. |
| Edge case: composed keys | `hud.k` + `MAX`/`COMFORT`/`AUTH` and `code.` + codes are declared as key families in the static test; the runtime record of missing keys covers whatever the scenarios actually compose. |
| Edge case: untranslated terms | The checks only test that a key exists in every language, never that its text differs between languages, so terms identical by design are never reported. |
| Edge case: template | `specs/000-template` excluded from S8. |
| Edge case: external sites | Handled by the warning-only link check (S11). |
| Edge case: emergency fix | No branch protection; the owner can always merge (S2). |
| AC-2 | All checks green on the branch before the pull request; the link check result is printed. |
| AC-15 | `render.spec` records every request: only `index.html` from disk, plus the blocked Google Fonts URLs. Tooling files are never requested. Opening from disk is what every browser test does. |
| AC-16 | `CLAUDE.md` "Project commands" and "Delivery checklist" and a README "Checks" section: install (`npm ci`, `npx playwright install chromium`) and run (`npm test`). |
| AC-17 | Static and browser tests run in parallel workers, Chromium only, cached on GitHub; the first runs' durations are recorded in tasks.md. |

## 3. Architecture
New files, none of them loaded by the page:
- `package.json` (private, `devDependencies` only, scripts `test`, `test:browser`, `test:links`) and `package-lock.json`.
- `playwright.config.mjs`: Chromium project only, viewport 1600×900, parallel workers, test directory `tests/`.
- `tests/helpers/page.mjs`: opens `index.html?lang=xx` from disk with the seeded `Math.random`, blocks the network, records requests and console errors, pauses and re-seeds; helpers to step the simulation and to wait for a log code within a time limit.
- `tests/static.spec.mjs`, `tests/render.spec.mjs`, `tests/simulation.spec.mjs` (sections 2 and 6).
- `scripts/check-links.mjs`: Node only, no dependency (built-in `fetch`).
- `.github/workflows/checks.yml`.
- `.gitignore`: `node_modules/`, `test-results/`, `playwright-report/`.

Changes to `index.html`, invisible to visitors:
- `window.__sim` gains `i18n: { MSG, STATIC, LANGS }` (read-only use by the tests) and `i18nMissing` (a `Set` of the keys `t()` could not find).
- `t()` adds the key to that set when it falls back to the raw key; its behaviour is otherwise unchanged.

ADRs: relies on ADR-2 (structure of the translation tables) and ADR-3 (analytics host and prefix). **Amends ADR-1** (development-only packages), see section 7. The animation loop, the 50 Hz physics and the `window.__sim` hook are reused as they are.

## 4. Data model
Not applicable: no data is stored. The page keeps storing only the language choice in the visitor's browser. No access control involved.

## 5. Interfaces
- **Command line**: `npm test` (everything), `npm run test:browser` (Playwright only), `npm run test:links` (links only).
- **CI**: one workflow, one job "Checks", Ubuntu, Node 24.
- **Test hook** (`window.__sim`, already public): adds `i18n` and `i18nMissing`. Documented in a comment next to it as test-only.
- **UI**: none. No visible change.

## 6. Test strategy
- **Static checks** (no browser, `tests/static.spec.mjs`): syntax (AC-4), translation tables (AC-5), spec status (AC-10), disclaimer (AC-11), analytics guard and prefixes (AC-12). Each check is a pure function of the file content, so the same file also holds **negative tests**: each function is fed a deliberately broken copy (syntax error, German key removed, English text removed, unknown key, DRAFT spec, disclaimer removed, host guard removed, unprefixed event) and must report the failure. This proves AC-4, 5, 10, 11 and 12 at every run, not once.
- **Rendering** (`tests/render.spec.mjs`): AC-6, the runtime half of AC-12, AC-15.
- **Behaviour** (`tests/simulation.spec.mjs`): AC-7 and AC-8 on the real page; the runtime half of AC-5. Breaking an outcome on purpose means changing the model, so it is done once per scenario and invariant during `/implement` (for example removing the token revocation), and the evidence is recorded in tasks.md.
- **Determinism** (AC-9): `npx playwright test --repeat-each=10` once during `/implement`, result recorded.
- **Offline** (AC-14): by construction (network blocked in every browser test) plus one run with the network disabled, recorded.
- **Links** (AC-13): one deliberately dead URL tested once, recorded; the script never fails the run.
- **CI** (AC-3, AC-17): first pull request shows the check; duration recorded.

## 7. Dependencies
- **New: `@playwright/test`** (Apache-2.0), development only, latest stable version at implementation time, pinned exactly with a lockfile. It brings the test runner and a Chromium download (about 150 MB, cached on GitHub). Why the existing stack is not enough: checking rendering, console errors and scenario outcomes needs a controlled real browser; the owner chose robust tooling over a no-package approach (spec section 9).
- **Node.js ≥ 22** for contributors (built-in `fetch`, `node:vm`); CI uses Node 24.
- **GitHub Actions**: `actions/checkout`, `actions/setup-node` (MIT, maintained by GitHub), no third-party action.
- **ADR-1 amendment**, written in `docs/architecture-decisions.md` with this plan: development-only packages are allowed for the checks; the published page still loads no package, needs no build and opens from a downloaded copy.

## 8. Risks and mitigations
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| With the fixed seed, a scenario does not show the outcome the guide promises (for example a collision in B) | Medium | High: the guide would be wrong | Try several seeds during `/implement`. If the model fails for some of them, stop and amend the spec or the model through a new spec; never tune the test until it passes. |
| Non-determinism from animation frames stepping before the test takes control | High without mitigation | Medium (flaky checks) | Pause, re-seed, `resetSim()` before every scenario; `--repeat-each=10` (AC-9). |
| Message-key detection by pattern misses or invents keys | Medium | Low | Restrict to the namespaces of `MSG`, declare composed families, and add the runtime record of missing keys. |
| Chromium download slows the CI | Medium | Low | Cache the browser; install Chromium only. |
| GitHub Pages also publishes `tests/`, `package.json`… | Certain | Low (public anyway, never loaded by the page) | AC-15 test; `node_modules/` is never committed. |
| Pinned thresholds break when the model changes on purpose | Low | Low | Intended: a model change must update its checks in the same spec. Values documented here. |
| Third-party sites rate-limit the link check (USPTO, ISO) | Medium | None (warning only) | One request per URL, 15 s timeout, warnings only. |
| Windows and Linux line endings differ in static checks | Medium | Low | Normalise `\r\n` before parsing. |

## 9. Alternatives considered
- **No package: Node plus an installed Chrome, driven by command-line flags or the DevTools protocol by hand.** Lightest, already used manually, but the harness becomes fragile home-made code. Rejected by the owner (spec section 9).
- **Puppeteer.** Similar browser control, but no test runner of its own: a second package would be needed for assertions, parallel runs and reports. Rejected.
- **jsdom with the Node test runner, no browser.** No canvas and no real rendering: console errors and scenario rendering would not be faithful. Rejected.
- **Parsing the script with a JavaScript parser to read `MSG` and `STATIC`.** A second dependency and code that breaks when the source layout changes; reading the tables at runtime from the page is simpler. Rejected.
- **Splitting the script into separate `.js` files to test functions directly.** Large refactor outside this spec's scope. Rejected.
- **Separate scheduled workflow for links.** The owner chose a warning in the same run. Rejected.
- **Mutation tests for the browser checks** (patching the model automatically to prove each check can fail). Heavy and slow for this size; replaced by one recorded manual demonstration per check. Rejected.

## 10. Impact on project rules
- **Spec before code** — applies: spec approved, plan awaiting approval, branch `001-automated-checks`.
- **Every number on screen is computed by the model** — not applicable: no displayed value changes.
- **Three languages / never translated** — applies as the subject of S4/S5. No new user-visible string.
- **British English** — applies to the new README section and the ADR amendment.
- **Analytics** — applies as the subject of S10; no event added.
- **Languages of the repository** — applies: code comments in French, in `index.html` and in the new test files and scripts alike; test names and assertion messages in English, like the README, the ADR amendment and the commit messages.
- **Documentation follows the code** — applies: README "Checks" section and `CLAUDE.md` commands (AC-16). Guide and screenshot: not applicable.
- **Guardrails** — applies: the disclaimer becomes a check; no force-push on `main`.
- **Delivery checklist** — applies; once this spec is delivered, `CLAUDE.md` will list `npm test` as the command behind it.
- **ADR-1** — amended (section 7). **ADR-2**, **ADR-3** — unchanged, enforced.
