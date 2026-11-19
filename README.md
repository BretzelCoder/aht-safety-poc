# aht-safety-poc

An interactive, single-page simulator that shows how an **Autonomous Haul Truck (AHT)** in an open-pit mine stays safe in mixed traffic: braking envelopes, fleet-management movement authority, CAN bus arbitration, DDS quality of service and an independent safety supervisor. It also shows the two-level architecture of such a truck: an autonomy computer that proposes and a safety controller that allows or blocks.

It is a teaching proof of concept. The physics is simplified but consistent: every number on screen is computed by the model.

**Live demo:** [bretzelcoder.github.io/aht-safety-poc](https://bretzelcoder.github.io/aht-safety-poc/) ([English](https://bretzelcoder.github.io/aht-safety-poc/?lang=en), [Deutsch](https://bretzelcoder.github.io/aht-safety-poc/?lang=de))

![Simulator screenshot in English: three autonomous haul trucks on a haul loop, a V2X-equipped light vehicle holding intersection I1 and truck AHT-03 waiting for its token. The Levels 1 ↔ 2 view is open: level 1 (what it claims) and level 2 (what it measures) side by side, and the list of setpoints with one stale setpoint rejected. The FR / EN / DE language switch is in the header](docs/capture.png)

> The user interface is available in French (default), English and German. Switch with the **FR / EN / DE** buttons in the header or with `?lang=en` / `?lang=de` in the URL; the choice is remembered in the browser. Technical terms, supervisor states, fault codes, DDS QoS names and standard references stay unchanged in every language. An in-app guide (button **Guide and explanations** or key **H**) explains every panel.

## Run it

No build, no dependencies. Use the [live demo](https://bretzelcoder.github.io/aht-safety-poc/), open `index.html` in a recent browser (from the downloaded folder: `index.html` needs the `css/` and `js/` folders next to it, and says so in French, English and German if one is missing), or serve your own copy with GitHub Pages (Settings → Pages → deploy from branch `main`, folder `/`). Only the [automated checks](#automated-checks) need anything installed, and the page never loads it.

The page loads Google Fonts if online and falls back to system fonts otherwise.

### Analytics

The live demo counts visits with [GoatCounter](https://www.goatcounter.com/), a privacy-friendly service: no cookies, no personal data, aggregated statistics only (page views, referrer, country, browser, screen size). It also records a few anonymous events: the language shown at start and language switches, the scenarios launched and the guide being opened. Tracking only runs on the GitHub Pages site; a local copy of `index.html` loads nothing. To credit a shared link, add `?ref=<source>` to it (for example `?ref=linkedin`): GoatCounter shows it as the referrer.

## What you can explore

| Topic | What the simulator shows |
|---|---|
| Braking envelope | Each truck projects an amber caution zone and a red SIL stop zone along its path, recomputed every 20 ms from speed, mass, grade, road adhesion and latency. |
| Mass effect | Empty, the truck is adhesion-limited and mass cancels out; loaded, it is brake-capacity-limited. Loaded and downhill is the sizing case. |
| Movement authority | The fleet management system (FMS) grants each truck a stretch of road and intersection tokens. A truck never drives beyond its authority. |
| Mixed traffic | You drive a maintenance pickup (ZQSD or arrow keys), with or without a V2X beacon, and cut in front of the trucks. |
| Fail-operational | With the LiDAR blinded by dust, the truck falls back on radar and continues at 15 km/h. |
| CAN bus (J1939) | Priority arbitration keeps a well-prioritised brake command fast under load; a mis-prioritised one misses its deadline, then trips the brake ECU watchdog. |
| DDS QoS | Periodic state with Deadline and Liveliness versus event-driven RELIABLE or BEST_EFFORT, under packet loss. |
| Safety supervisor | State machine `NOMINAL` → `DEGRADED_SPEED` → `CONTROLLED_STOP` → `EMERGENCY_BRAKE` (latched until acknowledged), with the state actually applied by the motion controller shown separately. |
| Two levels | The autonomy computer (level 1) sends setpoints (speed demand, timestamp, sequence counter, checksum) to the safety controller (level 2), which rechecks each one with its own measurements before the truck follows it. A frozen or misbehaving level 1 is stopped by level 2 alone. The **Levels 1 ↔ 2** tab of the oscilloscope card shows both computers and their latest exchanges; the **Architecture** tab of the guide draws an illustrative software and hardware stack for each. |
| Kernel profile | The autonomy computer runs a general-purpose kernel or PREEMPT_RT, modelled as two illustrative worst-case computing latencies. The general-purpose profile lengthens the reaction time, the stop zones and the distance the truck really travels. |

### Built-in scenarios

| | Scenario | Expected outcome |
|---|---|---|
| A | Pickup **with** V2X crosses intersection I1 | The FMS revokes the truck's I1 token; the truck makes a planned stop before the intersection. |
| B | Pickup **without** V2X crosses I1 | Only on-board perception protects; trajectory prediction slows the truck early. |
| C | B inside a dust cloud | LiDAR lost, radar fallback, degraded speed, mission continues. |
| D | Stop command sent once in BEST_EFFORT with 50 % loss | The order is lost silently in most runs and a collision follows in a sizeable share of them, so replay several times. Switch to periodic publishing to compare. |
| E | Saturated CAN bus, brake command mis-prioritised | Deadline missed → controlled stop; push the load towards 90 % → watchdog → emergency brake. |
| F | Level 1 frozen | The autonomy computer of the fastest truck stops sending. Level 2 notices the silence after the heartbeat deadline and brings the truck to a controlled stop at maximum braking, on its own. Restart level 1: the stop is released after a stable heartbeat. |
| G | Defective setpoint | Level 1 sends one setpoint with the chosen defect (overspeed, beyond the movement authority, stale timestamp, replay, invalid integrity). Level 2 rejects it, names the defect and the truck carries on. Sent continuously, consecutive rejections stop the truck as a lost heartbeat does. |

Scenarios A to E and the Reset button set the kernel profile back to PREEMPT_RT, which is what their outcomes are calibrated on; F and G keep the profile you chose, so you can compare the two on a failing autonomy computer.

## Modelling choices

- **Stopping distance:** `d_stop = v·t_lat + v² / (2·a_eff) + margin`, with `a_eff = min(F_brake/m, μ·g·cosθ) − g·sinθ`. Keeping the two limits separate is what makes mass matter.
- **Stop zone and braking:** the red zone uses maximum deceleration, so an intrusion triggers maximum modulated braking; the amber zone uses a comfortable deceleration.
- **CAN load is a design budget, not a runtime safety criterion.** The usual 40 % rule comes from response-time analysis. At runtime what matters is the brake command latency against its deadline.
- **Safety commands over DDS** are published periodically with Deadline and Liveliness, and the receiver goes to a safe state on silence (black-channel principle, IEC 61784-3). RELIABLE guarantees delivery, not timeliness.
- **ROS 2 / DDS do not carry the safety integrity level.** Safety lives in an independent supervisor (doer/checker pattern) and in actuator watchdogs: the planner avoids the zones, the supervisor checks them.
- **One cause per brake fault:** once the brake ECU watchdog has tripped (from 84 % CAN load in this model), the log shows only `DM1_BRAKE_CMD_TIMEOUT`; the missed deadline (`CAN_BRAKE_DEADLINE`, from 67 %) is implied and is no longer logged.
- **Loss of the FMS link** leads to a planned stop inside the authority already granted, not to an emergency stop.
- **Unequipped vehicles are a degraded case:** in operation every vehicle entering the autonomous zone carries a terminal; on-board perception is the last barrier.
- **Emergency state is latched** and needs an explicit acknowledgement before the truck can move again.
- **Level 1 proposes, level 2 allows or blocks.** Every setpoint is judged on its checksum, its age, its sequence number, its speed against the limit of the road section and its goal against the end of the movement authority. The last two use level 2's own measured position and the authority it holds, never the position or speed that level 1 claims. A rejected setpoint never reaches the actuators.
- **Losing level 1 is a controlled stop, not an emergency.** A silent level 1, or one whose setpoints keep being rejected, brings the truck to a controlled stop at maximum braking decided by level 2 alone. That stop is not latched: it is released once the heartbeat has been stable for a stated time, after the usual short hold of the state; the Levels 1 ↔ 2 view counts down to the real release. The emergency state stays latched, and a recovered level 1 never releases it.
- **The kernel profile is a worst case, not a measurement.** Each profile is an illustrative bound on the computing time of level 1. It enters `t_lat`, and the difference from PREEMPT_RT delays what level 1 passes to level 2, so the truck really travels the extra distance. The heartbeat deadline stays above that delay: a profile never causes a heartbeat loss by itself. The delay does make a frozen level 1 be detected later, because the setpoints already in flight keep arriving; scenario F shows the detection delay and the distance the truck travels before it stops.

## Code structure

The simulator is vanilla JavaScript on an HTML5 canvas, with no framework, no build step and no package for the page (ADR-1). The script is split into four modules:

1. **MineWorld & PhysicsEngine:** haul road graph, grades, longitudinal dynamics with traction, braking and adhesion limits.
2. **EmbeddedCommsBus:** CAN response-time model per priority class, DDS safety topic with loss, retransmission, Deadline and Liveliness, and the ordered link from level 1 to level 2 (delayed by the kernel profile, with a home-made checksum).
3. **AutonomyAndSafetyCore:** perception (LiDAR, radar, V2X), FMS tokens and movement authority, planner, level 1 emission, level 2 checks (integrity, freshness, sequence, overspeed, authority), safety supervisor, motion controller.
4. **FaultInjector & TelemetryHUD:** scenarios, fault injection (including the autonomy computer), pickup driving, telemetry panels, oscilloscope, levels 1 ↔ 2 view and event log.

Physics runs at a fixed 50 Hz step, decoupled from rendering.

The translation files (`js/i18n-*.js`) hold the translations; they load right after the two small files `js/base.js` and `js/analytics.js`. French static text stays in the HTML (`data-i18n*` attributes) with English and German in `STATIC`; dynamic messages are `[fr, en, de]` triplets in `MSG`. Log entries and supervisor reasons are stored as message keys with parameters and translated at display time, so switching language also re-translates the event history.

### Where things are

The page is `index.html` plus its own plain files, loaded by ordinary `<script src>` and `<link>` tags in the order below (no module, no build, no installation; it opens from a downloaded folder). The code is the one script that used to sit in `index.html`, cut along its own joints and moved line for line (the private scope of the script is gone, and the lines that used to run at load time sit in four start-up functions that the load guard calls, see `js/m4-start.js`). The files share the page's global scope. Each file starts with a comment that names its concern and ends with a release stamp that `node scripts/stamps.mjs` keeps up to date; the page starts only if every file is present and of the same release, and otherwise says so in French, English and German (that message is written inline in `index.html`, because the translation files may be the ones that are missing). A check fails when this table, the tags and the files disagree.

| File | Concern | What it holds |
|---|---|---|
| `index.html` | entry | Entry file: markup, French static text and French guide (ADR-2), the load registry, the script tags in load order, the load guard and its failure message in French, English and German. |
| `css/style.css` | style | The style sheet. |
| `js/base.js` | base | The helpers used everywhere: `$`, `clamp`, and the tagged template `html` (with `SafeHtml`, `esc`, `raw`) that makes every dynamic value inert when it is pasted into markup. |
| `js/analytics.js` | analytics | GoatCounter, on the published site only (ADR-3). |
| `js/i18n-engine.js` | i18n | Current language, `fmt`, `M`, `N`, `RAW`, `t`, and the empty `STATIC` tables. |
| `js/i18n-en-ui.js` | i18n | English interface strings (`STATIC.en`). |
| `js/i18n-en-guide.js` | guide | English guide text (`STATIC.en`, `guide.*`). |
| `js/i18n-de-ui.js` | i18n | German interface strings (`STATIC.de`). |
| `js/i18n-de-guide.js` | guide | German guide text (`STATIC.de`, `guide.*`). |
| `js/i18n-messages.js` | i18n | `MSG`: the `[fr, en, de]` triplets of dynamic messages. |
| `js/i18n-apply.js` | i18n | `applyStatic`: puts the static translations into the HTML. |
| `js/m1-world-physics.js` | module-1 | Module 1 (MineWorld & PhysicsEngine): road graph, model parameters, braking envelope. |
| `js/m2-comms-bus.js` | module-2 | Module 2 (EmbeddedCommsBus): CAN, DDS, the level 1 → level 2 link. |
| `js/m3-perception.js` | module-3 | Module 3 (AutonomyAndSafetyCore): sensors, obstacle distance, stop bubble. |
| `js/m3-fms-planner.js` | module-3 | Module 3: FMS tokens and movement authority, operating cycle, planner. |
| `js/m3-levels.js` | module-3 | Module 3: level 1 emission and failure, level 2 measurements and judgement of setpoints. |
| `js/m3-supervisor-control.js` | module-3 | Module 3: safety supervisor, motion controller, truck physics. |
| `js/m4-state.js` | module-4 | Module 4 (FaultInjector & TelemetryHUD): simulation state, trucks, light vehicles, event log, `step`. |
| `js/m4-scenarios.js` | module-4 | Module 4: scenarios A to G and fault injection. |
| `js/m4-render.js` | module-4 | Module 4: map and oscilloscope drawing. |
| `js/m4-hud.js` | module-4 | Module 4: telemetry panels, levels 1 ↔ 2 view, toast. |
| `js/m4-controls.js` | module-4 | Module 4: the visitor's controls, language switch, guide opening. |
| `js/m4-start.js` | module-4 | Module 4: the 50 Hz loop and the start-up of the page. |
| `js/test-hook.js` | test-hook | `window.__sim`, the door reserved for the automated checks. |

## Automated checks

The simulator needs nothing installed. The checks that keep it honest do, for development only: Node.js 24 or later. The page itself still loads no package and still opens from a downloaded copy.

```bash
npm ci                            # installs the test runner (@playwright/test, version pinned)
npx playwright install chromium   # once: downloads the browser used by the tests
npm test                          # runs everything, in about three minutes
```

| Check | What it proves |
|---|---|
| Script syntax | Every script of the page compiles, whichever of its files it sits in; a syntax error is reported with its file and line. |
| Translations | Every text exists in French, English and German: static keys, dynamic messages and, at run time, every key the scenarios display. Terms identical by design are not flagged. |
| Rendering | The page opens in French, English and German without a console error, in the right language, and requests nothing but `index.html`, its own files (each once) and the blocked Google Fonts, and nothing from the analytics service, when opened from disk. |
| Scenarios A to E | Each built-in scenario produces the outcome described above: token revoked and a planned stop (A), on-board perception only (B), LiDAR blinded and radar fallback at 15 km/h or less (C), a lost stop order reported as `ORDER_NOT_APPLIED` against periodic publishing reaching the stop state (D), brake deadline missed from 67 % CAN load and watchdog from 84 % (E). |
| Levels 1 and 2 | Each truck sends one complete setpoint per step with a sequence number rising by one; level 2 rejects each of the five defects, with its code, and never applies a rejected setpoint; a frozen level 1 is detected within the deadline and the truck is stopped at maximum braking in every seed; recovery needs a stable heartbeat and never releases a latched emergency; judging uses level 2's own position. |
| Kernel profile | PREEMPT_RT keeps exactly the previous reaction time and stopping distances; the general-purpose profile adds exactly the latency difference to the reaction time and to the distance the truck really travels; scenarios A to E start from PREEMPT_RT. |
| Layout | At 1600×900, in the three languages, nothing leaves the screen, including with the levels view open and its exchange list full. |
| Physics invariants | Loaded downhill stops later than empty on the flat; mass cancels out when adhesion-limited; a watered road lengthens the empty distance only; no truck ever goes beyond its movement authority; after a network cut every truck stops inside its authority without emergency braking; the emergency state stays latched until it is acknowledged. |
| Repository rules | The disclaimer is still in the README and the page header; no manufacturer is named as the owner of the architecture shown; analytics load only on the live site and every event is prefixed `aht-safety-poc/`; no spec is `DRAFT` or `IN REVIEW` on `main`. |
| Page files | The tags of `index.html`, the files in `js/` and `css/`, the map "Where things are" above, the paths in `CLAUDE.md` and the files git tracks all agree (exact case, no mixed line endings); every file declares one concern in its header, the same as the map; every file carries the current release stamp (`node scripts/stamps.mjs` rewrites them); nothing is loaded from outside the repository except Google Fonts and, on the published site only, GoatCounter; `package.json` has no build script. |
| Start-up guard | On copies of the page: a missing file, a file with a syntax error, a file of another release, a file run twice or a stale style sheet each make the page refuse to start, with a message in French, English and German that names the file; a script tag listed twice runs nothing twice. |
| Downloaded copy and GitHub Pages rehearsal | The files git tracks, copied to another folder, run the simulator with the network blocked. A small local server then serves the page under `/aht-safety-poc/` with exact-case names, only tracked files and the MIME types of Pages: every file answers 200 once and scenario A plays; a wrong-case tag, an absolute `/js/…` path or an untracked file answers 404 and the page refuses to start. The real CDN cache and HTTPS are only checked on the live site. |
| Modules | Each of the four modules is loaded alone in a bare Node context (no document, no window), with test doubles for what it calls upward, and checked on a pinned behaviour: stopping distances 20.2 m and 42.2 m (module 1); the CAN deadline missed from 67 % load and the brake watchdog from 84 %, the ordered level 1 → level 2 link (module 2); the five setpoint rejections with their tolerances and the heartbeat loss (module 3); scenarios F and G choosing the fastest truck and the event log (module 4, its non-drawing half). |
| Node version | `package.json`, its lock file, this README, `CLAUDE.md` and the workflow all announce the same Node version, and the workflow has one job. |
| External links | The links of this README and of the in-app guide. A dead or unreachable link is a warning and never fails the run. The hosts known to refuse automated requests (ISO, USPTO: answer 403) are reported on an information line as unverifiable, to be checked by hand, so that a real dead link stays visible; the list is in `scripts/check-links.mjs`. |

The tests open `index.html` from disk with the network blocked and the random generator seeded, so a run gives the same result every time. `node scripts/compare-traces.mjs` (development only, not part of `npm test`) replays 28 cases of 60 s on `main` and on the working copy, including scenarios F and G under both kernel profiles, and reports the first difference; it reads the reference page whether it is one file or several. `node scripts/compare-hud.mjs` (same standing) does the same for what the HUD shows: scenarios A to G in the three languages on `main` and on the working copy, the serialised DOM of every panel compared every second, both views of the card, every truck. `node scripts/stamps.mjs` rewrites the release stamps after a change to a page file (`--check` only verifies). The same command runs on GitHub (workflow `Checks`, on Node 24) for every push and pull request; the result shows on the commit and the pull request and does not lock the merge. To run a single test: `npx playwright test tests/scenarios.spec.mjs -g "scenario D"`; to run only the browser tests or only the link check: `npm run test:browser`, `npm run test:links`. Values pinned from the model (for example the CAN load boundaries) live in `tests/` and change together with the model.

## Development process

Changes follow a spec-driven workflow based on the [SDD kit](https://github.com/BretzelCoder/sdd-kit): each feature starts with a written specification in `specs/NNN-slug/`, approved before a plan, a task list and the code, on its own branch.

- [`CLAUDE.md`](CLAUDE.md): project rules, conventions and delivery checklist.
- [`docs/constitution.md`](docs/constitution.md): non-negotiable principles.
- [`docs/architecture-decisions.md`](docs/architecture-decisions.md): architecture decision records.
- [`docs/continuous-improvement.md`](docs/continuous-improvement.md): retrospectives and action register.

## Limitations

- Perfect path following (no lateral Ackermann control); reversing manoeuvres at the shovel are not simulated.
- Perception without false positives; constant-velocity prediction over 6 s; a single forward radar of ±18°.
- Generic, plausible orders of magnitude (160 → 400 t, 1.15 MN braking force, 2.6 MW traction, 2 % rolling resistance). They do not describe any specific truck.
- CAN response time approximated by `C + U·20 ms / (1 − U)` for synchronised bursty traffic; DDS RELIABLE retransmits every 30 ms.
- Level 2's measurements (position, speed, brakes) are exact copies of the simulated state, with no noise and no failure. Level 2 never fails and its two channels are not simulated: they only appear in the architecture diagram.
- The checksum of the setpoints is a home-made calculation, not a real CRC nor a standardised end-to-end protocol. Sensor diagnostics reach level 2 without going through level 1.
- The two kernel profiles are two illustrative bounds on the computing time, not measurements of a real kernel. Only the difference from PREEMPT_RT is simulated, as a delay on the outputs of level 1; the computing time itself is a term of the `t_lat` budget.
- The architecture shown (software stack with a real-time or standard Linux variant, safety microcontroller) is illustrative. It is not the description of any manufacturer's real system.

## References

- IEC 61508 (functional safety), ISO 13849 (safety-related parts of control systems), ISO 19014 (earth-moving machinery functional safety), ISO 17757 (autonomous machine system safety). They are cited as reference frameworks: the simulator claims no conformity with any of them.
- [ISO 23725:2024](https://www.iso.org/standard/76769.html), autonomous system and fleet management system interoperability
- [ISO 21815-1:2022](https://www.iso.org/standard/77302.html), earth-moving machinery collision warning and avoidance
- [US patent 10140871](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10140871), travel-permitted zones set by the fleet operations server
- [US patent 9672743](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/9672743), stopping within the permitted section on communication loss
- [WorkSafe WA, Mines Safety Significant Incident Report No. 286](https://worksafe.wa.gov.au/publications/mines-safety-significant-incident-report-no-286-near-miss-following-unplanned-movement), unplanned movement of autonomous haul trucks

## Disclaimer

This is an educational model. It is not a safety tool, it has not been validated against any standard, and it is not affiliated with or endorsed by any equipment manufacturer or mining company. Do not use it to design or assess a real system.

Developed with the assistance of Claude (Anthropic).

## License

[MIT](LICENSE) © 2026 Jean-Luc Rominger
