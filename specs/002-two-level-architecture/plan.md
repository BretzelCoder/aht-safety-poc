# Plan 002 — Two-level architecture: autonomy proposes, safety disposes

> Spec: `specs/002-two-level-architecture/spec.md` (status APPROVED on 2026-11-15)
> Plan status: APPROVED · Approved: 2026-11-15
>
> Owner decisions at approval (2026-11-15):
> 1. Only the difference between the profile and PREEMPT_RT is simulated as a delay (section 3.4): approved, stated in the limitations.
> 2. Level 2's measured speed does not cause rejections; the verdict uses its measured position (and the timestamps); speed and brake state are displayed. Spec S6 amended accordingly.
> 3. Placement approved (section 5) **on condition that everything stays on screen**: at 1600×900 in the full-screen layout, no existing panel is pushed out of view or hidden by the new card, the second tab or the extra formula line. The owner also checks it visually before the pull request.
> 4. Five defect codes for the four classes: approved.
> 5. Test runtime: approved, to be watched (measured as soon as the first long tests exist, recorded in `tasks.md`).
> The proposed values of section 2 (50 / 250 ms, 300 ms, 250 ms, 10 rejections, 1 s, N = 5) are approved as they stand.

## 1. Summary
Everything stays in `index.html` (ADR-1). Each truck gets an explicit **level 1** (the autonomy computer: its existing perception results and planner) and a **level 2** gate in front of the motion controller (the existing supervisor, which now also checks setpoints). Level 1 sends two things to level 2 through a small in-order link: an **obstacle report** (the output of the existing `obstacleDistance`) and a **setpoint** (the output of the existing `planSpeed`, plus a goal distance, a session, a sequence counter, a timestamp and a checksum). Level 2 checks each setpoint against its own position history and its own copy of the FMS authority, accepts or rejects it, and the controller only ever follows the last accepted setpoint. Level 2 also watches the arrival of valid setpoints as a heartbeat: silence or a run of rejections becomes a supervisor cause that brings the truck to a controlled stop at maximum braking through the existing state machine and DDS chain.

The kernel profile changes one term of the reaction-time budget (computing latency: 50 ms for PREEMPT_RT, today's value; 250 ms for the general-purpose kernel, illustrative) and delays everything level 1 sends by the **difference** between the selected profile and PREEMPT_RT. With PREEMPT_RT that difference is zero and the new code draws no random number, so every seeded run is step-for-step identical to today's (S2). Two new scenarios (F: level 1 freezes; G: level 1 sends a defective setpoint), a new "Autonomy computer" card, a second tab on the oscilloscope card ("Levels 1 ↔ 2") and a new guide tab ("Architecture", the deployment view) make it visible.

## 2. Requirement traceability
| Requirement (spec) | Technical answer (this plan) |
|---|---|
| S1 | Per truck, every physics step (50 Hz, 20 ms): `l1Emit` builds a setpoint `{session, seq, ts, vDemand, dGoal, sClaim, vClaim, sum}` from the planner (`vDemand` = `planSpeed`, `dGoal` = authority end − position as level 1 sees it, claims = level 1's own position and speed), pushes it on the level 1 link; `l2Receive` delivers what is due, checks it (section 3.3) and records the verdict. `control()` reads `T.l2.vAccepted` instead of `T.vPlan`. |
| S2 / AC-1 | With PREEMPT_RT the link delay is 0 and the setpoint and obstacle report are delivered in the step they are produced, in the same order as today's calls; `vAccepted` equals today's `vPlan` and level 2 uses today's `dObs`. The new code calls no `Math.random`, so the seeded draws are unchanged. Proof: the existing suite unchanged, plus a recorded one-time comparison of 60 s position traces (10 seeds, three trucks) between `main` and the branch: identical. |
| S3 / AC-3, AC-4 | Scenario F: `clearAll()`, then the moving truck with the highest speed is selected and its level 1 frozen (`T.l1.frozen = true`, freeze time and position stored). A frozen level 1 sends nothing: no setpoint, no obstacle report. New supervisor cause `L1_HEARTBEAT_LOST` (severity 2, stop kind `MAX`) when `now − T.l2.lastValid > P.l1Deadline` (300 ms). The model stores `tFreeze`, `sFreeze`, `tDetect`, `sStill` (first step under 0.3 m/s after detection); the panel shows detection delay = `tDetect − tFreeze` and distance = `sStill − sFreeze`. |
| S4 / AC-5 | Restarting level 1 ("Restart level 1" button, or the F button again) opens a new session: `session + 1`, `seq` from 0. The cause `L1_HEARTBEAT_LOST` stays active until valid setpoints have arrived without a gap longer than the deadline for `P.l1Stable` = 1.0 s; then the existing 1 s state hysteresis (`lowerAt`) applies, as for every cause: release about 2 s after the restart. A new silence before `P.l1Stable` keeps the cause active. Not latched: the `latched` flag is never set by these causes, and a latched emergency is untouched. |
| S5 / AC-6 | Five injectable defects for the four classes of the spec: `OVERSPEED` (`vDemand` = section limit + 15 km/h), `BEYOND_MA` (`dGoal` + 30 m), `STALE` (`ts` − 1 s), `REPLAY` (a copy of a setpoint captured 5 cycles earlier, same session and sequence), `INTEGRITY` (`vDemand` changed after the checksum). Codes: `SETPOINT_OVERSPEED`, `SETPOINT_BEYOND_MA`, `SETPOINT_STALE`, `SETPOINT_SEQUENCE`, `SETPOINT_INTEGRITY` (severity 1, logged through `logEv`). A rejected setpoint never changes `vAccepted`. |
| S6 / AC-7 | Level 2 keeps its own 1 s history of measured position and of the authority it received from the FMS. Overspeed: `vDemand` against the section limit at the truck front measured at `ts` (`vLimitAt`, the reference the planner already respects), tolerance 0.1 m/s. Authority: `s_meas(ts) + dGoal` against `sEnd(ts)`, tolerance 0.1 m. `sClaim` and `vClaim` are displayed and never read by the checks. **Note for the owner**: the four defects only need level 2's position (and the timestamps); speed and brake state are shown next to the verdict, used for the freeze-to-standstill measure, and do not cause rejections (consistent with your decision on the brake state). |
| S7 / AC-8 | `T.l2.rejRun` counts consecutive rejections; at `P.l1RejBound` = 10 (200 ms at 50 Hz) the cause `L1_SETPOINTS_REJECTED` (severity 2, stop kind `MAX`) is raised; it clears like `L1_HEARTBEAT_LOST` (accepted setpoints for `P.l1Stable`). One isolated defect resets the count at the next valid setpoint. Repeat mode: a "Continuous" checkbox makes every setpoint defective. |
| S8 / AC-9 | Second tab on the oscilloscope card: "Levels 1 ↔ 2". Two blocks side by side: level 1 (profile, status RUNNING / FROZEN / DEFECTIVE, session, claims) and level 2 (supervisor state, heartbeat age, own measurements). Below, the latest **N = 5** exchanges (seq, ts, `vDemand`, `dGoal`, checksum ✓/✗, verdict), plus the **3 latest rejections**, kept until replaced so that a rejection stays readable at 50 Hz. Refreshed with the HUD (every 120 ms). Pausing the simulation freezes the list for reading. |
| S9 | The pane reads `sim.trucks[selected]`, like the rest of the HUD. |
| S10 / AC-10 | Level 2 block: position (m along the loop), speed (km/h), brake state (released / service braking / full braking / brake ECU watchdog tripped), from `T.s`, `T.v`, `T.F`, `T.fullBrake`, `T.ecuEmergency`. |
| S11 / AC-10 | Exchanges are stored as data (`{seq, ts, v, d, ok, code}`) and rendered at display time; verdict reasons are `{k, p}` messages; codes never translated. Block names and statuses go through `t()`. |
| S12 | `ENV.kernel` = `'RT'` (default) or `'GP'`; `P.latCpuRT` = 0.05 s (today's `P.latCpu`, renamed) and `P.latCpuGP` = 0.25 s (illustrative, owner may adjust). A select in the "Autonomy computer" card shows both values, read from `P`. |
| S12b / AC-22 | `scenario(code)`: for A to E, if `ENV.kernel !== 'RT'`, set it back, log an `info` line and append one sentence to the launch toast (scenario E's toast gets both sentences). `resetSim()` sets `ENV.kernel = 'RT'`. F and G leave it. |
| S13 / AC-11, AC-12 | `bubble()` uses the selected computing latency in `t_lat`; the stop zone, caution zone, `d_stop` formula and the empty/loaded table already derive from `t_lat`. A new formula line shows the breakdown: `t_lat = perception + computing (profile) + DDS + CAN + actuator`. Pinned values: RT 20.2 m / 42.2 m unchanged; GP expected about 22.4 m / 44.4 m (+0.2 s × 11.1 m/s), measured at `/implement` and added to `ATTENDU`. |
| S14 / AC-13 | Level 1 outputs are delayed by `Δ = latCpu(profile) − latCpuRT`. Level 2 learns of a sudden obstacle Δ later, so the truck travels about `v·Δ` more (2.2 m at 40 km/h). Test: a stationary vehicle placed suddenly in the path of a truck at 40 km/h, empty and loaded, each profile; distance from appearance to standstill; difference = `v·Δ` ± 0.3 m (one step of travel at 40 km/h is 0.22 m). |
| S15 / AC-14 | Link is FIFO (arrival = max(sent + Δ, previous arrival)), so a profile switch never reorders messages. Parameter relations that guarantee S15, checked by a test: `P.l1Deadline` (0.30 s) > period (0.02 s) + Δmax (0.20 s), and `P.l1Stale` (0.25 s) > Δmax. Checks use level 2's history at `ts`, so a delayed setpoint is judged against the authority and position of its own time and an FMS revocation in flight does not cause a rejection. |
| S16, S17, S18 / AC-16 | New guide tab "Architecture" (`data-gtab="archi"`, `data-i18n-html="guide.archi"`): a static diagram in HTML and CSS (stacked boxes, no image). Level 1: hardware, PREEMPT_RT kernel, Debian, DDS / ROS 2, applications; Yocto beside Debian as "option: minimal reproducible image, built-in SBOM", nothing about a real choice. Level 2: safety microcontroller, certifiable RTOS or bare metal, two channels. Standards paragraph: IEC 61508, ISO 13849, ISO 17757 as references, "the simulator claims no conformity". A link button in the "Levels 1 ↔ 2" pane opens the guide on that tab (`openGuide('archi')`, existing). |
| S19 / AC-18, AC-19 | Disclaimer kept. Static check: `Liebherr` absent from `index.html` and `README.md` (negative test on a copy). Guide "Choix de modélisation" and "Limites et sources", README "What you can explore", "Built-in scenarios", "Modelling choices", "Limitations", all updated; screenshot regenerated. |
| S20 / AC-17 | New strings: `MSG` triplets (dynamic) and `data-i18n*` keys with `STATIC.en` / `STATIC.de` (static); the existing static and runtime translation checks cover them once F and G are added to the runtime list of `tests/traductions-execution.spec.mjs`. |
| Edge: late but alive | FIFO + timestamp-referenced checks + parameter relations (S15). Test AC-14 includes profile switches mid-run. |
| Edge: already stopped | The heartbeat cause does not depend on speed; the supervisor keeps the most severe level (existing `sev` logic). Test: freeze during `LOADING`. |
| Edge: several causes | Existing `add()` / `syncCodes()`: one log line per cause, most severe state wins. The `else if` between `DM1_BRAKE_CMD_TIMEOUT` and `CAN_BRAKE_DEADLINE` is not touched. |
| Edge: emergency latched | New causes are severity 2: they never set `latched` and the restart never clears it. Test in AC-5. |
| Edge: frozen setpoint at speed | Between freeze and detection, `vAccepted` keeps its last value and the obstacle report its last content (level 2 is blind as well): stated in the guide; the distance is part of S3's display. |
| Edge: restart of level 1 | Session number: a new session resets level 2's sequence reference. A replay carries the old session and an old sequence: rejected. |
| Edge: awkward moment | AC-6 test injects at cruising, near the end of the authority, and during a stop, in a dust cloud for one seed set. |
| Edge: determinism | Freeze and defects are injected on request, no random draw; the truck chosen by F and G is the fastest moving one (deterministic for a seed). |
| Edge: several trucks | All new state is per truck; only the selected truck is affected by the buttons. |
| Edge: no network | Nothing new loaded; existing offline guarantees. |
| Edge: existing checks | Unchanged tests must stay green; any failure goes back to the spec (CLAUDE.md). |
| AC-2 | Test: 40 seeds × 60 s, RT, no fault: no `SETPOINT_*`, no `L1_*`, sequence +1 at each accepted setpoint of each session. |
| AC-15 | Profile labels and latency values rendered from `P`; static test that no latency number is hard-coded in the new HTML. |
| AC-20, AC-21 | Evidence table in `tasks.md`; duration recorded on GitHub for Node 22 and 24. |

## 3. Architecture

### 3.1 Where the code goes (one file, existing modules)
- **Module 1 (MineWorld & PhysicsEngine)**: new parameters in `P` (`latCpuRT`, `latCpuGP`, `l1Deadline`, `l1Stale`, `l1Stable`, `l1RejBound`, `l1Hist`); `ENV.kernel`. `P.latCpu` is renamed `latCpuRT`; a small `latCpu()` returns the selected one.
- **Module 2 (EmbeddedCommsBus)**: the level 1 → level 2 link (`l1Send`, `l1Due`), FIFO with delay Δ; the checksum function `sumOf(sp)` (a short home-made checksum over the fields, not a real CRC).
- **Module 3 (AutonomyAndSafetyCore)**: `l1Emit(T)` (setpoint and obstacle report, defect injection), `l2Receive(T)` (delivery, checks, verdicts, heartbeat bookkeeping, history), two new causes in `supervise()`, `control()` reads `T.l2.vAccepted`, `supervise()` reads the obstacle report delivered to level 2 (`T.l2.obs`) instead of `T.m.dObs`.
- **Module 4 (FaultInjector & TelemetryHUD)**: scenarios F and G, `clearAll()` and `resetSim()` resets, the "Autonomy computer" card wiring, the "Levels 1 ↔ 2" pane, the `t_lat` breakdown line.

### 3.2 Step order (per truck, changes in bold)
`opsUpdate → canUpdate → perceive → bubble → obstacleDistance → `**`l1Emit(report)`**` → `**`l2Receive`**` → supervise → ddsPublish → mcReceive → planSpeed → `**`l1Emit(setpoint)`**` → `**`l2Receive`**` → control → physics`

With Δ = 0 each item is delivered in the step it is produced, before the call that uses it, which is what keeps S2 exact. The heartbeat is judged in `supervise()` from the previous step's deliveries (lag one step, inside AC-3's "deadline plus one step").

### 3.3 Level 2 checks, in this order (first failure gives the verdict)
1. **Integrity**: `sumOf(sp) !== sp.sum` → `SETPOINT_INTEGRITY`.
2. **Freshness**: `now − ts > P.l1Stale` → `SETPOINT_STALE`.
3. **Sequence**: same session and `seq ≤ last accepted seq` → `SETPOINT_SEQUENCE`; a new session resets the reference.
4. **Overspeed**: `vDemand > vLimitAt(s_meas(ts) + len/2) + 0.1` → `SETPOINT_OVERSPEED`.
5. **Authority**: `s_meas(ts) + dGoal > sEnd(ts) + 0.1` → `SETPOINT_BEYOND_MA`.

Checks 1 to 3 are protocol checks: a setpoint failing them does not count as a heartbeat. Checks 4 and 5 are content checks: level 1 is alive but wrong, so the heartbeat is refreshed and only the rejection run (S7) can stop the truck. Accepted: `vAccepted = vDemand`, `lastValid = now`, `rejRun = 0`.

### 3.4 What the kernel profile delays, and what it does not
Delayed by Δ: what level 1 produces (setpoints, obstacle reports). Not delayed: sensor health (LiDAR, radar, GNSS diagnostics reach level 2 over CAN), the FMS authority, level 2's own measurements, the DDS and CAN chain. The budget term changes by the full profile value; the simulated delay is only the difference from PREEMPT_RT, because today's dynamics do not simulate the perception and computing terms at all (they are budget terms). This is stated in the guide's limitations.

### 3.5 ADRs
ADR-1 (one file, no package for the page, no build), ADR-2 (translation scheme), ADR-3 (analytics): respected, no amendment. The spec allowed an ADR amendment for the module split; none is needed, the split stays inside modules 2 and 3.

## 4. Data model
No storage, no server, no access control. In-memory, per truck:
- `T.l1 = { frozen, session, seq, defect: null | 'OVERSPEED' | 'BEYOND_MA' | 'STALE' | 'REPLAY' | 'INTEGRITY', repeat, captured: [] (last 5 setpoints, for REPLAY), ev: { tFreeze, sFreeze, tDetect, sStill } }`
- `T.l2 = { link: [] (FIFO of {at, kind, payload}), vAccepted, obs: {dObs, obsId, obsPred}, lastValid, stableSince, session, seq, rejRun, hist: [] (1 s of {t, s, sEnd}), ex: [] (5 latest exchanges), rej: [] (3 latest rejections) }`
- `ENV.kernel` (global, not persisted: S12b and section 8 of the spec).

## 5. Interfaces
- **Scenario buttons**: F "Level 1 frozen", G "Defective setpoint" in the existing grid (7 buttons, two columns). Each has a title tooltip, like A to E.
- **New card "Autonomy computer (level 1)"** in the environment strip (fourth card; the strip goes from 3 to 4 columns in the full-screen layout): kernel profile select (values from `P`), "Freeze / Restart level 1" button, defect select (5 entries), "Send one defective setpoint" button, "Continuous" checkbox. Acts on the selected truck, except the profile (global).
- **Oscilloscope card** becomes a two-tab card: "Oscilloscope" | "Levels 1 ↔ 2" (`role="tablist"`). Scenarios F and G switch it to "Levels 1 ↔ 2". The scope canvas is resized when it becomes visible again.
- **Formula box**: one extra line, the `t_lat` breakdown.
- **Guide**: new tab "Architecture"; new items in "Prise en main" (the new card and tab), "Visite guidée" (F and G), "Choix de modélisation" (two levels, why this stop is not latched while the emergency is, the profile as worst case), "Limites et sources" (section 10).
- **Log and reasons**: the seven new codes, never translated; reasons as `{k, p}`.
- **Test hook** `window.__sim` (test-only, documented next to it): adds `PATH` (to place a vehicle on the path in AC-13), and `l1Inject(i, patch)` (sends one setpoint with chosen fields from truck `i`, for AC-7). Nothing else.
- **Analytics**: none new; F and G go through the existing `aht-safety-poc/scenario/<code>` event.

## 6. Test strategy
New files (French names, like the existing ones), all through `openPage` and the seeded `Math.random`:
- `tests/niveaux.spec.mjs` (Part 1): AC-2 (40 seeds × 60 s, all trucks), AC-3 and AC-4 (F on 40 seeds, plus a freeze while loading), AC-5 (restart, second freeze within 1 s, latched emergency untouched, new session accepted, replay rejected), AC-6 (5 defects × 3 moments, 40 seeds, speed never above the limit and position never past the authority), AC-7 (same setpoint at two positions; claims altered, verdict unchanged), AC-8 (one isolated defect vs continuous). Runs step in a tight loop inside `page.evaluate`, no rendering.
- `tests/latence.spec.mjs` (Part 3): AC-11 and AC-12 (pinned RT and GP values in `tests/helpers/physique.mjs`), AC-13 (sudden obstacle, both profiles, empty and loaded), AC-14 (40 seeds × 60 s each profile, with switches at 20 s and 40 s), AC-22 (GP selected, then A to E and reset bring RT back; F and G keep GP), and the parameter-relation check of S15.
- `tests/vues.spec.mjs` (Parts 2 and 4): the layout condition of the plan approval (at 1600×900, full-screen layout, every existing card and the new card inside the viewport, no page scroll, in FR / EN / DE; negative proof: a recorded breakage with an oversized card), AC-9, AC-10 (pane content, truck selection, language switch re-translates the exchanges, no console error in FR / EN / DE), AC-16 (guide tab content: five level 1 layers, Yocto as option, level 2 elements, the three standards and the non-conformity sentence, in each language).
- Extended: `tests/statique.spec.mjs` (AC-18 `Liebherr` check, with its negative test; AC-15 no hard-coded latency number in the new HTML, with its negative test); `tests/traductions-execution.spec.mjs` (F and G in the runtime list, AC-17); `tests/scenarios.spec.mjs` untouched.
- **S2 trace comparison** (AC-1): one-time recorded run, `main` against the branch, 10 seeds × 60 s, positions of the three trucks at every step: identical. Recorded in the evidence table.
- **Proof of failure** for each new check (AC-20): negative tests for the pure checks; recorded deliberate breakages for the browser checks (for example: the controller reads `T.vPlan` again → AC-6 fails; heartbeat cause removed → AC-3 fails; `P.latCpuGP` set to 0.6 s → the S15 relation check fails; FIFO removed → AC-14 fails; reset of the profile removed → AC-22 fails).
- **Budget** (AC-21): about 200 runs of 60 s are added. They run without rendering and in parallel workers; duration measured after the first tests are written. If the budget is threatened, the 40-seed loops are split across workers before any seed count is lowered (lowering it needs a spec amendment).
- Screenshot `docs/capture.png` (English, 1600×900) regenerated at the end.

## 7. Dependencies
None. No new package, no new external resource for the page or the checks.

## 8. Risks and mitigations
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The default behaviour shifts by a step and a scenario outcome changes | Medium | High (S2, pinned outcomes) | Δ = 0 path delivers in the same step and order; no new random draw; trace comparison against `main` before going further (first implementation task). |
| A content check rejects nominal setpoints (planner and check use different references) | Medium | High (AC-2) | Level 2 uses the same section-limit point as the planner and a 0.1 tolerance; AC-2 over 40 seeds is the judge. A real gap goes back to the spec, the tolerance is not widened to pass. |
| In the general-purpose profile a truck drives past its authority (planner reacts Δ later) | Low | High (an invariant the README promises) | Authority invariant run on the AC-14 general-profile runs; if it fails, stop and amend the spec (rule 5). |
| The fourth strip card and the two-tab card push the cockpit beyond 1600×900 | Medium | High (owner's condition of approval) | Compact layout, N = 5; a browser test at 1600×900 checks that every existing panel stays inside the viewport and that the page does not scroll; owner's visual check before the pull request; if needed, the card's defect controls collapse into one row. |
| Exchange list unreadable at 50 Hz | High without mitigation | Medium (S8) | Rejections kept apart (3 latest), pause freezes the list. |
| Hidden scope canvas resized to zero | Medium | Low | Resize scheduled on tab switch; the scope is not drawn while hidden. |
| Test runtime over budget | Medium | Medium (AC-21) | Tight loops without rendering, parallel workers, measured early. |
| "Release about 2 s after restart" (stable duration + existing hysteresis) surprises the visitor | Medium | Low | Stated in the guide and README; the pane shows the time left before release. |
| Visitor reads the profile values as measurements of real systems | Medium | Medium (teaching honesty) | "Illustrative" next to the values, in the guide and in the limitations. |

## 9. Alternatives considered
- **Simulate the full computing latency in both profiles** (not only the difference). More uniform, but changes today's dynamics in the default profile, so S2 and the pinned outcomes would move. Rejected.
- **Delay only the obstacle report, not the setpoints.** Simpler checks, but a computer that is late for perception and on time for planning is not honest. Rejected; the timestamp-referenced checks handle the delay.
- **Level 2 checks against its current measurements with a tolerance proportional to the age.** No history needed, but the tolerance would also hide real defects. Rejected for the 1 s history.
- **A boolean "intact" flag instead of a checksum.** Lighter, allowed by the spec; kept the tiny checksum because "the receiver recomputes and compares" is the point to show, at no visible cost.
- **Setpoint period slower than the physics step (10 or 20 Hz).** More readable list, but changes the default dynamics. Rejected; readability handled by the rejection list and pause.
- **The two-computers view as a new card, an overlay, or a guide tab.** A new side card overflows the cockpit; an overlay hides the map; the guide pauses the simulation. A second tab on the oscilloscope card keeps the layout and runs live. The deployment view, static, fits the guide.
- **Per-truck kernel profile.** Matches the CAN and DDS settings, but the spec speaks of "the autonomy computer" in general and a global switch shows the zones of all trucks changing at once. Rejected.
- **A new ADR for the two-level model.** It is a modelling choice, documented in the README "Modelling choices" and the guide; the ADRs cover platform decisions. Rejected.

## 10. Impact on project rules
- **Spec before code** — applies: spec approved, this plan awaiting approval, branch `002-two-level-architecture`.
- **Every number on screen is computed by the model** — applies: latencies, detection delay, distances, positions, ages and sequence numbers all read from the model or `P`; AC-15 static check.
- **Three languages, French by default** — applies: new static keys in `STATIC.en` / `STATIC.de`, new `MSG` triplets, `{k, p}` storage for log, reasons and exchanges.
- **Never translated** — applies: `L1_HEARTBEAT_LOST`, `L1_SETPOINTS_REJECTED`, `SETPOINT_*`, `PREEMPT_RT`, `Yocto`, `Debian`, `DDS`, `ROS 2`, `RTOS`, `SBOM`, standards, supervisor states. Translated: "level 1 / level 2", block statuses, profile labels ("general-purpose kernel"), defect labels.
- **British English** — applies.
- **Analytics** — applies: no new event, F and G through the existing prefixed event.
- **Languages of the repository** — applies: comments and test files in French, README, commits, plan in English.
- **Documentation follows the code** — applies: README tables and sections, guide in three languages, screenshot.
- **The test is the judge** — applies: `ATTENDU` gains the general-profile values in this spec; nothing loosened.
- **Every new check proves it can fail** — applies: section 6, evidence table.
- **Re-measure before declaring a gap** — applies to any suspected gap (0.02 s step, 0.3 m/s threshold, 40 seeds, 60 s).
- **Guardrails** — applies: disclaimer kept; no force-push on `main`; `.env*` untouched.
- **Delivery checklist** — applies in full.
- **Limitations added** (guide and README): level 1 outputs delayed by the profile difference only; profiles are two illustrative worst cases; level 2's measurements are exact; the checksum is a home-made sum, not a real CRC; level 2 never fails and its two channels are not simulated; sensor diagnostics bypass level 1.
