# Spec 003 — Node 24 and a page that is no longer one huge file (technical debt)

> Status: APPROVED
> Created: 2026-11-15 · Approved: 2026-11-15 (spec and ADR-1 amendment of section 9, validated by the owner)
> Amended 2026-11-15 at plan approval, validated by the owner: S11 and AC-13 say what "alone" means (the module's own files, the lower modules it calls, test doubles for upward calls, never the drawing files); AC-9 says that a development helper which only rewrites release stamps is not a build script; AC-6 adds scenarios F and G under both kernel profiles to the replayed cases; S3 and AC-3 also cover the root entry of `package-lock.json`, which repeats `engines`.
> Open questions answered by the owner on 2026-11-15: no maximum file size (logical split that tends to reduce sizes), mixed-release guard kept, warning only for Node 22, guide text and ADR-2 decided at `/plan`, modules testable alone (section 7).
> Input: action A-13 of `docs/continuous-improvement.md` (owner decision of 2026-11-15, spec 002) and the owner's answers during `/specify` (2026-11-15). No `docs/brainstorm/` note exists for this topic.

## 1. Problem / Why
Two debts, both noticed during spec 002 and both about the way the project is worked on, not about what the visitor sees.

**Node version.** The project announces "Node.js 22 or later" (`package.json`, README, `CLAUDE.md`) and the `Checks` workflow runs every push twice, on Node 22 and on Node 24. Nobody on the team needs Node 22: the owner chose to test on Node 24 only. Today the promise, the workflow and three documents say a thing the owner no longer wants to keep, a second job doubles the compute on every push, and spec 001 (S2, AC-3) is written for two versions. The lesson of SC-6 (spec 001) still holds: a promised version must be the version that is checked, and nothing today stops the two from drifting apart again.

**One huge file.** `index.html` holds about 2,180 lines: a 230-line style sheet, about 280 lines of guide text, and about 1,650 lines of script (analytics, translations, then the four modules). The owner named what hurts, all four at once:
- finding and reading the code (one has to scroll through unrelated parts to read one module);
- reviewing and merging diffs (every change lands in the same giant file, so two unrelated changes collide);
- the cost for Claude (reading or editing the whole file spends a lot of context, and edits of a file with Windows line endings are fragile, see memory "Shell heredoc backslashes");
- testing a module on its own (today every check goes through the whole page and the test-only hook `window.__sim`).

ADR-1 chose "one self-contained file" on purpose, and says that a change of that kind goes through a human discussion first. That discussion took place at `/specify`: the owner prefers **a folder that opens by double-click** to a single file. What ADR-1 protected (nothing to install, nothing to build, opens offline from a downloaded copy, readable by someone learning) must survive; the fact that it is *one* file does not have to.

## 2. Users
- **The owner and contributors** (including Claude working on the project): they navigate, change, review and test the code. They are the users of this spec.
- **A visitor** (engineer, student, decision-maker) opening the published page or a downloaded copy: must notice **no difference at all**. Their needs are a constraint here, not a goal.

## 3. Expected behaviour (WHAT, not HOW)
Terms: **lot 1** = the Node version (S1 to S4). **Lot 2** = the split of the page (S5 to S13). **The map** = a short document that lists every file of the page and says what each contains. **The page's own files** = the files the page loads from the repository itself (not Google Fonts, not GoatCounter).

### Lot 1 — Node 24 only
- **S1 — One announced version.** As a contributor, when I read `package.json` (and the root entry of `package-lock.json`, which repeats it), the README, `CLAUDE.md` and the workflow, then they all name the same minimum Node version, 24, and none of them mentions 22 as supported.
- **S2 — One check per push.** As the owner, when a commit is pushed or a pull request is opened or updated, then the full checks run once, on Node 24, and the result shows on the commit and on the pull request as before (it informs, it does not lock the merge). Compute time per push is roughly halved.
- **S3 — The promise cannot drift silently.** As the owner, when one of the four places above names a different Node version from the others (for example the README says 22 while the workflow runs 24), then an automated check fails and names the place that differs.
- **S4 — The earlier spec says the same.** As a reader of spec 001, when I read S2 and AC-3, then they say Node 24 only and show the owner's validation of that change (dated amendment line in the header, as for the earlier amendments). The history of what was delivered with two versions stays readable (evidence table not rewritten).

### Lot 2 — A folder instead of one file
- **S5 — The visitor sees no difference.** As a visitor, when I open the published page or a downloaded copy, then the page looks and behaves exactly as before: same layout at 1600×900 in French, English and German, same scenarios and numbers, same guide, same language switch, same analytics behaviour (loaded on `bretzelcoder.github.io` only), same URL.
- **S6 — Still nothing to install, still offline.** As a visitor, when I download the project and double-click `index.html` with the network cut, then the simulator runs completely (Google Fonts remain optional, system fonts as fallback). No build, no server and no installation is needed to open it or to publish it.
- **S7 — The model does not move.** As the owner, when I replay the same seeds on `main` and on the split page with `scripts/compare-traces.mjs`, then positions, speeds, states, latencies and event logs are identical, and every check of `npm test` passes with its expectations unchanged (only the way a check finds the code may change, never what it asserts).
- **S8 — One concern, one place.** As a contributor, when I look for the code of one of the four modules (MineWorld & PhysicsEngine, EmbeddedCommsBus, AutonomyAndSafetyCore, FaultInjector & TelemetryHUD), the translations, the analytics, the style or the guide text, then each lives in its own file or files, and no file mixes two of these concerns.
- **S9 — A split that follows the logic and shrinks the files.** As a contributor or as Claude, when I open any of the page's own files, then it holds one logical unit (S8), and where a concern is still large and has a natural joint of its own (for example translations by language or by area), it is split further along that joint. There is no fixed maximum size: the aim is files that are shorter than today's single file and cheap to read, and the sizes are reported at review.
- **S10 — A map that stays true.** As a contributor, when I want to know where something is, then the map (README and the Stack part of `CLAUDE.md`) lists every one of the page's own files with one line each, and an automated check fails when a file is not in the map or the map names a file that does not exist.
- **S11 — A module can be tested on its own.** As a contributor, when I want to verify one module, then a check exercises that module alone and verifies a pinned behaviour of it. "Alone" means: the module's own files, the lower modules it calls, and test doubles for what it calls upward (the simulation state, the event log, the toast); never the drawing files, the screen elements or the page. For the fourth module the check covers its non-drawing files (state, scenarios, event log, fault injection); its drawing half is by nature checked on a page, by the existing browser tests. There is one such check for each of the four modules, in addition to the existing ones.
- **S12 — A broken or missing file is said, not hidden.** As a visitor or contributor, when one of the page's own files is missing or fails to load, then the page says so visibly, in French, English and German, and does not show a half-working simulator; in the tests, the page fails fast and names the file.
- **S13 — Files of one release stay together.** As a visitor, when the site is updated while I still have an old copy of some files in my browser, then I never run a mix of old and new files: the page either runs one consistent release or says that it needs a reload (see section 7, open question 2).

## 4. Edge cases and errors
- **Node 22 still installed on a contributor's machine.** `npm ci` warns that the version is outside `engines`; it does not refuse (proposal, section 7 question 3). Nothing else changes for them but the tests are not promised to work.
- **Node 24 finds a failure that Node 22 hid.** If `npm test` is not green on Node 24 at the start of lot 1, that is a gap: back to the spec (rule 5), the test is not bent (Conventions, "The test is the judge").
- **`compare-traces.mjs` straddles two shapes.** While lot 2 is not merged, `main` is a single file and the working copy is a folder: the comparison must work across the two shapes, and must still fail (non-zero exit, first difference named) on a deliberately altered copy.
- **Checks that read `index.html` as text** (script syntax, disclaimer in the header comment, analytics guard, translation tables, link extraction, "no latency written in the new HTML") must keep reading *all* the code, wherever it now lives: a check that silently reads only the entry file would pass on a broken page. Each adapted check keeps its negative test.
- **"Only index.html is requested" (rendering test).** The set of allowed requests becomes "the entry file and the page's own files listed in the map"; a request to any other file, or to the network other than the two known hosts, still fails the test.
- **A file loads in the wrong order or twice.** The page must not start with a module missing; a double load must not double the simulation or its listeners (checked on the running page).
- **The guide text and ADR-2.** ADR-2 says static French text stays in the HTML with `data-i18n*` attributes. If the guide text leaves the HTML, ADR-2 changes too; this spec does not decide that (section 7 question 4).
- **Windows line endings.** The repository's files keep their line endings (CRLF-aware edits); a split must not create files with mixed endings.
- **GitHub Pages serves a sub-path** (`/aht-safety-poc/`): the page's own files must load there and from `file://` alike.
- **Published copy stale after a deploy** (S13): see section 7 question 2.

## 5. Out of scope (explicit)
- Any change of what the visitor sees or of any model value, wording, scenario, control or panel. No new feature, no new scenario, no new translation text.
- Rewriting algorithms or renaming model identifiers: lot 2 moves code and draws boundaries; it does not redesign it. Anything that would move a trace is a gap, back to the spec.
- Renaming or removing the test hook `window.__sim` (`i18n` and `i18nMissing` stay).
- A build step, a bundler, a framework, a package loaded by the page, a server: all remain excluded (ADR-1 and its amendment). Development packages stay as they are (Playwright 1.65.1 is not upgraded here).
- Any version manager file (`.nvmrc` and the like) and any change of the actions' own versions in the workflow.
- Dropping features of Node 24 into the existing scripts "because we can": the scripts are not rewritten.
- Changing the published URL, the GitHub Pages settings, or the analytics (ADR-3).
- `docs/capture.png`: the visible UI does not change, so the screenshot is not retaken.

## 6. Acceptance criteria (testable)
Lot 1
- [x] AC-1 — `package.json` has `engines.node` set to `>=24`, README and `CLAUDE.md` say "Node.js 24 or later" (Stack, Project commands, Delivery checklist) and no longer name Node 22. *(S1)* *(evidence: T-02, evidence "Node version")*
- [x] AC-2 — `.github/workflows/checks.yml` runs one job on Node 24 and no matrix; after a push the `Checks` run is green on GitHub and shows on the commit. *(S2)* *(evidence: T-02 and T-04, run 43759109912 then the run of T-36)*
- [x] AC-3 — A static check compares the Node major announced in `package.json`, the README, `CLAUDE.md` and the workflow and fails when they differ, naming the place. Its negative test: on a copy where one of the four says 22, the check fails and names that place. *(S3)* *(evidence: T-01, T-02, 8 + 2 tests)*
- [x] AC-4 — `npm test` is green on Node 24 locally and on GitHub with no expectation loosened. *(S2, section 4)* *(evidence: T-04 and T-36)*
- [x] AC-5 — Spec 001 S2 and AC-3 say Node 24 only; its header carries a dated amendment line stating that the owner validated it; its evidence table is unchanged. *(S4)* *(evidence: T-03, `git diff` of specs/001-automated-checks)*

Lot 2
- [x] AC-6 — `scripts/compare-traces.mjs` reports "identical" between `main` (single file) and the split working copy over its cases of 60 s (the 20 existing ones, plus scenarios F and G on seeds 1 and 2 under both kernel profiles), and still reports a difference, with a non-zero exit, on a copy where one model constant is altered. *(S7, section 4)* *(evidence: T-09, T-10, T-25, T-36: 28 cases identical against main and against bases of 4, 15 and 24 files; breakage recorded)*
- [x] AC-7 — The whole existing suite passes with its assertions unchanged: `git diff` of `tests/` and `scripts/` shows changes only in how code is located and read, and `/review` verifies no expected value was edited. *(S7)* *(evidence: T-06, T-07, T-36: `git diff main -- tests/ scripts/` shows existing tests changed only in how they read the page; the one assertion that changed is the requests test of AC-16, as planned; `/review` still to verify)*
- [x] AC-8 — The page opened from disk with the network blocked renders in French, English and German with no console error, the layout test at 1600×900 passes (both font sets), and a downloaded copy (the repository as a zip, extracted elsewhere) starts and runs scenario A with the network blocked. *(S5, S6)* *(evidence: T-29, T-30, T-35 (screenshot, layout))*
- [x] AC-9 — No build step, server or installation is needed: opening the entry file from `file://` is enough, and the repository contains no script that produces, assembles or transforms a file the page loads. A development helper may only recompute the release stamp line of each file; the page works whether it was run or not, and a check fails when a stamp is stale. A check lists the page's own files and fails if the entry file loads anything outside the repository other than Google Fonts and, on `bretzelcoder.github.io` only, GoatCounter. Its negative test adds a third-party request on a copy and fails. *(S6, ADR-1)* *(evidence: T-28)*
- [x] AC-10 — A check classifies every line range of the page's own files by concern (the four modules, translations, analytics, style, guide text) and fails when a file holds more than one concern. Its negative test pastes a block of another module into a file and fails. *(S8)* *(evidence: T-27)*
- [x] AC-11 — The evidence table of the tasks lists the line count of every one of the page's own files next to today's 2,181; the largest is well below it, and each file above the median carries a one-line note saying why it was not split further (or that no natural joint exists). `/review` checks the table. No automated size threshold exists. *(S9)* *(evidence: T-25, "AC-11" table of tasks.md)*
- [x] AC-12 — The map exists in the README and in the Stack part of `CLAUDE.md`, and a check fails both ways: one file missing from the map, one file named in the map that does not exist (two negative tests). *(S10)* *(evidence: T-26)*
- [x] AC-13 — For each of the four modules there is one check that loads that module alone (as defined in S11: its own files, the lower modules it calls, doubles for upward calls, no drawing file and no screen) and verifies a pinned behaviour of it; each check fails on a deliberate breakage of that module's own code, recorded in the evidence table. Where a module cannot be loaded alone, that is a gap taken back to the spec, not an exception. *(S11)* *(evidence: T-31 to T-34, one recorded breakage each)*
- [x] AC-14 — On a copy with one of the page's own files deleted, then on a copy with one file unparsable, the page shows a visible message in French, English and German and the simulator does not start; `openPage` fails within its 8-second deadline and names the file. *(S12)* *(evidence: T-14, T-15, T-16)*
- [x] AC-15 — On a copy where one file carries another release identifier than the rest (or an old copy is served for one file), the page runs one consistent release or says that a reload is needed. *(S13, subject to section 7 question 2)* *(evidence: T-13, T-14, T-27)*
- [x] AC-16 — The rendering test "only the entry file and the page's own files are requested" passes on the split page and fails on a copy that requests an unlisted file. *(section 4)* *(evidence: T-15, T-28)*
- [x] AC-17 — A double load of one file (copy) does not duplicate the simulation or its listeners: measured on the running page. *(section 4)* *(evidence: T-16 (the tag listed twice and the file that registers twice))*
- [x] AC-18 — The disclaimer (educational model, not a safety tool, not affiliated with any manufacturer) is still in the README and in the header comment of `index.html`; the analytics guard check still reads the code wherever it lives and keeps its negative test; the translation tables check still sees every `MSG` triplet and `STATIC` entry. *(CLAUDE.md Guardrails)* *(evidence: T-06, T-16, T-17, T-18)*
- [ ] AC-19 — After merge, on the live page, every one of the page's own files is served (no 404), the page looks and plays as before, and the analytics snippet is still there. *(S5, S13)*

## 7. Open questions
All five questions were answered by the owner on 2026-11-15; no `[TO CLARIFY]` remains.
1. **Size per file (S9, AC-11)** — decided: no maximum. A logical split that tends to reduce file sizes; sizes are reported, not enforced.
2. **Mixed releases (S13, AC-15)** — decided: keep the guard (a release identifier shared by all files; the page stops with a "reload" message if they differ). Accepted cost: one more thing to keep in step at each release, to be made as automatic as the plan allows.
3. **Node 22 on a contributor's machine (section 4)** — decided: a warning only (npm's default), nothing stricter.
4. **Guide text and ADR-2 (S8, section 4)** — decided: `/plan` keeps ADR-2 intact if a way exists; if not, the plan proposes an ADR-2 amendment that the owner validates before any code.
5. **Modules loaded alone (S11, AC-13)** — decided: the plan must show how each of the four modules can be exercised alone; if one cannot without redesign, the spec is amended rather than that module being skipped.

## 8. Digital sobriety
- **Network:** the page's weight does not grow (the same bytes, spread over several files); the number of requests rises by the number of files (a handful, over HTTP/2 on GitHub Pages). Lighter alternative, one file: it is exactly the problem. Kept: a folder with the fewest files that satisfy S8 and S9; no file added "for tidiness". Check: total size of the page's own files within 5 % of today's (no duplication), AC-11 (sizes reported) and the map.
- **Compute:** lot 1 halves the compute of every push (one job instead of two). Lot 2 changes nothing at run time; the extra checks (AC-10 to AC-17) are light file reads and a few small browser runs, to be kept inside the 5-minute budget of spec 001 (AC-17 there).
- **Storage:** nothing new is stored; the repository grows by a map and some small files, no binary.
- **Dependencies:** none added, for the page or for development (ADR-1 and its amendment). A bundler or loader library was considered for lot 2 and rejected: it is a dependency and a build step for no gain at this size, and the owner chose a plain folder.

## 9. Decisions
Owner decisions (2026-11-15):
- Test on **Node 24 only** (action A-13, during spec 002): `engines` `>=24`, README and `CLAUDE.md` corrected, workflow reduced to one job, spec 001 amended with the owner's validation.
- During `/specify`, on the shape of the page: **a folder that opens by double-click** (several plain files, opened from `file://` with no installation and no build), not one file and not a single file assembled by a tool.
- Pain points to cure, all four: finding and reading, reviewing and merging diffs, context cost for Claude, testing modules separately.
- Scope of lot 2: the script (about 1,650 lines), the style sheet, the guide text, and the tests and scripts that read `index.html`.
- Answers to the five open questions (2026-11-15): see section 7.
- **One spec, two lots**: lot 1 is small and can be delivered at once; lot 2 gets its plan only after the ADR-1 amendment below is validated by the owner (A-13 requires the human discussion first).

**ADR-1 amendment to validate** (draft, to be written in `docs/architecture-decisions.md` only once approved, dated and referenced to spec 003): *What stays*: the published page loads no package, needs no build step, no server and no installation; it opens from `file://` and from a downloaded copy; the whole project is plain files readable end to end. *What changes*: "one self-contained `index.html`" becomes "an `index.html` entry file plus a small set of the page's own plain files, each listed in a map"; the rejected alternatives keep "a bundler and a framework". *Why*: the file reached about 2,200 lines and the owner measured four costs (reading, reviewing, context, testing) against a benefit of "one file" that the folder form keeps almost entirely (offline, no tooling).

`CLAUDE.md` checks:
- **Spec before code** — applies: this spec, then plan, tasks and `/implement`, on branch `003-node-24-and-refactoring`.
- **Every number on screen is computed by the model** — applies as a guard: nothing displayed changes; S7 and AC-6 prove no value moves.
- **Three languages, never translated** — applies: the failure message of S12 exists in French, English and German (static, not depending on the translation file that may be the missing one); no existing text changes; the translation tables check keeps passing (AC-18).
- **British English** — applies to any new English text (the S12 message, the map in the README).
- **Analytics** — applies as a guard: GoatCounter still loads on `bretzelcoder.github.io` only, events keep their `aht-safety-poc/` prefix, nothing typed or personal is sent (AC-9, AC-18).
- **Languages of the repository** — applies: code comments in French; README, commit messages and ADRs in English; the new map in English.
- **Documentation follows the code** — applies: README (Node version, checks line, map, project layout) and `CLAUDE.md` Stack are updated; the in-app guide does not change (nothing visible changes); `docs/capture.png` is not retaken (section 5).
- **The test is the judge** — applies: no expectation loosened for the split (AC-7); a failure on Node 24 is a gap, not a reason to edit a test (section 4).
- **Every new check proves it can fail** — applies: AC-3, AC-6, AC-9, AC-10, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, each with its negative test or recorded breakage in the evidence table of the plan and tasks.
- **Re-measure before declaring a gap** — applies: a suspected difference of trace is re-measured with `compare-traces.mjs` at the model's own step before anything is declared.
- **Guardrails** — applies: disclaimer kept in the README and in the header comment of `index.html` (AC-18); no force-push of `main`; the ADR-1 amendment is validated first.
- **Delivery checklist** — applies in full, with "Node 22 and Node 24" replaced by "Node 24" once lot 1 is delivered; a layout check needs no new budget since the visible page does not change (A-9 not triggered).
- **ADR-1** — amended as above, by the owner; **ADR-2** — possibly amended (question 4); **ADR-3** — unchanged.
- **Constitution** — principle 4 (simplicity) justified by a need shown (§1), principle 8 untouched; principle 3 applies as above.

## 10. Delivery and acceptance
- Owner: validate the ADR-1 amendment of section 9 (before the plan of lot 2).
- Owner: after lot 2, open `index.html` from a downloaded copy of the branch (zip), with the network off, in French, English and German, and check that nothing looks or behaves differently (A-12 showed that the real fonts and screens find what the tests cannot).
- Pull request and merge: only on the owner's explicit request. Lot 1 may be merged before lot 2 if the owner asks.
- After merge: check the live page on GitHub Pages (every file served, page unchanged, analytics snippet still there), and the `Checks` run on Node 24.
- Follow-up: A-13 of `docs/continuous-improvement.md` closes with the evidence of both lots; A-8 and A-14 (plan templates) apply at `/plan`.
