# Plan 005 — Escaped dynamic text in the HUD

> Spec: `specs/005-hud-html-escaping/spec.md` (status APPROVED on 2026-11-19)
> Plan status: DRAFT · Approved: —

## 1. Summary
Add to `js/base.js` a tiny tagged template `html` that **escapes every interpolated value by default** and returns a marked object (`SafeHtml`); a value that is already `SafeHtml` is inserted as is, an array is inserted item by item, anything else (string, number, `{k,p}` already resolved by `t()`/`rp()`) is escaped. Every place of `js/m4-hud.js` that assigns markup to `innerHTML` is rewritten to `= html\`…\``, the helper functions that build fragments (`row`, `chip`) return `html\`…\``, and the `.map(...).join('')` calls inside them are replaced by plain arrays. A static check (`verifierEchappement`) then guarantees the rule cannot drift: every HTML sink of `js/` and of the inline scripts of `index.html` must take an `html` template, an explicit `raw()` on an allow-list, or an allow-listed authored expression; any untagged template literal that carries markup and a `${}` is reported. A small test-only setter of the hook feeds a hostile string to the log, the reasons, the rejection line and the tabs, and a browser test proves the page shows it as text in three languages. A development script compares the rendered panels with `main` to prove S2.

## 2. Requirement traceability
| Requirement (spec) | Technical answer (this plan) |
|---|---|
| S1 / AC-1 | `html` in `js/base.js` (section 5.1); the 12 sink lines of `js/m4-hud.js` rewritten, listed in section 5.3 |
| S2 / AC-4 | The text of messages is unchanged and the literal markup of each template is untouched; only interpolations are escaped. Proven by `scripts/compare-hud.mjs` (section 6), not by reading |
| S3 / AC-2 | `verifierEchappement` in `tests/helpers/controles-statiques.mjs` (section 5.4), with negative tests |
| S4 / AC-3 | `__sim.hostile(texte)` in `js/test-hook.js` (inside the published-site guard of spec 004) and `tests/echappement.spec.mjs` (section 5.5) |
| AC-5 | `node scripts/stamps.mjs` then the CSP re-pin after each task (section 8, risk R3); README line of `js/base.js` updated |
| Decisions 1, 2, 3 of the spec | Tagged template (b); the check covers all HTML sinks; small test-only setter |

## 3. Architecture
Files touched: `js/base.js` (the helpers), `js/m4-hud.js` (the 12 sink lines and the two fragment helpers), `js/test-hook.js` (the setter), `index.html` (only the release manifest, inside the first inline script, which moves the CSP hash: see R3), `README.md` (one line of the map), `tests/helpers/controles-statiques.mjs`, `tests/statique.spec.mjs`, a new `tests/echappement.spec.mjs`, a new `scripts/compare-hud.mjs`. No new file in the page: the README map of the page is unchanged except the wording of the `js/base.js` line. ADR-1 is respected (vanilla JS, no dependency, no build).

`html` is defined in `js/base.js`, the first script of the page, so it exists everywhere without changing the load order. Every test that loads modules alone already loads `js/base.js` first (`tests/modules.spec.mjs`), so none needs a double.

## 4. Data model
None. Log entries and supervisor reasons keep their stored shape `{k, p}` and are translated at display time (CLAUDE.md, Conventions); they are made inert only when pasted into the markup, never stored escaped.

## 5. Interfaces

### 5.1 The helper (`js/base.js`)
```js
class SafeHtml { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = v => String(v).replace(/[&<>"']/g, c => ESC[c]);
const inerte = v => v instanceof SafeHtml ? v.s : Array.isArray(v) ? v.map(inerte).join('') : v == null ? '' : esc(v);
function html(fr, ...vals) { let s = fr[0]; for (let i = 0; i < vals.length; i++) s += inerte(vals[i]) + fr[i + 1]; return new SafeHtml(s); }
const raw = texte => new SafeHtml(String(texte));   // balisage ÉCRIT PAR LE DÉPÔT : chaque usage est sur la liste du contrôle
```
`toString()` makes `el.innerHTML = html\`…\`` work without an extra call. Comments in French (CLAUDE.md). `raw` exists because decision 1 asks for an explicit marker; no use of it is planned (the literal parts of a template are never escaped, and a fragment from another `html\`\`` is already `SafeHtml`), so its allow-list is **empty** at delivery.

### 5.2 Behaviour that must not move
- **No double escaping**: `t()`, `rp()`, `codeName()`, `vid()` keep returning plain text; escaping happens once, at the outermost `${}` of an `html` template. A message or parameter is never escaped inside `t()`.
- **Apostrophes**: `'` becomes `&#39;` in the source string; the parsed DOM is identical to the one built from a bare `'` (text and attributes), so `innerHTML` read back, `textContent` and tooltips do not change. This is what `compare-hud` checks on the serialised DOM.
- **The log padding** (`padStart`, `padEnd`) is applied to the plain strings before the template, as today; spaces are not touched by the escaping.
- `lastTabs` compares the previous markup: it compares `String(tabsHtml)`.

### 5.3 The sites of `js/m4-hud.js` (survey of 2026-11-19, `main` at `d8ea72f`)
| Line | Today | After |
|---|---|---|
| 33 `row` | returns a template string | returns `html\`<div>…</div>\`` |
| 38 `frz` | template with `title="${t(…)}"` | `html\`…\`` (the `title` attribute is escaped) |
| 41, 45 `b1`, `b2` | `innerHTML = \`…\` + \`…\` + row(…)` | one `html\`…${…}…\`` with the pieces interpolated as `SafeHtml` |
| 53-57 `exL12` | `let h = …; h += …; innerHTML = h` | pieces `entete`, `corps`, `pourquoi` built as `html\`\`` then `innerHTML = html\`${entete}${corps}${pourquoi}\``; the `.map(…).join('')` becomes a plain array |
| 60 `chip` | returns a template string | returns `html\`…\`` |
| 66-67 `tabs` | `.map().join('')` | `html\`${tableau}\`` (array interpolated) |
| 71 `appliedLine` | template string | `html\`…\`` |
| 72 `reasons` | `.map(...).join('')` | `html\`${tableau}\`` |
| 74 `formula` | template string with `<sub>`, `<br>`, `&nbsp;` | `html\`…\`` (the literal markup is authored, only the `fmt()` values are interpolated) |
| 81 `tlat`, 82 `metrics`, 89 `cmp`, 91 `chips` | template strings / `.join('')` | `html\`…\`` |
| 102 `log` | `.map(...).join('')` | `html\`${tableau}\`` |

`js/i18n-apply.js` line 15 (`n.innerHTML = pick(d.i18nHtml, o.html)`) is repository-authored static text (spec, section 5): it stays and goes on the allow-list of the check with its reason. Line 13 only **reads** `innerHTML` (not a sink).

### 5.4 The check `verifierEchappement` (S3, AC-2)
A pure function over the text of a file, in the house style (`{fichier, ligne, message}`), run on every `js/*.js` file and on the inline scripts of `index.html`. Rules:
1. **Sinks**: `.innerHTML =`, `.innerHTML +=`, `.outerHTML =`, `.insertAdjacentHTML(`, `document.write(`, `document.writeln(`, `.srcdoc =`, `createContextualFragment(`, `new DOMParser`. For an assignment, the right-hand side must start with `html\`` or `raw(`; anything else (a variable, a bare template, a concatenation, a call) is reported **unless** the pair file + exact expression is on the allow-list. For a call form, the argument must start the same way. Reading `.innerHTML` (no `=`) is not a sink.
2. **Untagged markup templates**: a template literal that holds `${` **and** an HTML tag (`<[a-zA-Z]`) and is not immediately preceded by the identifier `html` is reported (this catches helpers like `row` and `chip` that build a fragment, not only the final assignment). Allow-list: none.
3. **`raw(`** is reported wherever it appears outside the allow-list (empty today).
4. The scanner walks the text once, tracking nested `${ … }` and backticks, and ignores comments. **Known limits, written in its docblock**: a backtick or brace inside a string or a regular expression literal is not understood (the repository has none in the files scanned today; the test of the real files proves it), and the check reasons on syntax, not on data flow: it cannot know that a value handed to `raw()` is authored.
The allow-list lives in the check's file (reviewed code, each entry with its reason) and is asserted **exactly**: an entry that matches nothing is reported as stale, like the stale hash of spec 004.

### 5.5 The setter and the browser test (S4, AC-3)
`js/test-hook.js`, inside the guard of spec 004 (so it never exists on the live site, and `verifierCrochet` keeps checking that), adds `hostile(texte)`: with the simulation paused by the test, it puts `texte` in (1) a new log entry as message (`RAW`) and as vehicle identifier, (2) the supervisor reasons of the selected truck (`msg: RAW(texte)`), (3) the last Level 1 rejection of the selected truck (`msg` and the `code` of an exchange row), (4) the identifier of the selected truck (tabs), then calls `hud()` and `renderL12`'s path through `showSideTab('L12')`. The test, in French, English and German, uses the string `<img src=x onerror="window.__pwn=1"><b id="pwn">gras</b> &amp; "q" 'a'` and asserts, for `#log`, `#reasons`, `#tabs` and `#exL12`: no `img` and no `#pwn` element exists, `textContent` contains the string **verbatim** (markup characters as written, `&amp;` not decoded), and the panel keeps its expected structure (same number of children as without the string). The CSP of spec 004 blocks the inline handler anyway, so the assertion is on **elements created**, not on the handler running.

## 6. Test strategy
| Proves | Test | Proof that it can fail |
|---|---|---|
| S3, AC-1, AC-2 (the repository follows the rule) | `tests/statique.spec.mjs`: `verifierEchappement` on the real files | six deliberately broken copies (section 5.4): an untagged template with `${}` assigned to `innerHTML`; a raw value in an attribute (untagged `title="${…}"`); a new unlisted `innerHTML = variable`; `insertAdjacentHTML` with a variable; `document.write(…)`; a `raw()` outside the allow-list; plus a stale allow-list entry |
| S4, AC-3 | `tests/echappement.spec.mjs`, three languages | a page copy where the escaping of the log site is removed (the log template pastes `${e.msg}` through `raw()`): the test fails naming the panel |
| S2, AC-4 | `scripts/compare-hud.mjs` (development only, same standing as `compare-traces`): replays scenarios A to G in French, English and German on `main` and on the working copy with the same seeds, at fixed instants (including one with a freeze row and one with a rejection), and compares the **serialised DOM** (`innerHTML`) of the twelve panels, then the text | a copy where one panel's class or one tooltip is changed: the script reports the first difference |
| AC-4 (model untouched) | `node scripts/compare-traces.mjs`: no difference | not new: its own recorded breakage (spec 002) |
| AC-5 | `npm test` locally and on GitHub; `node scripts/stamps.mjs --check` | existing |
Measured facts (2026-11-19, Node 24.14, 20,000 redraws after warm-up, the worst case: 120 log lines with 5 interpolations each): **44 µs** with plain templates, **155 µs** escaped, i.e. +0.11 ms per redraw of the log. The log is redrawn only when it changed (`logDirty`) and the HUD runs at most every 120 ms: the cost stays under 0.1 % of one core. The output was checked identical apart from `'` → `&#39;`. The spec's "negligible" holds; no lighter variant is needed.

## 7. Dependencies
None. No sanitiser library (ADR-1, spec section 5).

## 8. Risks and mitigations
| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | A `.join('')` left in a fragment turns markup into an escaped string: the panel shows `&lt;div&gt;` | Medium (12 sites, easy to miss one) | Visible defect | `compare-hud` compares the serialised DOM of every panel; the browser test of S4 also checks the structure; rule 2 of the check flags untagged templates |
| R2 | A `${}` that carried **authored** markup (a nested fragment) is escaped because it is a plain string | Medium | Visible defect | Same as R1; the fragments are `html\`\`` objects, so they pass as `SafeHtml` |
| R3 | **Every change of a `js/` file moves the CSP hash of spec 004.** The manifest of release stamps lives inside the first inline script of `index.html`, so each `node scripts/stamps.mjs` changes that script and its pinned hash; the spec said the hashes are unaffected, which is true only while no stamp moves (amended in the spec with this plan) | Certain, on each task | `npm test` red until the hash is re-pinned (the failing check prints the expected hash) | End of each task: `node scripts/stamps.mjs`, then re-pin the hash in the `<meta>`, then the scoped tests. See question Q1 |
| R4 | The scanner of the check misreads a backtick or brace inside a string | Low | False positive or negative | Known limit written in its docblock; the check is run on the real files (any misreading shows at once); the real files hold no such string today |
| R5 | `innerHTML` of an `html` template changes the parse of a numeric entity or `&nbsp;` | Very low | Visible | Literal parts are not escaped; `compare-hud` covers `formula` (`&nbsp;`) |
| R6 | The setter changes a truck identifier and the running page breaks later | Low | Test flake | The test pauses the simulation first and discards the page |

## 9. Alternatives considered
- **(a) One escaping helper called at each interpolation**: rejected by the owner's decision 1; it is safe only as long as everyone remembers to call it.
- **(c) Replace `innerHTML` by DOM construction (`textContent`)**: safest in kind, but rewrites the HUD and puts S2 at risk; rejected by decision 1.
- **Escape once when the entry is stored in `sim.log`**: rejected (spec section 8): stored text must stay `{k, p}` to survive a language switch.
- **Trusted Types (`require-trusted-types-for 'script'`)**: would make the browser itself refuse a plain string, but it needs a change of the policy of spec 004 (out of scope), is not available in every browser the page targets, and its meta-tag support is limited. Worth its own spec if the owner wants it; recorded here, not done.
- **A real JavaScript parser for the check**: no dependency is allowed to enter the repository for it (only `@playwright/test` is a `devDependency`); the small scanner and its documented limits are enough for 25 files.

## 10. Impact on project rules
- **Three languages**: does not apply (no new visible text). **Every number computed by the model**: does not apply. **British spelling, capture**: does not apply (no visible change); `docs/capture.png` unchanged (AC-5).
- **Documentation follows the code**: applies to one line: the README map says `js/base.js` holds "Two helpers used everywhere (`$`, `clamp`)": it becomes the list of its helpers (the `html` tag and its helpers).
- **The test is the judge**: applies; a visible difference found by `compare-hud` is a spec amendment, never a loosened comparison.
- **Every new check proves it can fail**: applies (section 6); every check is listed in the evidence table of `tasks.md` next to its breakage.
- **Release stamps / manifest**: applies, with the CSP re-pin (R3).
- **A new Convention for CLAUDE.md** is proposed, not applied (rule of the improvement log: a rule change is the owner's decision): "Decided spec 005: dynamic text enters the page through the `html` tag; the check `verifierEchappement` fails otherwise".

## 11. Questions for the owner
- **Q1** — Because of R3, each task of this spec needs a manual re-pin of the CSP hash after `node scripts/stamps.mjs`. Do you want `scripts/stamps.mjs` to **also re-pin the hashes** of the policy (a small change of a development script, covered by its own test), or keep the manual step (the failing check prints the expected value, so it costs one edit per task)? Recommendation: keep the manual step in this spec and write the improvement as an action, to keep this spec to its subject.
- **Q2** — `compare-hud` stays a development script (like `compare-traces`, not in `npm test`) because its reference is `main`. Do you agree, or do you want a frozen snapshot of the expected panels committed so that it runs in `npm test`? Recommendation: development only; the committed structure test of S4 already runs in `npm test`.

## 12. Task order (atomic commits, `feat(005):`…)
1. **T-02** the helpers in `js/base.js` + README line + stamps + CSP re-pin; unit test of `html` (escaping of the five characters, nested `SafeHtml`, arrays, `null`, numbers) with a breakage (an interpolation not escaped).
2. **T-03** the check `verifierEchappement` with its seven negative tests, **first run on `main`'s `js/m4-hud.js`: it must fail on the 12 sites** (the check is proven on the real defect before the fix), allow-list with the single `i18n-apply.js` entry.
3. **T-04** the setter `hostile()` in the hook and `tests/echappement.spec.mjs`, **first run red** on the unfixed HUD (proves the test sees the defect).
4. **T-05** rewrite of the HUD sites, in two commits if the diff is large (the tabs, reasons, log and rejection line first, since they are what S4 covers; then the panels), the check and the browser test going green.
5. **T-06** `scripts/compare-hud.mjs` and its recorded breakage; run on all scenarios and languages; `compare-traces` unchanged.
6. **T-07** full `npm test` on Node 24, evidence table, self-critique, then the owner's request for the pull request.
