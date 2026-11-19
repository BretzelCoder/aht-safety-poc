# Spec 005 — Escaped dynamic text in the HUD (finding M3 of the security audit)

> Status: DRAFT
> Created: 2026-11-19 · Approved: —
> Input: finding **M3** of the security audit of 2026-11-18, explicitly postponed to its own spec by the owner when spec 004 was approved (see spec 004, section 5). Survey done on `main` at `d8ea72f` (static read of `js/`, 2026-11-19).

## 1. Problem / Why
The HUD builds part of its markup by pasting text into HTML strings assigned to `innerHTML` (`js/m4-hud.js`: the event log, the supervisor reasons, the Level 1/2 rejection line, the freeze row, the applied-state line, the tabs, the formula, the metrics, the chips, the comparison table). The text goes through `rp()` / `t()` / `codeName()` / `vid()` (`js/i18n-engine.js`), which return text **as is**: nothing turns `<`, `&` or `"` into harmless text. Any string that reached these functions with markup in it would be interpreted as HTML by the browser.

Today this is **latent only**, nothing reachable by a visitor feeds it (the survey of 2026-11-19):
- the only inputs of the page are the `?lang=` parameter and the saved language, both checked against the list `LANGS` before use; the page has no text field, no form, no file input;
- the messages of `MSG` hold no markup and no HTML entity (`<[a-z/]` finds none in `js/i18n-messages.js`);
- the values pasted into the HUD come from the model, from constants, or from `<select>` values (`ENV.l1Defect`, shown with `RAW()` in the log of scenario G).

Why do it anyway: the page teaches safety engineering and is published under the owner's name; the next feature that shows anything not authored in the repository (an imported scenario, a shared link, a typed label) would inherit an injection point with no one remembering it exists. Since spec 004 the policy of the page blocks inline event handlers and foreign scripts (defence in depth), but it allows `'unsafe-inline'` styles and is a meta tag that a markup injection can still bend (an injected element is not a script, and it can still change what the engineer reads). Closing it at the source costs little.

## 2. Users
- **A visitor**: must notice **no difference at all**: same text, same three languages, same layout, same numbers.
- **The owner and contributors (including Claude)**: a future feature that adds text to the HUD must be made safe by default, and an automated check must fail when it is not.

## 3. Expected behaviour (WHAT, not HOW)
- **S1 — Dynamic text is shown as text.** As a visitor, when any message, code, identifier or parameter shown in the HUD contains markup characters (`<`, `>`, `&`, `"`, `'`), then I see those characters as written, and no element, attribute or script is created from them. This holds for every place of `js/` that assigns a string built with a template to `innerHTML`, whatever the source of the text (message, supervisor reason, log entry, rejection reason, vehicle identifier, parameter).
- **S2 — Nothing changes for what is shown today.** As a visitor, with the page as it is (no markup in any message), the rendered HUD is identical to the one of `main`: same text content, same numbers, same three languages, same titles and tooltips, same layout at 1600×900. The existing authored markup (`<b>`, `<span class="num">`, `<h4>`, `<small>`, table cells, `data-i18n-html` fragments of the guide) keeps working: only **dynamic values** are made inert, not the structure the code writes itself.
- **S3 — The rule cannot drift.** As a contributor, when a template assigned to `innerHTML`, `outerHTML`, `insertAdjacentHTML` or `document.write` pastes a dynamic value without making it inert, then an automated check fails and names the file, the line and the expression. A value that is safe by nature (a number from `fmt()`/`N()`, a class name taken from a fixed list, a colour from a table) is allowed by an explicit, commented, reviewed list, not by the check's silence.
- **S4 — Proven on the page, not only on the source.** As a contributor, a browser test injects a hostile string through a small setter of the test hook, which exists only off the published site (into a log message, a supervisor reason, a Level 1 rejection reason, a vehicle identifier), and shows that the HUD displays it as text and creates no element from it, in French, English and German.

## 4. Edge cases and errors
- **A message that legitimately needs markup**: none today (none of the 162 `MSG` entries counted on 2026-11-19 has any). If one is added, it is a deliberate exception to S1, written in the allow-list of S3 with its reason, never a silent bypass.
- **Attribute context**: `title="${t(...)}"` (freeze row) and `class="${e.cls}"`, `style="color:${…}"` put text inside an attribute: a `"` would close it. S1 covers attributes as well as text nodes.
- **Text already escaped twice**: a value that passes through `rp()` inside `t()` parameters must not be escaped twice (it would show `&amp;`). To be settled by the plan with the precise place where the text becomes inert.
- **Padding and alignment of the log**: the log pads identifiers with spaces (`padStart`, `padEnd`) in a `<div>`; making text inert must not change a single visible character.
- **`i18n-apply.js` re-reads `innerHTML` of authored nodes** (`ORIG`) to restore French: it handles repository-authored static text, not dynamic values (see section 5).
- **Performance**: the log redraws up to 120 lines on each refresh; the cost of making text inert must stay negligible (measured in the plan, not assumed).

## 5. Out of scope (explicit)
- The authored static text of the page and the guide (`data-i18n-html`, `STATIC`): written by the owner in the repository, not dynamic; they stay HTML.
- Any change visible to a visitor: no UI, no model, no wording, no new string (so no translation to add).
- A sanitiser library or any new dependency (ADR-1: no package loaded by the page).
- Content Security Policy changes (spec 004 is delivered; this spec does not touch the policy). Its inline script hashes are unaffected as long as no inline script of `index.html` changes.
- F2 (framing) and the rest of the audit: nothing else is open.

## 6. Acceptance criteria (testable)
- [ ] AC-1 — Every assignment of a template string to `innerHTML` in `js/` (the sites listed by the plan from a survey made at `/plan` time: 12 lines of `js/m4-hud.js` on 2026-11-19, the two lines of `js/i18n-apply.js` being authored static text, see section 5) makes its dynamic values inert, or is listed with its reason in the allow-list of S3. *(S1, S3)*
- [ ] AC-2 — The static check of S3 exists, passes on the repository and **fails** on three deliberate breakages recorded in the evidence table: a dynamic value pasted raw into a template, a raw value in an attribute, a new unlisted `innerHTML` assignment. *(S3)*
- [ ] AC-3 — The browser test of S4 passes in French, English and German for the log, the supervisor reasons and the rejection line, and **fails** on a copy of the page where the escaping of one site is removed. *(S4)*
- [ ] AC-4 — The rendered HUD is the same as on `main`: `node scripts/compare-traces.mjs` shows no difference (model untouched), and a text-content comparison of the HUD panels over a scripted run (scenarios A to G, three languages) shows no difference. *(S2)*
- [ ] AC-5 — `npm test` green locally and on GitHub (Node 24); release stamps current (`node scripts/stamps.mjs`); README map unchanged unless a file is added; no translation added or required; `docs/capture.png` unchanged. *(Delivery checklist)*

## 7. Open questions
- No open question: the three questions of the draft were answered by the owner on 2026-11-19, see section 9.

## 8. Digital sobriety
No network, no storage, no dependency. Compute: an escaping pass over the text of the HUD at each refresh; the log (120 lines) is the heaviest case. A lighter alternative (escaping only once, when an entry is stored in `sim.log`) is considered at the plan, because log entries are stored as `{k, p}` messages translated at display time (CLAUDE.md, Conventions): storing pre-escaped text is **rejected**, it would break the language switch.

## 9. Decisions
- Owner decisions (2026-11-19, answers to the three questions of the draft):
  1. **Where the text becomes inert: a tagged template** that escapes every `${}` by default and takes an explicit marker for authored markup (shape (b)). The measurement of the cost (section 4) is still taken at `/plan`.
  2. **Sinks covered by the check: all of them**: `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` (only `innerHTML` is used today, the others are covered against a future use).
  3. **Hostile-string entry for S4: a small test-only setter** added to the test hook (`js/test-hook.js`, inside the published-site guard of spec 004, so it never exists on the live site), not a reuse of `l1Inject`.
- Checks required by CLAUDE.md:
  - Three languages, every user-visible string: **not applicable** (no new visible text).
  - Every number on screen computed by the model: **not applicable** (nothing displayed changes).
  - English British spelling, README/guide/screenshot consistency: **not applicable** (no visible change); the README "Where things are" line of any file touched keeps its current wording.
  - Every new check proves it can fail: **applies**, AC-2 and AC-3 (negative tests, listed in the evidence table of `tasks.md`).
  - The test is the judge: **applies**; if S2 fails (a visible difference), the spec is amended, the comparison is never loosened.
  - Release stamps: **applies** (`node scripts/stamps.mjs` after any change to a file of `js/`).
  - Analytics: **not applicable** (nothing sent).

## 10. Delivery and acceptance
- Pull request and merge only on the owner's explicit request (rule 8).
- After merge: open the live page, play a few scenarios in the three languages, check that the log, the reasons and the Level 1/2 tab read as before, and that the console shows no error (the policy of spec 004 is still in force).
- At the end of the session: self-critique and "rapport d'étonnement" in `docs/continuous-improvement.md`, with the actions re-read at the start.
