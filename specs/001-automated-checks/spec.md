# Spec 001 — Automated checks

> Status: DELIVERED
> Created: 2026-11-15 · Approved: 2026-11-15 · Delivered: 2026-11-15 (pull request #2, merge commit `3103175`)
> Amended again 2026-11-15, validated by the owner: S2 and AC-3 now cover both Node versions the project announces (22 and 24).
> Amended 2026-11-15, validated by the owner (action A-1 of the continuous-improvement register): S11 and AC-13 now name the hosts that refuse robots.

## 1. Problem / Why
Every check on this project is manual today: Claude extracts the script to check its syntax, renders the page in a headless browser and reads the log by eye. Nothing runs on a push or a pull request, so a broken script, a missing German string or a scenario that no longer shows what the guide promises can reach GitHub Pages unnoticed: `main` is the live site.

The constitution makes "the test is the judge" non-negotiable, and `CLAUDE.md` still lists lint, test and build as "to be defined". Every later spec needs a judge to run against. This spec defines it, before any new feature.

## 2. Users
- **The owner**, who decides merges and wants to see at a glance, on each pull request, whether the change is safe to publish.
- **Claude**, which must run the same checks after each task (`/implement`) and before each review, instead of improvising them.
- **An outside contributor** cloning the repository, who must be able to run the checks locally with documented, reproducible steps.

## 3. Expected behaviour (WHAT, not HOW)
- **S1** — As a contributor, when I run the documented check command locally, then every check below runs and I get a pass/fail result for each, with a clear message naming what failed (file, key, language or scenario).
- **S2** — As the owner, when a commit is pushed or a pull request is opened or updated on GitHub, then the same checks run automatically and their result is visible on the commit and on the pull request. Merging stays my decision: a failed check informs, it does not lock the merge. *Amendment of 2026-11-15*: the checks run on both Node versions the project announces, the minimum (22) and the current one (24), and a failure on either is shown separately on the commit and on the pull request.
- **S3 — Script syntax.** When the page's script contains a syntax error, then the checks fail and point to it.
- **S4 — Complete translations.** When a user-visible text exists in one language and not in another (a static key missing from English or German, a dynamic message without its three versions, a key used by the page but defined nowhere), then the checks fail and name the key and the missing language.
- **S5 — Rendering in three languages.** When the page is opened in French, English and German, then it loads without any error in the browser console, the interface is in the requested language, and the event log fills with messages in that language.
- **S6 — Simulation behaviour.** When each built-in scenario is played, then it produces the teaching outcome the README and the guide announce:
  - **A** (pickup with V2X): the FMS revokes the truck's I1 token, the truck makes a planned stop before I1, no collision, no emergency brake;
  - **B** (pickup without V2X): on-board perception detects the pickup and the truck slows or stops in time, no collision;
  - **C** (B inside a dust cloud): the LiDAR is reported blinded, the truck continues on radar at a reduced speed of at most 15 km/h, no collision;
  - **D** (stop sent once in BEST_EFFORT with losses): both outcomes are checked, reproducibly: when the stop order is lost, the log reports `ORDER_NOT_APPLIED`; when publishing is switched to periodic with Deadline and Liveliness, the controller reaches the stop state with no silent loss;
  - **E** (saturated CAN bus, mis-prioritised brake command): at 75 % load the brake deadline is missed and the truck goes to a controlled stop; pushed to about 90 %, the brake ECU watchdog trips and the truck goes to emergency braking.
- **S7 — Physics invariants.** The model's teaching claims hold:
  - loaded and downhill gives a longer stopping distance than empty on the flat;
  - empty, the stopping distance is limited by adhesion and does not depend on mass; loaded, it is limited by brake capacity;
  - on a watered road, the empty stopping distance increases noticeably while the loaded one barely changes;
  - a truck never drives beyond its movement authority;
  - when the mine network is cut, the trucks stop within the authority already granted, without emergency braking;
  - the emergency state stays latched until it is acknowledged.
- **S8 — Spec status.** When a spec in `specs/` (other than the template) is on `main` with the status DRAFT or IN REVIEW, then the checks fail.
- **S9 — Disclaimer.** When the "educational model, not a safety tool, not affiliated with any manufacturer" statement disappears from the README or from the header comment of `index.html`, then the checks fail.
- **S10 — Analytics.** When the analytics code would load outside `bretzelcoder.github.io`, or an analytics event is not prefixed `aht-safety-poc/`, then the checks fail.
- **S11 — External links.** When a link of the README or of the in-app guide no longer answers, then the checks report a visible warning naming the link, without failing the run. *Exception (amendment of 2026-11-15)*: for the hosts known to refuse automated requests (a short commented list in the check), an answer 403 is reported as "unverifiable" on an information line, not as a warning. A 404, a timeout or a network error on those same hosts remains a warning.

## 4. Edge cases and errors
- **Randomness.** Scenario D draws its packet losses at random and scenario vehicles get random identifiers: every check must give the same result at every run. A check that passes or fails depending on chance is a defect of the check.
- **No network.** Apart from the link check, the checks must not depend on the network: Google Fonts and GoatCounter unreachable must not count as a console error or a failure. The page already works without fonts (system fallback) and loads no analytics outside the live host.
- **Composed keys.** Some translation keys are assembled while the page runs (for example a prefix plus a state or a code). They must be covered too: neither reported as missing when they exist in all three languages, nor ignored when one is missing.
- **Untranslated terms.** Supervisor states, codes, QoS names, acronyms and formula variables are identical in every language by design (`CLAUDE.md`, "Never translated"). The translation check must not report them as missing or untranslated.
- **The spec template** (`specs/000-template/`) is always DRAFT and is excluded from the status check.
- **Slow or unavailable external site.** A link that times out, is rate-limited or redirects to a valid page is not a project error: a timeout or a refusal is a warning, a redirect to a working page is a pass.
- **A failing check** must never block the publication of an emergency fix by itself: the owner can still merge (S2).

## 5. Out of scope (explicit)
- Locking the merge of a failing pull request through GitHub branch protection (possible later, owner decision).
- Visual comparison of screenshots, performance budgets, accessibility audits.
- Browsers other than one Chromium-based browser (no Firefox or Safari runs).
- Mobile layouts and screen sizes other than the default desktop size.
- Checking the GoatCounter dashboard or any live data.
- The other GitHub Pages projects (wcs-poc, FruitSudoku…).
- Any change to the simulator's behaviour, interface or texts: this spec adds checks, it changes nothing the visitor sees.

## 6. Acceptance criteria (testable)
- [ ] AC-1 — One documented command, run from the repository root, executes all the checks of S3 to S11 and ends with an overall pass or fail.
- [ ] AC-2 — On the current `main` content (once this spec's own work is in), every check passes and the link check reports its result.
- [ ] AC-3 — A push to any branch and every pull request trigger the checks on GitHub; the result appears on the commit and on the pull request, for Node 22 and for Node 24 separately.
- [ ] AC-4 — Introducing a syntax error in the page script makes the checks fail with a message pointing to it.
- [ ] AC-5 — Removing one key from the German static translations, removing the English version of one dynamic message, and using an undefined key each make the checks fail, naming the key and the language.
- [ ] AC-6 — The page opens in French, English and German without any console error, and in each language at least one log message and the interface title appear in that language.
- [ ] AC-7 — Each scenario A to E is checked against the outcome listed in S6; breaking one outcome on purpose (for example removing the token revocation) makes the corresponding check fail and name the scenario.
- [ ] AC-8 — Each invariant of S7 is checked; breaking one on purpose makes its check fail.
- [ ] AC-9 — Ten consecutive runs on unchanged content give identical results.
- [ ] AC-10 — A spec with the status DRAFT or IN REVIEW (outside the template) makes the status check fail.
- [ ] AC-11 — Removing the disclaimer from the README or from the header comment of `index.html` makes the checks fail.
- [ ] AC-12 — Removing the host restriction of the analytics code, or adding an event without the `aht-safety-poc/` prefix, makes the checks fail.
- [ ] AC-13 — A dead link produces a warning naming it, and the overall result stays a pass if nothing else failed. A 403 from a listed host is reported as unverifiable, not as a warning; a 403 from an unlisted host, and any 404, timeout or network error, stay warnings.
- [ ] AC-14 — With the network cut, every check except the link check passes.
- [ ] AC-15 — The published site is unchanged in what it loads: no file used only by the checks is fetched by the page, and the page still opens from a downloaded copy with nothing installed.
- [ ] AC-16 — `CLAUDE.md` ("Project commands" and "Delivery checklist") and the README explain how to install what the checks need and how to run them; the "to be defined" placeholders are gone.
- [ ] AC-17 — A full run completes in under 5 minutes on GitHub.

## 7. Open questions
None. Both points raised during review were settled by the owner on 2026-11-15 (see section 9):
- Duration target of a full run: under 5 minutes on GitHub (AC-17).
- Thresholds ("about 90 %" in scenario E, "barely changes" / "increases noticeably" in S7): the values are taken from the current model's behaviour at `/plan` and pinned in the checks.

## 8. Digital sobriety
- **Published site:** no change. Visitors download nothing more (AC-15).
- **Development tooling:** development-only packages are allowed (owner decision below), which adds a download for contributors and on each GitHub run, including a headless browser. Kept because a controlled browser is the only reliable way to check rendering and scenario outcomes; a lighter alternative (Node and an already-installed browser, no package) was considered and rejected by the owner for robustness.
- **Compute:** checks run on every push and pull request. Kept short (AC-17) and limited to one browser and one screen size (section 5). Since the amendment of 2026-11-15 each run is done twice, once per Node version (two jobs in parallel): twice the compute time on GitHub, accepted by the owner to exercise the minimum version the project announces.
- **Network:** only the link check uses the network, and its failures are warnings.

## 9. Decisions
Owner decisions (2026-11-15):
- Checks in scope: script syntax, complete translations, rendering in three languages, simulation behaviour (scenarios and physics invariants), spec status, disclaimer, analytics, external links.
- Run locally and on every push and pull request, result visible; merge not locked by failing checks.
- Development-only packages are allowed for the checks; the published site keeps no dependency. This amends ADR-1, which today excludes any package manager: the amendment will be written at `/plan`.
- External links: warning only, never a failure.
- Scenario D: both outcomes forced and checked reproducibly.
- A full run must complete in under 5 minutes on GitHub (AC-17).
- The thresholds of scenario E and of the S7 invariants are pinned to the current model's values, measured at `/plan`.
- Spec approved on 2026-11-15.

`CLAUDE.md` checks:
- **Spec before code** — applies: this spec, then plan and tasks, on branch `001-automated-checks`.
- **Every number on screen is computed by the model** — not applicable: no displayed value changes (S7 checks the model, it does not alter it).
- **Three languages / never translated** — applies as a subject: S4 and S5 enforce them, and the "Untranslated terms" edge case protects the rule.
- **British English** — applies to the new README text.
- **Analytics** — applies as a subject (S10); no new event is added.
- **Languages of the repository** — applies: comments in French, README, commit messages and ADR amendment in English.
- **Documentation follows the code** — applies: README and `CLAUDE.md` updated (AC-16); in-app guide and `docs/capture.png` not applicable (no visible change).
- **Guardrails** (disclaimer, no force-push on `main`) — applies; the disclaimer becomes an automated check (S9).
- **Delivery checklist** — applies, and this spec turns most of it into automated checks.
- **ADR-1** — amended (see above); **ADR-2**, **ADR-3** — unchanged, now enforced by S4 and S10.

## 10. Delivery and acceptance
- Owner: approve this spec, then the plan (which will include the ADR-1 amendment).
- Owner: on the first pull request, check that the result shows up and that a deliberately broken commit turns it red (AC-3, AC-4).
- Owner: confirm or adjust AC-17 and the thresholds in section 7.
- After merge: the live page on GitHub Pages is unchanged for visitors (AC-15) and the checks pass on `main`.
