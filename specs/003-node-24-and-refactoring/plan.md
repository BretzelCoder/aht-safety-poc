# Plan 003 — Node 24 and a page that is no longer one huge file

> Spec: `specs/003-node-24-and-refactoring/spec.md` (status APPROVED on 2026-11-15)
> Plan status: APPROVED · Approved: 2026-11-15 (the seven decisions below, the three spec amendments and the Pages rehearsal of section 3.8 validated by the owner)
>
> **Owner decisions requested at approval** (details in the sections named):
> 1. **Global scope instead of the private scope** (section 3.2). Today the whole script lives inside one `(() => { … })()`, so none of its names is visible outside. Several plain script files cannot share a private scope without ES modules (which do not open from `file://`, ADR-1) or a rewrite of every cross-reference. The plan keeps the code line for line and lets the files share the page's global scope (top-level `const`, `let` and `function` of classic scripts are visible to the scripts loaded after them). Cost: about 300 names become globals; a name that collides with a built-in global is a real risk (section 8). Alternative rejected: one namespace object (section 9).
> 2. **Spec amendments, three small ones** (section 2, "Amendments to validate"): the wording of S11 / AC-13 ("alone"), of AC-9 (a development helper that rewrites release stamps is not a build script), and of AC-6 (the replayed cases also cover scenarios F and G under both kernel profiles).
> 3. **Release stamps and one development helper** (section 3.4): a short stamp per file, a manifest in `index.html`, and `scripts/stamps.mjs` that rewrites the stamp lines. Cost: two lines change in `index.html` and in the file itself each time a file changes.
> 4. **Load time does declarations only** (section 3.3): the lines that attach listeners, start analytics and begin the simulation move into functions that run only after the load guard says all files are present and of one release. A few lines are wrapped in a function; none changes.
> 5. **One exception to the three-language rule** (section 3.5): the "a file is missing or out of date" message is written inline, in French, English and German, in `index.html`, because the translation files may be the ones that are missing.
> 6. **Granularity** (section 3.1): 22 script files and 1 style sheet, none to be enforced by size. Adjustable at `/tasks` (merging or splitting files) without touching the spec.
> 7. **The version check covers five places**, the four of S3 plus the root entry of `package-lock.json`, which repeats `engines` (section 2, S3).

## 1. Summary
**Lot 1 (Node 24)** is a small change to five places and one new static check. A pure function reads the Node major announced by `package.json` (`engines`), the root entry of `package-lock.json`, the README, `CLAUDE.md` and the workflow, and fails naming the place that differs; the workflow loses its matrix and runs one job on Node 24. The check is written and shown failing first, then the five places are changed.

**Lot 2 (the folder)** cuts `index.html` along the joints that already exist in the code: the page keeps its markup, its French static text and the French guide (ADR-2 stays intact) and loads its own files with plain `<script src>` and `<link>` tags, in the original order of the code. Style goes to one file; the script goes to 22 files named after the four modules, the translations (split by language and by UI/guide), the analytics, a shared base and the test hook. Because the code is moved, not rewritten, the concatenation of the files in load order is the original script; the model cannot move, and `scripts/compare-traces.mjs` proves it.

Three things are new and small: (a) a **load guard** in `index.html`: every file registers itself on its last line with a stamp, the page lists the stamps it expects, and the simulation starts only if every file is present, loaded once and of the same release (S12, S13); (b) a **reader that gives every existing text check the whole code** by rebuilding, in memory only, the page with its files inlined, so no assertion of an existing check changes (S7, AC-7); (c) a **small harness** that loads a module's own files in a bare Node context, with test doubles for what the module calls upward, to give each of the four modules its own check (S11). Nothing is built, bundled, generated or installed for the page.

## 2. Requirement traceability
| Requirement (spec) | Technical answer (this plan) |
|---|---|
| S1 / AC-1 | `package.json` `engines.node` = `>=24`; root entry of `package-lock.json` the same; README (two sentences: install, checks) and `CLAUDE.md` (Stack, Project commands, Delivery checklist) say "Node.js 24 or later" / "Node 24"; workflow comment and job name updated. |
| S2 / AC-2 | `.github/workflows/checks.yml`: the `strategy.matrix` is removed, `node-version: 24`, job name `Checks (Node 24)` kept for continuity of the check name's family. One job per push and per pull request; the result still informs without locking the merge. |
| S3 / AC-3 | New pure function `verifierVersionNode({ pkg, lock, readme, claude, workflow })` in `tests/helpers/versions.mjs`, run by `tests/versions.spec.mjs` in the `static` project. It extracts the major from `engines.node` (`>=24`), the lock's root `engines`, every "Node.js N or later" / "Node N" mention in README and `CLAUDE.md`, and `node-version:` in the workflow, and fails naming each place whose major differs, or any `matrix` that lists another Node. S3 names four places; the lock's root entry repeats `engines`, so the plan adds it as a fifth. Negative tests: one per place, on a copy where that place says 22. |
| S4 / AC-5 | Spec 001: S2 and AC-3 reworded for Node 24 only, a dated amendment line in its header ("validated by the owner", as the earlier ones), evidence table and T-25 left as history. No check: a documentation edit, verified at `/review` with `git diff`. |
| AC-4 | `npm test` on the local Node 24 (v24.20.0) and `Checks` on GitHub; no assertion touched. A red result at the start is a gap (spec section 4), not a reason to edit a test. |
| S5 / AC-8 | Nothing visible is touched: markup, style and code keep their content. Proof: existing rendering, layout (two font sets, three languages) and scenario tests unchanged; new test "downloaded copy": the page files that `git ls-files` lists are copied to a temporary folder elsewhere and scenario A runs there with the network blocked. |
| S6 / AC-9 | Classic `<script src>` and `<link rel="stylesheet">` with relative paths, no module, no server, no build: opens from `file://` and from the Pages sub-path alike. Static check `verifierChargements`: every script/link tag of `index.html` is either a relative path of the repository or Google Fonts; every script file uses `src=` / `fetch` / `XMLHttpRequest` / `import(` only for GoatCounter in the analytics file. `package.json` scripts are limited to the test commands. Negative test: a third-party `<script src="https://…">` added to a copy. |
| S7 / AC-6, AC-7 | The code moves verbatim and in the original order (section 3.1). `scripts/compare-traces.mjs` learns to read a base made of several files (`git ls-tree` + `git show` of each page file, section 3.6) and its cases are extended to F and G under both kernel profiles (amendment AC-6). Existing tests keep every assertion: only how they obtain the page's text changes (the reader of section 3.7). One-time evidence at `/implement`: every non-blank line of the old script, trimmed, appears exactly once in the new files (a throwaway script, result recorded in the evidence table). |
| S8 / AC-10 | One concern per file by construction (section 3.1). Check `verifierConcerns`: every file under `js/` and `css/` opens with a header comment `@concern <name>` (name in the fixed list: `base`, `analytics`, `i18n`, `guide`, `module-1` … `module-4`, `style`, `test-hook`), any other `@concern` marker or section banner inside the file must carry the same name, and the concern agrees with the "Concern" column of the README map. Negative test: a block with a `module-3` banner pasted into a `module-2` file. Known limit, stated in the evidence: a block moved without its banner is not caught by this check; `compare-traces` and the module checks are what would notice a change of behaviour. |
| S9 / AC-11 | No size rule. File sizes in section 3.1 follow the existing banners and the language and UI/guide joints of the translation tables. The evidence table of `tasks.md` lists each file's line count next to today's 2,181, with a note for each file above the median. Reviewed at `/review`. |
| S10 / AC-12 | The map is a table in a new README section "Where things are" (file, concern, one line) and a path list in the Stack part of `CLAUDE.md`. Check `verifierCarte`: the set of own files taken from the tags of `index.html` equals the files found under `js/` and `css/`, the rows of the README table (exact case) and the paths named in `CLAUDE.md`, and each of them is tracked by git (`git ls-files`, so an untracked file that would break the deployed page is caught; skipped with a note outside a git checkout). Two negative tests: a file missing from the map, a map row naming no file. |
| S11 / AC-13 | `tests/helpers/modules.mjs` loads a list of files, in `index.html` order, into a bare `node:vm` context (no `document`, no `window`) with a seeded `Math.random` and with **test doubles** declared for what the module calls upward (`sim`, `logEv`, `toast`, `logDirty`). One check per module in `tests/modules.spec.mjs` (section 6.3). The check fails if a listed file is not in the tags or out of order. Amendment: "alone" means the module's own files, the lower modules it calls, and doubles for upward calls; never the drawing files or the page. |
| S12 / AC-14 | The load guard (section 3.4) and the message of section 3.5. `openPage` stops waiting at once when the guard reports a failure and throws an error naming the files (it no longer waits the 8 s). Tests on copies of the page in a temporary folder: a deleted script, a deleted style sheet, a script with a syntax error, each shows the message in three languages and leaves `window.__sim.sim` undefined. |
| S13 / AC-15 | Stamps (section 3.4): a copy where one file carries another stamp than the manifest shows the message and does not start; `verifierEmpreintes` checks statically that every stamp is the current hash of its file, so a stale stamp fails `npm test` (negative test: edit a file without running the helper). |
| AC-16 | The rendering test "requests nothing but index.html…" now compares the set of `file:` requests with the own-file list (`index.html` plus the tags), through a pure function `verifierRequetes(requetes, attendus)`. Negative test: a list with an unlisted file, then a list missing one. |
| AC-17 | Nothing runs at load time except declarations (section 3.3), and the guard counts registrations: a script tag added twice in a copy makes the guard refuse to start (message "loaded twice"), so no listener and no loop is duplicated. Measured on the running copy: the simulation never starts (`window.__sim.sim` undefined, no `requestAnimationFrame` registered by the page). |
| AC-18 | Disclaimer (README and header comment of `index.html`, which stays the first comment of the entry file), analytics guard (`verifierAnalytics`), translation tables (`verifierTraductions`) all keep their code: they receive the text of the rebuilt page (section 3.7). Their existing negative tests keep running, on the rebuilt text. |
| AC-19 | **Before the merge**, a test reproduces the conditions of GitHub Pages (section 3.8): the folder is served over HTTP from the sub-path `/aht-safety-poc/`, with exact-case file names, and scenario A is played. **After the merge**, owner and Claude check on the live site: each own file requested returns 200 (the file list comes from the tags), the page plays scenario A, the analytics snippet is present. Recorded in `tasks.md`. |
| Edge: Node 22 on a machine | npm's warning only (decided). No `.npmrc`, no `engine-strict`. |
| Edge: Node 24 finds a failure | Gap, back to the spec. |
| Edge: `compare-traces` across two shapes | Section 3.6; a recorded breakage shows it fails on an altered copy. |
| Edge: checks reading `index.html` as text | Section 3.7: they read the rebuilt page. Without it, `verifierTraductions` would find no script and pass vacuously (it scans inline scripts for message keys); `tests/fichiers.spec.mjs` has a test that the rebuilt text contains the code (for example a known function of each module), so a reader that returns only the entry file fails. |
| Edge: "only index.html is requested" | AC-16. |
| Edge: wrong order or twice | Guard (counts and stamps) and a fixed order in the tags. The module checks (section 6.3) fail if the files they list are not in the order of the tags, so a reordering of the tags that would break a load-time reference shows up there and in every browser test. |
| Edge: guide text and ADR-2 | The French guide stays in `index.html` with its `data-i18n-html` attributes; its English and German texts live in `js/i18n-en-guide.js` and `js/i18n-de-guide.js`. ADR-2 is not amended. |
| Edge: line endings | `verifierCarte` also fails when a page file mixes CRLF and LF; stamps are computed on LF-normalised text, so Windows (CRLF working tree) and Linux (LF) give the same hash. |
| Edge: Pages sub-path | Relative paths only; checked on the live site (AC-19) and from `file://` (every test). |
| Edge: stale copy after deploy | S13 above. |

**Amendments to validate** (small, to be recorded in the spec header with your validation, as for spec 002):
- **S11 / AC-13**: "alone" = the module's own files, the lower modules it calls (`base`, translations, then modules 1 to 3 in order) and test doubles for upward calls (`sim`, `logEv`, `toast`); never the drawing files nor the page. For module 4 the check covers its non-drawing files (state, scenarios, event log, fault injection); its drawing half (map, oscilloscope, HUD, controls) is by nature checked on a page, by the existing browser tests.
- **AC-9**: the sentence "the repository contains no build script for the page" is read as "no script that produces, assembles or transforms a file the page loads". A development helper (`scripts/stamps.mjs`) may rewrite the stamp line of each file; the page works whether it was run or not, and a check fails if the stamps are stale.
- **AC-6**: the replayed cases also include scenarios F and G, each under both kernel profiles (spec 002 added them; the 20 cases of today do not cover them; this is rule A-14 applied: a setting the visitor can change, the kernel profile, must be replayed under both values).

## 3. Architecture

### 3.1 The files (S8, S9, S10)
`index.html` stays at the root (same URL). Its own files, in load order, which is the order of the code today. Line counts are the lines of the current range, to be recorded exactly at `/implement`.

| Order | File | Concern | Content (today's lines) | ≈ lines |
|---|---|---|---|---|
| — | `index.html` | entry | header comment (disclaimer), head, markup, French static text and French guide, registry, script tags, guard, load-failure message | 360 |
| — | `css/style.css` | style | the style sheet (16–244) | 230 |
| 1 | `js/base.js` | base | `$`, `clamp` (526–527) | 6 |
| 2 | `js/analytics.js` | analytics | GoatCounter, `track`, the loader inside `demarrerMesure()` (529–549) | 28 |
| 3 | `js/i18n-engine.js` | i18n | `LANGS`, `LANG`, `STATIC` (empty tables), `fmt`, `M`, `N`, `RAW`, `vid`, `codeName`, `rp`, `t`, `i18nMissing` (562–568, 1005–1028) | 50 |
| 4 | `js/i18n-en-ui.js` | i18n | `STATIC.en`, interface strings (570–601) | 35 |
| 5 | `js/i18n-en-guide.js` | guide | `STATIC.en`, guide texts (602–700) | 100 |
| 6 | `js/i18n-de-ui.js` | i18n | `STATIC.de`, interface strings (702–732) | 35 |
| 7 | `js/i18n-de-guide.js` | guide | `STATIC.de`, guide texts (733–831) | 100 |
| 8 | `js/i18n-messages.js` | i18n | `MSG`, the `[fr, en, de]` triplets (834–1003) | 175 |
| 9 | `js/i18n-apply.js` | i18n | `ORIG`, `applyStatic` (1029–1048) | 25 |
| 10 | `js/m1-world-physics.js` | module-1 | `angDiff`, `G`, `DT`, `P`, `ENV`, `PATH`, `brakeEnvelope`, `stopDistance` (1049–1137) | 92 |
| 11 | `js/m2-comms-bus.js` | module-2 | CAN, DDS, motion-controller receive, level 1 → level 2 link (1138–1220) | 88 |
| 12 | `js/m3-perception.js` | module-3 | dust, pose, `perceive`, `obstacleDistance`, `bubble` (1221–1309) | 90 |
| 13 | `js/m3-fms-planner.js` | module-3 | `fmsTick`, `opsUpdate`, `planSpeed` (1310–1391) | 82 |
| 14 | `js/m3-levels.js` | module-3 | `newL1`, `newL2` (moved from 1574–1575), level 1 emit / freeze / restart, level 2 measure / receive / judge / refuse (1392–1472) | 85 |
| 15 | `js/m3-supervisor-control.js` | module-3 | `supervise`, `control`, `physics` (1473–1564) | 92 |
| 16 | `js/m4-state.js` | module-4 | `sim`, `selected`, trucks and light vehicles, `resetSim`, `logEv`, `syncCodes`, `collisions`, `step` (1565–1677 without `newL1`/`newL2`) | 110 |
| 17 | `js/m4-scenarios.js` | module-4 | `clearAll`, `scenario`, `scenarioNiveau1`, `tryLaunch` (1678–1751) | 75 |
| 18 | `js/m4-render.js` | module-4 | map and oscilloscope drawing (1752–1941) | 190 |
| 19 | `js/m4-hud.js` | module-4 | side tabs, `renderL12`, `hud`, `syncControls`, `toast` (1942–2069) | 130 |
| 20 | `js/m4-controls.js` | module-4 | `brancherCommandes()` (the listeners of 2070–2153), `setLang`, keyboard, guide opening | 95 |
| 21 | `js/m4-start.js` | module-4 | `demarrer()`, the 50 Hz loop `frame` (2154–2164) | 25 |
| 22 | `js/test-hook.js` | test-hook | `window.__sim` (2165–2178), unchanged | 22 |

Why these joints: the four banners of the code (modules 1 to 4) are kept; module 3 follows its own banners (perception, FMS and planner, levels 1 and 2 from spec 002, supervisor and controller); module 4 follows its own (state, scenarios, drawing, HUD, controls, loop); the translation tables follow the two natural joints of `STATIC` (language, then interface versus guide) and `MSG` stays whole because its triplets cannot be cut by language. `newL1` and `newL2` (the shape of level 1 and level 2 state) move from the state area to `m3-levels.js`, where they belong, so that module 3 can be exercised without module 4's state. Nothing else changes place across modules.

`applyStatic` leaves the translation tables for its own file only because it is the DOM half of the translation concern; `setLang` stays with the controls because it also redraws the HUD.

### 3.2 Sharing names without the private scope (decision 1)
All files are classic scripts. Top-level `const`, `let` and `function` of one classic script are visible to the scripts loaded after it, and to every function of the earlier scripts at call time. The files are loaded in the order of the original code, so every load-time reference (for example `const S_SHOVEL = PATH.nearestS(...)`) finds what it needs exactly as in the single script. Each file starts with `'use strict'` as the script did.
- The code is **not rewritten**: no name changes, no namespace prefix.
- `window.__sim` is unchanged and stays the only door the tests use (`i18n` and `i18nMissing` stay).
- One new global, `window.AHT`, belongs to the loader (section 3.4).
- Because functions and `var` become properties of `window`, a collision with a built-in (`name`, `status`, `top`, `event`, `close`, `find`, `print`, `stop`, `scroll`, `open`, `length`…) would break silently. The one-time check at `/implement` lists every top-level name against `Object.getOwnPropertyNames(window)` of a blank page and records the result; the 300-odd current names are expected to have none.

### 3.3 Load time does declarations only (decision 4, AC-17)
Today the script's last lines, and a few lines inside it, do things at load time: attach listeners (2070–2153), load GoatCounter (529–549), then `applyStatic(); resetSim(); resize(); track(...)`, and start the loop (2154–2164). In the split page:
- `m4-controls.js` wraps the listener lines in `brancherCommandes()`; `analytics.js` wraps the loader in `demarrerMesure()`; `m4-start.js` defines `demarrer()`, which calls `demarrerMesure()`, `brancherCommandes()`, then the same sequence as today (`applyStatic(); resetSim(); resize(); track(…)`, the loop, in the same order as the single script, listeners first).
- Constants that look up the DOM (`const cv = $('map')`, `const guide = $('guide')`) stay where they are: they are declarations, and the scripts sit at the end of the body as before.
- `demarrer()` is called by the guard (3.4) and by nothing else. A page whose guard fails therefore attaches no listener, loads no analytics and starts no loop.
- Same order of effects, same draws: `compare-traces` proves it.

### 3.4 Load guard and release stamps (S12, S13, AC-14, AC-15, AC-17)
In `index.html`:
```
<head>  … <link rel="stylesheet" href="css/style.css">
        <script> window.AHT = { attendu: { 'css/style.css': '<stamp>', 'js/base.js': '<stamp>', … }, vu: {}, n: {},
                                inscrire(chemin, stamp) { … vu[chemin] = stamp; n[chemin] = (n[chemin] || 0) + 1; } }; </script>
<body>  … markup …
        <script src="js/base.js"></script> … 22 tags in the order of section 3.1 …
        <script> /* guard: compares attendu / vu / n, and the style sheet's stamp; shows the message or calls demarrer() */ </script>
```
- **Registration.** The last line of every script file is `AHT.inscrire('js/<name>.js', '<stamp>');`. It runs only if the whole file parsed and ran to the end: a missing file, a syntax error or an exception at load time all leave the file unregistered. The style sheet carries its stamp in a custom property on `:root` (`--aht-stamp`), which the guard reads from the computed style; an unloaded sheet gives an empty value.
- **Guard.** For each file of `AHT.attendu`: missing (not in `vu`), another stamp than expected (an old copy of that file, or an old `index.html`), or registered more than once. If any: show the message (3.5), set `AHT.erreur` to a text naming the files and the reason, throw an `Error` with the same text (so the browser console and the test report it), and do not call `demarrer()`. Otherwise call `demarrer()`.
- **Stamp.** A short hash (eight hexadecimal characters) of the file's text, with CRLF read as LF and without its own stamp line. The manifest in `index.html` lists the same values. Because each file has its own stamp, two changes to two different files touch two different lines and do not collide; no stamp depends on another file.
- **Helper.** `scripts/stamps.mjs`: `node scripts/stamps.mjs` recomputes every stamp and rewrites the stamp line of each file and the manifest in `index.html`; `--check` only reports. It reads the file list from the tags. It is development only, loaded by nothing, and the page works whether it was run or not; what fails when it was not run is the check `verifierEmpreintes` of `npm test` (a stale stamp weakens the guard, it does not break the page).
- **Why it detects the case that matters.** After a deployment a visitor may hold an old `index.html` (old manifest) with a new file, or a new `index.html` with an old cached file. In both, the file's own stamp and the manifest differ, so the page asks for a reload instead of running a mix. It does not guess which side is stale.

### 3.5 The load-failure message (decision 5)
A static block in `index.html`, hidden until the guard needs it: one short paragraph each in French, English (British) and German, with the list of files and the instruction to reload the page with the cache bypassed (Ctrl+F5); a line-level style inline so it still reads if the style sheet is the missing file. It does not use `data-i18n` because the translation files may be the ones that are missing; this is the single exception to the "French in the HTML, English and German in `STATIC`" scheme, documented in the README map and in `CLAUDE.md`. The failing files are shown as written (paths), never translated.

### 3.6 `scripts/compare-traces.mjs` across two shapes (spec section 4)
The reference page is rebuilt in a temporary folder with `git ls-tree -r --name-only <base>` filtered to `index.html`, `css/` and `js/`, and `git show <base>:<path>` for each (the same works when the base is the single file of today). The branch side already opens the working `index.html` from disk. Cases: the 20 existing ones, plus F and G on seeds 1 and 2 under `ENV.kernel` `RT` and `GP` (amendment of AC-6). The script keeps its exit codes. Recorded breakage (not part of `npm test`, as the script is not): one model constant altered in a copy, the script exits 1 and names the first difference.

### 3.7 One reader of the whole page for the text checks (S7, AC-7, AC-18)
`scripts/read-page.mjs` exports `readPage(root)`: it reads `index.html`, and returns the same text with every own `<script src="x">` replaced by `<script>` + the file's text + `</script>` and every own `<link rel="stylesheet" href="x">` replaced by `<style>` + the text + `</style>`, with CRLF read as LF; it also returns the list of own files and a function from a line of the rebuilt text to `file:line` for messages. It writes nothing and the page never uses it. Every existing check that took `html` (`verifierSyntaxe`, `verifierAnalytics`, `verifierTraductions`, `verifierLatenceSansChiffre`, `verifierSansConstructeur`, the link extraction) receives this text instead of `index.html`, so **their code and their negative tests do not change**; only the line of their test that read `index.html` changes, and the tests that locate a line in the text (`const clamp = `) find it in the rebuilt text. `scripts/check-links.mjs` uses the same reader, so the links inside the English and German guide texts are still checked; evidence: the set of links checked before and after is the same.

### 3.8 A rehearsal of GitHub Pages before the merge (S5, S6, AC-8, AC-19)
`file://` and `https://bretzelcoder.github.io/aht-safety-poc/` differ in four ways that can break a split page without breaking any other test: the page lives under a sub-path, the server is case-sensitive (Linux) while a Windows disk is not, files are served with MIME types and HTTP rules instead of from disk, and only files that are in git exist. A small test server reproduces them:
- `tests/helpers/serveur-pages.mjs`: a few lines of `node:http` (built in, no dependency) that serve the repository **only under `/aht-safety-poc/`** (any other path answers 404, so an absolute `/js/base.js` in a tag is caught), match each file name **in exact case** against the real directory listing (a tag that says `js/Base.js` for `js/base.js` answers 404 even on Windows), serve **only files that `git ls-files` lists** (an untracked file answers 404, as on Pages), and send `text/html`, `text/javascript` and `text/css` as Pages does. It listens on `127.0.0.1` on a free port and is stopped at the end of the run.
- `tests/souschemin.spec.mjs` (browser): opens `http://127.0.0.1:<port>/aht-safety-poc/index.html?lang=fr`, in each of the three languages, with the network blocked except that server (the `openPage` rule that aborts every non-`file:` request lets this origin through), then checks no console error, every own file requested once with status 200, `window.__sim.sim` defined, and scenario A played to its outcome as the existing scenario test does. The analytics must not load: the host is `127.0.0.1`, not `bretzelcoder.github.io`.
- **What it does not prove**: the real CDN cache (the stamps and `tasks.md`'s post-merge check cover it), HTTPS, and GitHub's own build; this is a rehearsal, and AC-19 after the merge stays.
- **Negative tests** (each on a copy of the page in a temporary folder, served by the same server): a tag with a wrong-case name, an absolute path (`/js/base.js`), a file that is not tracked by git; each makes the guard show its message or the test fail on the 404, and the test asserts that the simulation did not start.

### 3.9 Order of work (input to `/tasks`)
Lot 1: version check written and shown failing → the five places changed → workflow reduced → spec 001 amended → `npm test` on Node 24 and on GitHub.
Lot 2, each step green before the next, in this order:
1. The reader (3.7) and the adapted checks, **on the unchanged single file** (identity case): the suite is green and shows the reader changes nothing.
2. The registry, the guard, the message and `scripts/stamps.mjs` with zero files registered, then the style sheet moved out; the guard tests of AC-14, AC-15 and AC-17 on copies.
3. The files moved one concern at a time, in load order, each commit green and `compare-traces` identical; startup wrapped (3.3) in the commits of `analytics.js`, `m4-controls.js`, `m4-start.js`.
4. The map, the checks `verifierCarte`, `verifierConcerns`, `verifierEmpreintes`, `verifierRequetes`, `verifierChargements`, the downloaded-copy test, and the GitHub Pages rehearsal (3.8) with its three negative tests.
5. The four module checks and their recorded breakages.
6. `compare-traces` for two shapes and the extended cases; the one-time evidence (line multiset, global names, sizes); README, `CLAUDE.md`, evidence table; self-critique.

## 4. Data model
None. No storage, no table, no network. The page keeps what it keeps today (`localStorage` language choice). Access control: not applicable. `window.AHT` holds file names and eight-character stamps, nothing about the visitor.

## 5. Interfaces
- **Entry:** `index.html`, same URL. **Own files:** section 3.1.
- **Loader registry** `window.AHT` (`attendu`, `vu`, `n`, `inscrire`, `erreur`): internal to the loader, read by `openPage`.
- **Test door** `window.__sim`: unchanged.
- **Development scripts:** `node scripts/stamps.mjs [--check]` (new), `node scripts/compare-traces.mjs` (extended), `npm test` (new files in `tests/`, same command).
- **No UI change** except the load-failure message, which no visitor sees unless a file is missing.

## 6. Test strategy

### 6.1 What the existing suite proves (S5, S7)
Rendering and layout in three languages and two font sets, scenarios A to G, invariants, levels 1 and 2, the translation checks at runtime: all unchanged, run on the split page. `compare-traces` (identical, 28 cases after the extension) is the judge of the model.

### 6.2 New and adapted checks (all in `tests/`, run by `npm test`)
| Check | File | Proves | Observes | Planned breakage (negative test or recorded) |
|---|---|---|---|---|
| Node version | `versions.spec.mjs` (static) | AC-1, AC-2, AC-3 | the Node major written in the five places and the absence of a matrix | one place says 22 (five tests, one per place); a matrix with 22 added to the workflow |
| Reader | `fichiers.spec.mjs` (static) | S7, AC-7, AC-18 | the rebuilt text contains the code of every module (a known function of each) and every page file | a reader that returns only `index.html`: the check names the missing function |
| Map | `fichiers.spec.mjs` | AC-12 | tags = directory = README rows = `CLAUDE.md` paths = tracked files, exact case, no mixed line endings | file missing from the README; README row without a file; an untracked file; a path in another case; a file with CRLF and LF |
| Concern | `fichiers.spec.mjs` | AC-10 | the `@concern` header and every banner of a file, against the README column | a `module-3` banner pasted into a `module-2` file; a file without header |
| Stamps | `fichiers.spec.mjs` | AC-15 (static half) | each stamp equals the hash of the file and the manifest equals the stamps | a file edited without `stamps.mjs`; a manifest line changed |
| Loading | `fichiers.spec.mjs` | AC-9 | every tag and every URL-bearing call in the files | a third-party script tag; a `fetch('https://…')` outside the analytics file |
| Requests | `rendu.spec.mjs` (adapted) | AC-16 | the set of `file:` requests against the own-file list | a list with an unlisted file, a list missing a file |
| Guard | `chargement.spec.mjs` (browser, copies in a temporary folder) | AC-14, AC-15, AC-17 | message text in three languages, `AHT.erreur`, `window.__sim.sim`, the number of animation frames requested | a deleted script; a deleted style sheet; a script with a syntax error; one stamp altered; a script tag duplicated. The test also fails if the page starts (`__sim.sim` defined) in any of these |
| Copy | `copie.spec.mjs` (browser) | AC-8 | scenario A played from a copy of the tracked files in another folder, network blocked | a copy missing one tracked file: the test fails |
| Pages rehearsal | `souschemin.spec.mjs` (browser) + `helpers/serveur-pages.mjs` | S5, S6, AC-8, AC-19 (before the merge) | the page served over HTTP under `/aht-safety-poc/`, exact case, tracked files only: every own file answers 200, no console error, the simulation starts, scenario A plays, in three languages | a tag with a wrong-case name; an absolute `/js/…` path; an untracked file: each gives a 404 and the simulation does not start |
| Modules | `modules.spec.mjs` (static, `node:vm`) | AC-13 | section 6.3 | section 6.3 |

`openPage` gets an optional path (to open a copy) and stops at once on `AHT.erreur` with the files named (it used to wait its 8 s and quote only the page errors).

### 6.3 The four module checks (S11, AC-13; rule A-8: what each observes and the breakage that changes exactly that)
Each runs in a bare `node:vm` context (no `document`), loads the listed files in tag order, seeds `Math.random` with the same generator as the page tests, and declares doubles only for upward calls.
| Module | Files loaded | Doubles | Observes (pinned behaviour) | Breakage that changes exactly that |
|---|---|---|---|---|
| 1 World & physics | `base`, `m1-world-physics` | none | `brakeEnvelope(160, 0, 0.6)`, `(180, …)`, `(400, …)` limit and `aEff` (the values pinned in `tests/helpers/physique.mjs`), `stopDistance` for given inputs, `PATH` length and `vLimitAt` | change `P.Fbrake` or the `G` constant in a copy of the file: the pinned `aEff` moves |
| 2 Comms bus | + `m2-comms-bus` | `sim` (`{ t }`), `logEv` | `canUpdate` on a truck record: brake deadline missed from 67 % load, watchdog tripped from 84 %, never below; `k95`; `ddsBudget` per mode; the level 1 → 2 link keeps FIFO order and the delay `l1Delay()` | change the `0.020` in `canResponse` or `P.canWatchdog`: the 67 % or 84 % boundary moves |
| 3 Autonomy & safety core | + `i18n-engine`, `m3-*` | `sim`, `logEv` (records calls) | `l2Judge` on hand-built setpoints: the five defect codes (`SETPOINT_OVERSPEED`, `_BEYOND_MA`, `_STALE`, `_SEQUENCE`, `_INTEGRITY`) and an untouched setpoint accepted; `supervise` raises `L1_HEARTBEAT_LOST` after the deadline | change the 0.1 tolerance or the `P.l1Stale` comparison: a defective setpoint is accepted or a good one refused |
| 4 Fault injector & telemetry (non-drawing half) | + `m4-state`, `m4-scenarios` | `toast`, `logDirty` | `resetSim` builds three trucks; `scenarioNiveau1('F')` freezes the fastest moving truck and logs an `INJECT` `{k, p}` message; `logEv` keeps `{k, p}` and never a translated string | pick the slowest truck instead of the fastest: the frozen truck changes |
A check that cannot load a file without a double that the module does not name is a gap (spec section 7, question 5): the spec is amended, the module is not skipped.

### 6.4 Evidence at `/implement` (not permanent checks)
Line multiset of old script against new files; top-level names against the built-in globals of a blank page; line count of every file against 2,181; load time of the page before and after (to see that 23 requests cost nothing visible); the list of links checked before and after.

### 6.5 Budget
New static checks run in seconds; the guard tests open five small pages; the rehearsal opens the page three times and three small copies; the module checks use no browser. `npm test` stays far under the 5 minutes of spec 001; the figure is recorded in `tasks.md`.

## 7. Dependencies
None, for the page or for development. Node's `node:vm`, `node:fs`, `node:http` (rehearsal server), `node:crypto` (for the stamp hash) and `git` (already used by `compare-traces` and by the spec-status check) are built in or already required. Playwright 1.65.1 is not upgraded.

## 8. Risks and mitigations
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| A top-level name collides with a built-in global of the browser once the private scope is gone | Low | High (silent) | one-time comparison with a blank window's properties; the browser tests would show the symptom; any future collision is a new-function mistake the browser suite is likely to catch |
| A load-time reference meets a name declared in a later file | Low | High (page does not start) | same order as the original code; the page opens in three languages with no console error in every test; the guard shows nothing if the script throws |
| An existing text check goes vacuous (reads only `index.html`) | Medium | High (a check that cannot fail) | section 3.7 reader; the test that the rebuilt text contains each module; negative tests of every adapted check kept |
| The module checks pass vacuously (rule A-8, spec 002 SC-7) | Medium | Medium | each check has its breakage in 6.3, written from what it observes, run and recorded before its box is ticked |
| A file is added to the page and forgotten in the map or the tags | Medium | Medium | `verifierCarte` (both ways, plus `git ls-files`) |
| Release stamp helper forgotten after an edit | High | Low (guard weaker, page works) | `verifierEmpreintes` in `npm test` and in CI |
| False alarm of the guard on a visitor's cached files | Low | Low | the message asks for a reload with the cache bypassed; no automatic reload (would loop) |
| `compare-traces` base is a different shape on each side | Certain during lot 2 | Medium | section 3.6, recorded breakage |
| CRLF and LF mixed in new files (Windows working tree, tools that write LF) | Medium | Low | line endings check in the map check; stamps normalised |
| Name case differs between Windows and GitHub Pages (Linux) | Medium | High after deploy | exact-case comparison with `git ls-files`; all names lowercase; the rehearsal server of 3.8 answers 404 on a wrong case even on Windows |
| The page works from disk and fails under Pages (sub-path, MIME, untracked file) | Medium | High after deploy | the rehearsal of 3.8 before the merge, then AC-19 on the live site after it |
| Tests that locate a line by text (`const clamp = `) break | Certain | Low | adapted at step 1, on the rebuilt text |
| 23 requests slow the first load | Very low | Low | all small, same host, cached; load time recorded before and after |
| Lot 2 grows beyond a small step | Medium | Medium | one concern per commit, each green (constitution, principle 2); lot 1 is deliverable alone |
| A rule of `CLAUDE.md` to amend (Stack, checklist) | Certain | Low | proposed text in `tasks.md` and applied only with your validation, as the register requires |

## 9. Alternatives considered
- **A namespace object (`AHT.world.P`, …) instead of the global scope.** Cleaner in principle and rejected: every cross-reference (several thousand) would change, the diff would hide any real change, and S7 would no longer be provable by moving lines. The global scope keeps the code verbatim. Revisit only if a collision appears.
- **ES modules.** Do not load from `file://` (ADR-1's original reason); excluded by the owner's choice of a folder that opens by double-click.
- **A tool that assembles the files into one `index.html`.** Explicitly rejected in the ADR-1 amendment; it would be the build step ADR-1 refuses.
- **Fewer, larger files** (for example four module files and two translation files, 8 files). Fewer requests and a lighter map, but module 3 and module 4 stay at 340 and 590 lines and the translation tables stay mixed with the guide: the owner's four pains are only half cured. Possible fallback at `/tasks` if 22 files feel too many; no spec change needed.
- **More, smaller files** (one per function group, 40 or more). A heavier map, more registrations, no gain for reading.
- **Stamp by hand or by a single release number.** A single number changes in every file at every release and makes every pull request collide; per-file stamps change only where the file changes.
- **No stamp helper, stamps edited by hand.** Eight hexadecimal characters copied twice per change; error-prone; `verifierEmpreintes` would fail often for nothing.
- **Detecting a mix by the query string of the script URL** (`?v=…`). A cached old `index.html` would ask for old URLs that GitHub Pages serves with new content; the mix would not be seen. Only a stamp inside the file's content detects it.
- **Reading files with `fetch` or an `iframe` to keep the guide in a separate file.** Blocked on `file://` and would break the translation scheme of ADR-2.
- **Rehearse Pages by pushing the branch and reading a preview.** Pages publishes `main` only; a preview would mean merging first. The local server of 3.8 gives the same four conditions before any merge, at no cost.
- **Test the modules in the browser with the whole page.** What exists today; slower and cannot show that a module needs only what it declares.
- **A real JavaScript parser (a package) to check concerns and names.** A new dependency against constitution principle 4 for a check the banner convention and the module checks already approximate.
- **Lot 1 only, lot 2 later.** Possible and allowed by the spec (lot 1 can merge first); the plan keeps lot 1 free of any lot 2 dependency.

## 10. Impact on project rules
- **Spec before code** — applies: plan, then tasks, then `/implement` on branch `003-node-24-and-refactoring`.
- **Every number on screen is computed by the model** — applies as a guard: nothing displayed changes; `compare-traces` and the pinned values prove it.
- **Three languages, never translated** — applies, with one documented exception (3.5, decision 5): the load-failure message is inline in the three languages. Translation tables and checks keep their rules; the split of `STATIC` into four files does not change a key (the runtime check of key parity between `en` and `de` runs as before). Nothing new is translated otherwise.
- **British English** — applies to the English text of the message and of the README map.
- **Analytics** — applies as a guard: GoatCounter still loads on `bretzelcoder.github.io` only, now from `demarrerMesure()`, called after the guard; events keep the `aht-safety-poc/` prefix; `verifierAnalytics` reads the rebuilt text and keeps its negative tests. A page whose guard fails counts nothing.
- **Languages of the repository** — applies: comments and file headers in French, README map and commit messages in English; file names in English (the module names are English already).
- **Documentation follows the code** — applies: README (Node, a new section "Where things are", the checks paragraph) and `CLAUDE.md` (Stack, Project commands, Delivery checklist); the in-app guide and `docs/capture.png` do not change because nothing visible changes.
- **The test is the judge** — applies: no assertion changes (AC-7); only how checks obtain the code changes.
- **Every new check proves it can fail** — applies: table 6.2 and 6.3, each with its breakage, listed in the evidence table of `tasks.md` (delivery checklist: a check with no row is not delivered).
- **Re-measure before declaring a gap** — applies to every suspected trace difference (`compare-traces`, 0.02 s step, 28 cases).
- **Rules A-8, A-9, A-10, A-14 of the register** — A-8 applied (6.3); A-9 not triggered (no panel added or moved, no visible layout change); A-10 applies to any new browser test that reads state refreshed by a frame (the guard tests read `AHT.erreur` and the DOM after load, polling for the value); A-14 applied (AC-6 amendment).
- **Guardrails** — applies: disclaimer in the README and in the first comment of `index.html` (untouched); no secret files; no force-push of `main`; `git` is used read-only by the checks.
- **Delivery checklist** — applies in full: `npm test` green locally and on GitHub for Node 24; no missing translation; every check with its proof of failure; README, guide and screenshot consistent; live page checked after the merge (every file served, analytics snippet present).
- **ADR-1** — applies as amended on 2026-11-15; **ADR-2** — unchanged (the French guide stays in `index.html`); **ADR-3** — unchanged.
- **Constitution** — principle 2 (small steps) shapes 3.9; principle 4 (simplicity, no new dependency) shapes sections 7 and 9; principle 5 (privacy) untouched; principle 8 (honesty) untouched.
