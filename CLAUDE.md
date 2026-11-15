# Project: aht-safety-poc

## Product context
An interactive, single-page simulator that shows how an Autonomous Haul Truck (AHT) in an open-pit mine stays safe in mixed traffic: braking envelopes, FMS movement authority, CAN J1939 arbitration, DDS quality of service and an independent safety supervisor. It is a teaching proof of concept for engineers, students and decision-makers discovering autonomous haulage safety, published at https://bretzelcoder.github.io/aht-safety-poc/. It is not a safety tool and is not affiliated with any equipment manufacturer or mining company. See `docs/constitution.md` for the non-negotiable principles and `docs/architecture-decisions.md` for the ADRs.

## Stack
- One self-contained `index.html`: HTML5, CSS and vanilla JavaScript on an HTML5 canvas. No framework, no build step, no package manager (ADR-1).
- Script organisation: an I18N block and an analytics block, then four modules: MineWorld & PhysicsEngine, EmbeddedCommsBus, AutonomyAndSafetyCore, FaultInjector & TelemetryHUD. Physics runs at a fixed 50 Hz step, decoupled from rendering.
- External resources: Google Fonts (optional, system fonts as fallback) and GoatCounter `count.js` (GitHub Pages only, ADR-3).
- Hosting: GitHub Pages, branch `main`, folder `/`.

## Spec-Driven Development workflow — STRICT RULES

Commands come from the sdd-kit plugin: /specify is /sdd-kit:specify, and so on.

1. **Never code without an approved spec.** Every feature starts with `/specify`.
2. Full cycle: (`/brainstorm`, optional) → `/specify` → human validation → `/plan` → human validation → `/tasks` → `/implement` (chained by default, see rule 4) → `/review`.
3. A spec lives in `specs/NNN-slug/` (spec.md, plan.md, tasks.md). NNN = sequential number. **Each spec is developed on a dedicated branch** `NNN-slug`, created from an up-to-date main. No feature code ever committed directly on main.
4. During `/implement`: chain the unchecked tasks of tasks.md (lint + typecheck + scoped tests green after each task, full suite once at the end, box ticked, then commit) without stopping between tasks. Stop only: (a) at the end of tasks.md, (b) on a gap with the spec (rule 5), (c) if the user explicitly asks for task-by-task control.
5. Any gap discovered during implementation = back to the spec (amend it), no improvisation in the code.
6. **The spec header always tells its real status** (DRAFT → IN REVIEW → APPROVED → DELIVERED → CLOSED, or ON HOLD / ABANDONED).
7. Atomic commits per task: `feat(NNN): T-XX description` (or fix/chore/test).
8. **Pull request and merge into main: always on the user's explicit request**, confirmed at the time of the action. Never on Claude's initiative, even when every task is done.
9. **Continuous improvement**: at the end of every session that covers a spec, write a self-critique and a "rapport d'étonnement" in `docs/continuous-improvement.md`, each finding with an action (owner + trigger). At the start of a session, re-read the open actions.

## Conventions
Rules recorded before the kit was adopted are dated; from now on, each new rule names the spec that triggered it ("Decided spec NNN") and, whenever possible, becomes an automated check.

- **Every number on screen is computed by the model.** No hard-coded displayed value; each simplification is stated in the guide's "Limitations and sources" tab and in the README "Limitations" section.
- **Three languages, French by default** (2026-11-13, ADR-2). Every user-visible string exists in French, English and German:
  - static text: French stays in the HTML, marked with `data-i18n`, `data-i18n-html`, `data-i18n-title` or `data-i18n-aria`; English and German go in `STATIC`;
  - dynamic text: `[fr, en, de]` triplets in `MSG`, rendered with `t(key, params)`;
  - log entries and supervisor reasons are stored as `{k, p}` messages (`M()`, `N()`, `RAW()`) and translated at display time, never as pre-translated strings;
  - numbers go through `fmt()` or `N()`: decimal comma in French and German, point in English.
- **Never translated** (2026-11-13): supervisor states (`NOMINAL`, `EMERGENCY_BRAKE`…), fault and log codes (`DM1_…`, `DDS_…`, `CAN_…`), DDS QoS names (RELIABLE, BEST_EFFORT, Deadline, Liveliness), acronyms (SIL, FMS, V2X, LiDAR, GNSS RTK, ECU, IMU, AHT), standard references and formula variables (`a_eff`, `d_stop`, `t_lat`, μ). Home-made identifiers are localised through `vid()` and `codeName()` (`VL-VOUS` / `LV-YOU` / `LV-SIE`).
- **English** text in the UI and the README uses British spelling.
- **Analytics** (2026-11-13, ADR-3): GoatCounter loads only on `bretzelcoder.github.io`. Events are namespaced `aht-safety-poc/…` because the dashboard is shared with other projects. Never send anything the visitor typed or anything personal.
- **Languages of the repository**: code comments in French; README, commit messages and ADRs in English.
- **Documentation follows the code**: a change to scenarios, controls or panels updates the README tables and the in-app guide (all three languages); a visible UI change updates `docs/capture.png` (English UI, 1600×900).

## Project commands
There are no automated checks yet: the first spec should introduce them. Until then, Claude runs these by hand and reports the result:
- Syntax: extract the inline `<script>` of `index.html` and run `node --check` on it.
- Smoke test: render `index.html?lang=fr`, `?lang=en` and `?lang=de` in headless Chrome; no console error, and the event log is filled in the right language.
- Run: open `index.html` in a browser. No build.
- `<lint>` / `<typecheck>` / `<test>` / `<build>`: to be defined by the spec that adds automated checks.

## Guardrails
- Never read or modify secret files (`.env*`).
- Never run a destructive migration without explicit confirmation.
- When in doubt about a requirement: ask, do not assume.
- Keep the disclaimer (educational model, not a safety tool, not affiliated with any manufacturer) in the README and in the header comment of `index.html`.
- Never force-push `main`: it is what GitHub Pages publishes.

## Delivery checklist (end of spec / before merge)
- Syntax check and headless smoke test green in French, English and German.
- No string missing a translation: every new `MSG` triplet has three entries, every new `data-i18n*` key exists in `STATIC.en` and `STATIC.de`.
- README, in-app guide and screenshot consistent with the change.
- After merge: check the live page on GitHub Pages (new content present, analytics snippet still there).
