# Spec 002 — Two-level architecture: autonomy proposes, safety disposes

> Status: APPROVED
> Created: 2026-11-15 · Approved: 2026-11-15
> Amended 2026-11-15 at plan approval, validated by the owner: S6 and AC-7 say that the verdict uses level 2's measured position, not its speed.
> Amended 2026-11-15, after delivery, on the owner's request: the deployment view names no Linux distribution and no build system (no Debian, no Yocto): level 1 shows a "Linux distribution" layer with a real-time or standard variant, like the kernel profile (S16, AC-16, AC-18, section 5); and every tab of the guide has the same window size (new S21, AC-23).
> Input: owner brief "Brief VS Code – Évolutions aht-safety-poc architecture à deux niveaux" (attached to the `/specify` request; not stored in the repository). No `docs/brainstorm/` note exists for this topic.

## 1. Problem / Why
The simulator already teaches the "doer / checker" principle in words: the guide says ROS 2 / DDS do not carry the SIL, that the planner avoids the zones and the supervisor checks them. But the picture is implicit. The planner and the supervisor are one undivided block on screen, the planner's output goes straight to the motion controller, and the visitor never sees the sentence that matters most for an engineer or a decision-maker: **the autonomy computer is not trusted; the safety controller decides.**

Three consequences today:
- No scenario shows what happens when the autonomy computer itself fails (it freezes, or sends nonsense). Every existing fault hits a sensor, a link or the bus; none hits the "brain".
- The reaction-time budget is a fixed list of terms (perception, computing, DDS, CAN, actuator). A visitor cannot see what a non-real-time operating system would cost in stopping distance, which is the usual reason to choose a real-time kernel.
- Nothing shows what the two computers are made of, so "independent" stays abstract.

This spec makes the two-level architecture visible, testable and honest about its assumptions. It is requested by the owner as one piece of work in four parts, in this order of value: (1) heartbeat loss and inconsistent setpoints, (2) a "two computers" view, (3) a kernel latency profile, (4) a deployment view.

## 2. Users
- **An engineer or a student** discovering autonomous haulage safety: wants to see, in a few clicks, why a failure of the autonomy software does not become an accident.
- **A decision-maker** (mine operator, integrator, buyer): wants the architecture principle and the cost of choosing a non-real-time platform, without reading standards.
- **The owner and contributors**, who must keep the page honest (teaching proof of concept, not a safety tool, not a description of any manufacturer's real system) and keep the checks green.

## 3. Expected behaviour (WHAT, not HOW)
Terms: **level 1** = the autonomy computer (perception, planning, execution of the FMS movement authority). **Level 2** = the independent safety controller, already present as the supervisor. The architecture shown is an illustrative one.

### Part 1 — Heartbeat loss and inconsistent setpoints
- **S1 — Setpoints cross a visible boundary.** As a visitor, when a truck runs normally, then level 1 sends level 2 a stream of setpoints, each carrying a speed demand, a timestamp, a sequence counter and an integrity check, and level 2 answers each with a verdict (accepted or rejected, with the reason). The truck only ever follows what level 2 has accepted.
- **S2 — Nothing changes for a healthy truck.** As a visitor, when no fault is injected and the default settings are kept, then scenarios A to E and every pinned value (stopping distances, CAN and DDS thresholds) behave exactly as before this spec.
- **S3 — Scenario F: heartbeat lost.** As a visitor, when I make level 1 freeze (it stops emitting), then level 2 notices the silence by itself once the heartbeat deadline is exceeded, reports it with its own code, and brings the truck to a controlled stop at maximum braking, without any action from level 1. The delay before detection and the distance travelled from the freeze to standstill are shown, computed by the model.
- **S4 — Recovery.** As a visitor, when level 1 starts emitting again, then level 2 keeps the stop in force until the heartbeat has been healthy for a stated stable duration, then releases it and the truck may move again. If the heartbeat is lost again before that duration is over, the truck stays stopped. This stop is not latched, unlike the emergency brake.
- **S5 — Scenario G: inconsistent setpoint.** As a visitor, when I make level 1 send an inconsistent setpoint and choose its defect, then level 2 rejects it, names the defect in its verdict and in the event log, and the setpoint never reaches the actuators. The four defects are:
  - **overspeed**: a speed demand above the limit of the road section where the truck is;
  - **beyond authority**: a demand that would take the truck past the end of the movement authority granted by the FMS;
  - **stale or replayed**: a timestamp too old, or a sequence counter that does not strictly increase;
  - **invalid integrity**: an integrity check that does not match the content.
- **S6 — Level 2 checks with its own measurements.** As a visitor, when a setpoint is judged, then the verdict is computed from level 2's own measured position, from the timestamps, and from the authority and the section limit it holds, never from values asserted by level 1. Level 2's measured speed and brake state are shown next to the verdict and do not cause rejections. The same setpoint can therefore be accepted at one place and rejected at another. *(Amended 2026-11-15 at plan approval, owner decision: speed does not cause rejections.)*
- **S7 — Isolated versus persistent rejection.** As a visitor, when only one setpoint is rejected, then the truck keeps the last accepted setpoint and carries on safely; when rejections continue beyond a stated bound, then level 2 treats level 1 as untrustworthy and brings the truck to the same controlled stop as in S3.

### Part 2 — "Two computers" view
- **S8 — Two blocks, readable exchanges.** As a visitor, when I open the architecture view, then I see two visually distinct blocks, one for level 1 (autonomy) and one for level 2 (safety), each with its status (running, silent, in fault), and between them the latest setpoints with their fields (speed demand, timestamp, sequence counter, integrity result) and the verdict of each.
- **S9 — Follows the selected truck.** As a visitor, when I select another truck, then the view shows that truck's two levels and exchanges.
- **S10 — Level 2's own measures are visible.** As a visitor, I see next to the verdicts the measurements level 2 used (speed, position, brake state), so I can tell them apart from what level 1 claims.
- **S11 — Three languages, history included.** As a visitor, when I switch language, then the view and the messages already shown re-translate without restarting the simulation.

### Part 3 — Kernel latency profile
- **S12 — Two profiles.** As a visitor, I can choose between a "general-purpose kernel" profile and a "PREEMPT_RT" profile for the autonomy computer. Each profile has a worst-case computing latency, a named model parameter, presented in the interface and in the guide as **illustrative**. PREEMPT_RT is the default and reproduces today's latency budget exactly.
- **S13 — Observable effect on the braking envelope.** As a visitor, when I switch to the general-purpose profile, then the reaction time `t_lat` shown, the `d_stop` calculation, the red stop zone and the amber caution zone grow at once by the model's computed amount, and shrink back when I return to PREEMPT_RT. The breakdown of `t_lat` shows which term changed.
- **S14 — The truck really needs that distance.** As a visitor, when I make a truck brake from 40 km/h, then the distance it actually travels differs between the two profiles by the speed multiplied by the latency difference, empty and loaded.
- **S12b — Scenarios start from the default profile.** As a visitor, when I launch scenario A, B, C, D or E, or press the simulation reset, then the profile returns to PREEMPT_RT and a message on screen says so, so that these scenarios always give the outcome the README and the guide promise. Scenarios F and G keep the profile I have chosen, so I can compare the two profiles on a failing autonomy computer. Outside scenarios, the profile stays as I set it.
- **S15 — The profile alone breaks nothing.** As a visitor, when I switch profile, then no heartbeat loss and no rejected setpoint appears because of the switch alone: each profile's worst-case latency stays inside the heartbeat deadline.

### Part 4 — Deployment view
- **S16 — Software stack of level 1.** As a visitor, I can open a deployment view showing level 1 as layers: hardware, kernel (real-time PREEMPT_RT or general-purpose), Linux distribution (real-time or standard variant), middleware (DDS / ROS 2), applications. The kernel and the distribution are shown in the same two variants as the kernel profile of the configuration card, so the diagram and the configuration agree. No distribution and no build system is named. Nothing claims which choice a real project made. *(Amended 2026-11-15, owner request: Debian and the Yocto option removed.)*
- **S17 — Level 2 hardware and software.** The same view shows level 2 as a safety microcontroller running a certifiable RTOS or bare-metal code, with two channels.
- **S18 — Reference standards without conformity.** The view and the guide name IEC 61508, ISO 13849 and ISO 17757 as reference frameworks and say the simulator does not claim conformity with any of them.

### Across the parts
- **S19 — Honest framing.** Every new text states or keeps visible that the architecture is illustrative, is not a description of any manufacturer's real system, and that the simulator is not a safety tool. The guide's "Limitations and sources" tab and the README "Limitations" section list every simplification this spec adds (see section 9).
- **S21 — Guide tabs of one size.** As a visitor, when I move between the tabs of the guide, then the window keeps the same width and the same height, whatever the length of the tab; a longer tab scrolls inside the window and the header with the tabs stays in place. The text of every tab fills the width of the window. *(Added 2026-11-15, owner request.)*
- **S20 — Same rules as the rest of the page.** Every new text exists in French, English and German; new log entries and verdict reasons are stored as keyed messages and translated at display time; new codes are never translated.

## 4. Edge cases and errors
- **Late but alive.** A heartbeat or setpoint that arrives late but inside the deadline is accepted and never counts as a loss. In both profiles, a run with no injected fault shows no loss and no rejection.
- **Already stopped, loading or dumping.** Level 1 freezing while the truck is already stopped (loading, dumping, waiting for a token) is still detected and reported, and never lowers a more severe state already in force.
- **Several causes at once.** A heartbeat loss together with another existing fault (for example LiDAR lost, CAN deadline missed): the most severe state wins, as today; the log keeps one line per cause, with the existing "one cause per brake fault" rule untouched.
- **Emergency latched.** A recovered heartbeat never releases a latched emergency brake.
- **The truck is moving fast, setpoint frozen.** Between the freeze and the detection, the truck follows the last accepted setpoint (level 2 cannot know sooner). That distance is part of what S3 shows; it is not hidden.
- **Restart of level 1.** After a freeze and recovery, level 1's sequence counter may restart. A recovered level 1 must not be rejected as a replay by mistake, and a real replay must still be rejected.
- **Defect injected at an awkward moment.** A defective setpoint injected while the truck is near the end of its authority, in a dust cloud, or at the start of a stop must still be rejected and never applied.
- **Deterministic by construction.** The freeze and the four defects are injected by the visitor at a chosen moment, with no random draw, so the outcome of scenarios F and G is the same at every run. Traffic around the truck stays random as today, so checks run over many seeds (scenario D's lesson, spec 001).
- **Several trucks.** Each truck has its own level 1 and level 2. A fault injected on one truck does not stop the others by itself; the existing following and token behaviours still apply to them.
- **No network, no fonts.** The view needs nothing from the network; with fonts and analytics unreachable nothing counts as an error (spec 001, "No network").
- **Existing checks.** The existing 135 tests stay green without being bent (CLAUDE.md, "The test is the judge"). If a scenario test fails because of this work, the spec is amended first.

## 5. Out of scope (explicit)
- Measuring or modelling a real Linux kernel (scheduling, cyclictest histograms, sampled random jitter). The profiles are two worst-case figures; sampled jitter was considered and set aside by the owner.
- Sensor noise or faults on level 2's own measurements. They are exact copies of the simulated state, stated as a limitation; the existing GNSS, LiDAR and radar faults keep their meaning.
- Failure of level 2 itself, dual-channel comparison, lockstep behaviour: shown in the deployment view only, not simulated. The simulator assumes level 2 works.
- A real integrity code, real message encoding or a real end-to-end protection profile. The integrity check is modelled as correct or incorrect.
- Naming, choosing or describing a particular Linux distribution or build system, building or measuring an image, installing anything.
- An interactive deployment diagram (zoom, drag, drill-down): a static, translated diagram is enough.
- Any change to scenarios A to E, to the FMS, to the CAN or DDS models, to the physics, or to analytics beyond naming the new scenarios in the existing "scenario launched" event.
- Naming any equipment manufacturer as the owner of the architecture shown.
- Changing the repository's automated-check framework, the languages offered, or the hosting.
- Visitor-adjustable latency values (sliders) and mobile-specific layouts: not required here. Decided 2026-11-15 (section 9).

## 6. Acceptance criteria (testable)
Every criterion that says "always" is checked over at least 40 seeds and 60 simulated seconds, at the model's own step, with the model's own "stopped" threshold (under 0.3 m/s).

**Part 1**
- [x] AC-1 — With default settings, scenarios A to E and the pinned values of `tests/helpers/physique.mjs` and `tests/scenarios.spec.mjs` are unchanged, and the existing suite passes with no test modified except to add the new fields' presence. *(evidence: tasks.md, "Trace comparison" (T-03, final run at T-23) and the unchanged existing suite)*
- [x] AC-2 — In normal operation (no fault, default profile) on all three trucks, no setpoint is rejected and no heartbeat loss is reported; every accepted setpoint carries a timestamp, a sequence counter and an integrity result, and the counter increases by exactly one each time. *(evidence: tasks.md, "Setpoint stream" (T-04) and "Nominal runs, both profiles" (T-08))*
- [x] AC-3 — Scenario F, in every seed: level 2 reports the heartbeat-loss code within the deadline plus one supervisor step after the freeze; the state reaches `CONTROLLED_STOP` of the maximum-braking kind; the truck stops (under 0.3 m/s); no collision is caused by the freeze itself; level 2 acted without any message from level 1. *(evidence: tasks.md, "Heartbeat loss and restart" (T-09) and "Scenarios F and G, 40 seeds" (T-12))*
- [x] AC-4 — Scenario F shows the detection delay and the freeze-to-standstill distance; both equal the model's own measurement of the same quantities within a tolerance pinned at `/plan`. *(evidence: tasks.md, "Heartbeat loss and restart" (T-09))*
- [x] AC-5 — Recovery: the stop is released only after the stable duration; a second freeze before that duration keeps the truck stopped; a recovered level 1 is not rejected as a replay; a latched emergency is not released by recovery. *(evidence: tasks.md, "Heartbeat loss and restart" (T-09))*
- [x] AC-6 — Scenario G, for each of the four defects, in every seed and at least at three injection moments (cruising, near the end of the authority, during a stop): the setpoint is rejected, the verdict and the log name the right defect, and the truck's speed never exceeds the section limit nor its position the authority end because of it. *(evidence: tasks.md, "Protocol checks" (T-06), "Content checks and own position" (T-07), "Scenarios F and G, 40 seeds" (T-12))*
- [x] AC-7 — For one identical setpoint, the verdict differs between two truck positions when the supervisor's measured position differs (own-measurement proof, S6), and the supervisor's verdict does not change when only the values asserted by level 1 are altered, the setpoint's own fields being valid. *(evidence: tasks.md, "Content checks and own position" (T-07))*
- [x] AC-8 — One isolated rejected setpoint does not stop the truck; a run of consecutive rejections longer than the stated bound ends in the same safe stop as AC-3. *(evidence: tasks.md, "Persistent rejection" (T-10))*

**Part 2**
- [x] AC-9 — The architecture view shows two distinct, labelled blocks with a status each, and at least the latest N exchanges (N pinned at `/plan`) with speed demand, timestamp, sequence, integrity result and verdict, for the selected truck; selecting another truck changes the content. *(evidence: tasks.md, "Pane blocks and exchanges" (T-15, T-16))*
- [x] AC-10 — The view displays level 2's own speed, position and brake state; opening it in French, English and German produces no console error and no key missing in any language; a language switch re-translates the exchanges already listed. *(evidence: tasks.md, "Pane blocks and exchanges" (T-15, T-16) and "Runtime translations" (T-19))*

**Part 3**
- [x] AC-11 — With the default profile, `t_lat` and the stopping distances at 40 km/h are exactly today's (20.2 m empty, 42.2 m loaded on the pinned test cases). *(evidence: tasks.md, "Profile values and FIFO" (T-05))*
- [x] AC-12 — With the general-purpose profile, `t_lat` increases by exactly the difference between the two profiles' latencies, and `d_stop` at 40 km/h increases by speed times that difference, empty and loaded; the new pinned values are written into the helpers and the tests in the same spec. *(evidence: tasks.md, "Profile values and FIFO" (T-05))*
- [x] AC-13 — A braking test from 40 km/h gives, for each profile, a travelled distance that differs from the other profile's by speed times the latency difference, within a tolerance pinned at `/plan`. *(evidence: tasks.md, "Sudden obstacle" (T-13))*
- [x] AC-14 — In both profiles, without any injected fault, no heartbeat loss and no rejection appears, and the switch itself triggers none. *(evidence: tasks.md, "Nominal runs, both profiles" (T-08))*
- [x] AC-15 — The interface and the guide present both latency values as illustrative; the profile names and values are model parameters, not hard-coded displayed numbers (CLAUDE.md, "Every number on screen is computed by the model"). *(evidence: tasks.md, "No hard-coded latency" (T-17))*
- [x] AC-22 — With the general-purpose profile selected, launching each of scenarios A to E (and pressing reset) returns the profile to PREEMPT_RT, shows the message, and gives the pinned outcome of AC-1; launching F or G keeps the selected profile. *(evidence: tasks.md, "Profile reset at scenario launch" (T-11))*
- [ ] AC-23 — In French, English and German, at 1600×900 and at 1920×1080, the window of the guide has exactly the same width and height on each of its tabs, the header with the tabs does not move, and a tab longer than the window scrolls inside it. *(evidence: tasks.md, "Guide window size" (T-25))*

**Part 4**
- [x] AC-16 — The deployment view lists, in the three languages, the five layers of level 1 (applications, middleware DDS / ROS 2, Linux distribution with its real-time or standard variant, kernel PREEMPT_RT or general-purpose, hardware) and the elements of level 2, names no distribution and no build system, makes no claim about a real choice, and names IEC 61508, ISO 13849 and ISO 17757 with a non-conformity statement. *(evidence: tasks.md, "Deployment view" (T-18) and its amendment (T-25))*

**Across the parts**
- [x] AC-17 — Every new `MSG` triplet has three entries and every new `data-i18n*` key exists in English and German (the existing translation checks enforce it at run time in the three languages). *(evidence: tasks.md, "Runtime translations" (T-19))*
- [x] AC-18 — No manufacturer's name appears in the new texts as the owner of the architecture shown, and neither `Yocto` nor `Debian` appears in the page or the README; a check fails if `Liebherr`, `Yocto` or `Debian` appears in `index.html` or in the README (the other manufacturer names already present in the sources are untouched). *(evidence: tasks.md, "No `Liebherr`" (T-02) and its amendment (T-25))*
- [x] AC-19 — The guide ("Limitations and sources" tab) and the README ("Limitations" and the scenario and control tables) are updated in the three languages, and `docs/capture.png` is regenerated (English interface, 1600×900). *(evidence: tasks.md, "Guide text" (T-20), README (T-21), screenshot (T-22))*
- [x] AC-20 — Each new check is listed in the evidence table of `tasks.md` next to its proof of failure (negative test or recorded deliberate breakage); a check with no row is not delivered. *(evidence: tasks.md, the Evidence table of tasks.md, every check with its proof of failure)*
- [x] AC-21 — `npm test` is green locally and on GitHub for Node 22 and Node 24, within the existing 5-minute budget. *(evidence: tasks.md, "Runtime of the suite" (T-23): `Checks` run 43739397872, Node 22 in 1 min 42 s, Node 24 in 1 min 14 s)*

## 7. Open questions
None blocking. The seven points raised while drafting were settled by the owner on 2026-11-15 (see section 9). Two were delegated to the plan by the owner on 2026-11-15 and are decided in `plan.md`, for validation with it:
- *Delegated to the plan:* the pinned quantities: heartbeat period and deadline, stable duration before release, bound of consecutive rejections (S7), size N of the exchange list (AC-9), the two latency worst cases (S12) and the tolerances of AC-4 and AC-13. They are taken from the model at `/plan`, as spec 001 did, with a heartbeat deadline of the same order as the existing safety timeouts (100 ms Liveliness, 100 ms brake watchdog) and larger than the general-purpose profile's worst case (S15).
- *Delegated to the plan:* where the architecture view and the deployment view live (main-screen panel, overlay or guide tab). The spec only requires that both are reachable in one or two clicks from the main page and do not hide the simulation's essential panels.

## 8. Digital sobriety
- **Network:** no new request. The page stays one file; no image, font or script is added. The deployment diagram is drawn with what the page already has.
- **Compute:** one more message and one more verdict per truck per supervisor step, and a small list kept in memory; the 50 Hz physics step and the render loop budget must not visibly degrade. Kept to the latest N exchanges rather than a growing history.
- **Storage:** nothing stored beyond what the page already keeps in the browser (language choice); the profile is not persisted.
- **Dependencies:** none (ADR-1). Lighter alternative considered for the "two computers" view: text-only listing without a diagram. Rejected because the point of the spec is that the two levels are identifiable at a glance.
- **Checks:** the new tests run on the existing two-job matrix; the 40-seed scenarios add runtime, to be kept inside the 5-minute budget (AC-21).

## 9. Decisions
Owner decisions (2026-11-15), taken during `/specify`:
- One spec covering the four parts of the brief, built in this order: heartbeat loss and inconsistent setpoints, "two computers" view, latency profile, deployment view.
- Latency profiles act as a **deterministic worst case**, not sampled jitter; PREEMPT_RT is the default and equals today's values.
- Heartbeat loss leads to a **controlled stop at maximum braking, not latched, with resume possible** (detail of the resume: question 1).
- All four defects are in scope for rejection: overspeed, beyond authority, stale or replayed, invalid integrity.

Points proposed in the draft and validated by the owner the same day:
- Resume after a heartbeat loss is automatic (confirmed again by the owner at `/plan`, 2026-11-15) once the heartbeat has been stable for the stated duration (S4); the guide explains why this stop is not latched, unlike the emergency brake, which keeps its acknowledgement.
- Latency values are two named model parameters, shown as illustrative and changed by the maintainer in the code; no visitor sliders.
- Launching scenario A to E, or pressing reset, returns the profile to PREEMPT_RT with an on-screen message; scenarios F and G and free exploration keep the visitor's choice (S12b, AC-22).
- The brake state is shown among level 2's own measurements but is not a fifth cause of rejection.
- No manufacturer is named in the app; the brief's remark on Yocto is not carried over (S19, AC-18). Amended 2026-11-15 on the owner's request: Debian and Yocto are not named either; the diagram says "Linux distribution" with a real-time or standard variant, as in the configuration.
- The quantities of section 7 are pinned at `/plan`, and the placement of the views is decided at `/plan`.
- Spec approved on 2026-11-15.

`CLAUDE.md` checks:
- **Spec before code** — applies: this spec, then plan, tasks and `/implement`, on branch `002-two-level-architecture`.
- **Every number on screen is computed by the model** — applies: detection delay, freeze-to-standstill distance, `t_lat`, `d_stop` and the profile latencies come from model parameters (AC-4, AC-12, AC-15). Each simplification is added to the guide's "Limitations and sources" tab and to the README "Limitations": level 2's measurements are exact, the integrity check is a flag, the profiles are two worst cases, level 2 never fails.
- **Three languages, never translated** — applies (S20, AC-17). Never translated: the new supervisor states if any, the new fault and log codes, `PREEMPT_RT`, `DDS`, `ROS 2`, `RTOS`, standard references. Translated: the block names, the profile labels, the verdict reasons, the deployment view text. Home-made identifiers go through `vid()` and `codeName()`.
- **British English** — applies to new English text in the UI and the README.
- **Analytics** — applies as a subject: the new scenarios use the existing "scenario launched" event under the `aht-safety-poc/` prefix; nothing typed or personal is sent; no new event kind.
- **Languages of the repository** — applies: code comments in French, README, commit messages and ADRs in English.
- **Documentation follows the code** — applies: README tables, in-app guide in all three languages, `docs/capture.png` (AC-19).
- **The test is the judge** — applies: pinned values that move (AC-12) change in this same spec; no existing test loosened.
- **Every new check proves it can fail** — applies: AC-20.
- **Re-measure before declaring a gap** — applies to any suspected gap during `/implement`.
- **Guardrails** — applies: disclaimer kept in README and `index.html` header (S19); no force-push on `main`; a possible ADR amendment (the `EmbeddedCommsBus` and `AutonomyAndSafetyCore` split) is decided at `/plan`.
- **Delivery checklist** — applies in full.
- **ADR-1, ADR-2, ADR-3** — respected: one file, no package for the page, translation scheme and analytics unchanged.
- **Constitution, principle 8 (teaching honesty)** — applies: S19.

## 10. Delivery and acceptance
- Owner: validate the plan, which will pin the quantities of section 7 and decide the placement of the views.
- Owner: on the pull request, play scenarios F and G in the three languages, and switch the latency profile at 40 km/h, to confirm the teaching message is clear.
- Owner: read the new guide text and the deployment view for any sentence that sounds like a description of a real manufacturer's system.
- Pull request and merge: only on the owner's explicit request.
- After merge: check the live page on GitHub Pages (new views and scenarios present, analytics snippet still there).
