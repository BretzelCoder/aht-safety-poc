# Continuous improvement: self-critique and "rapport d'étonnement"

A code review judges the deliverable. This ritual judges **the way of working**: what cost a rework, an extra pull request or an owner check, and what was surprising along the way. The goal is to never make the same mistake twice, and to turn every finding into a verifiable action.

## 1. When
- **At the end of every work session that covers a spec**, whatever the step of the cycle.
- Add a journal entry **only if there is something to say**. Otherwise, write "nothing to report" in the closing message.
- **At the start of the next session**, re-read the open actions in the register.

## 2. Two distinct parts
| Part | Question | Angle |
|---|---|---|
| **Self-critique** | What did I do wrong, or too late? | One's own way of working: error, omission, missed check, misleading communication. |
| **Rapport d'étonnement** (astonishment report) | What surprised me in the project or the process? | A fresh eye on what exists: inconsistency, disproportionate cost, surprising rule, tool blind spot. Not necessarily a defect: a question worth asking. |

## 3. Good practices
1. **Factual and dated**, with verifiable references (commit, PR, file:line, task).
2. **Blameless**: look for what made the error possible, not for a culprit.
3. **Root cause**: go back to the cause that, once fixed, prevents recurrence. "I forgot" is not a root cause.
4. **One action per finding that deserves it**: precise, verifiable, with an owner and a trigger. An action without a trigger will not be done.
5. **Close the loop (PDCA)**: an action stays in the register until its effect is observed, then it is closed with date and evidence.
6. **Respect the cycle**: an action that changes a rule (CLAUDE.md, constitution, commands, ADR) is a proposal to the owner, never a silent change.
7. **Short**: three useful findings beat ten anecdotes.

## 4. Action register
Statuses: `OPEN`, `IN PROGRESS`, `CLOSED` (effect observed), `ABANDONED` (reason written).

| # | Origin | Action | Owner | Trigger / deadline | Status |
|---|---|---|---|---|---|
| A-1 | RE-1, spec 001 | Decide whether the hosts that answer 403 to automated requests (`iso.org` always, `image-ppubs.uspto.gov` from GitHub's servers only, 200 from the owner's machine) stay as permanent warnings or go into a commented allow-list in `scripts/check-links.mjs`, so that a real dead link stands out among them. | Owner | Owner decided 2026-11-15: a commented allow-list, the hosts that block robots reported as "unverifiable" (information, not a warning). It changes S11, so it goes through an amendment of spec 001 first (rule 5). At the next spec that touches the link check, or the first time a real dead link is missed among the standing warnings (2 locally, 4 on GitHub). | IN PROGRESS |
| A-2 | T-20, spec 001 | See the `Checks` result appear on the first pull request of spec 001: the `pull_request` trigger is declared but has never been exercised (no pull request exists yet). | Owner | When the owner asks for the pull request of spec 001. Effect observed: pull request #2 opened, `Checks` ran on the `pull_request` event and passed (39 s, run 43721554554), next to the push run (51 s, run 43721550873). | CLOSED 2026-11-15 |
| A-3 | T-17, spec 001 | Repeat `npm test` with the network really off: the offline run was emulated with a dead proxy, not a physical cut. | Owner | Before the pull request of spec 001 is merged. Effect observed: the owner ran `npm test` with the network really off, 130 passed, 10 link warnings `ENOTFOUND`, exit code 0 (evidence in tasks.md, AC-14 row). | CLOSED 2026-11-15 |
| A-4 | SC-2, spec 001 | Proposal to add to the Conventions of CLAUDE.md: before stopping on a suspected gap between a scenario and its spec, re-measure at the model's own step (0.02 s), with its own thresholds (stopped = under 0.3 m/s), and over enough seeds and time (scenario D: 40 seeds, 60 s). | Owner decides, Claude drafts the wording | Before the next `/implement`. Owner approved the wording as drafted; added to the Conventions of CLAUDE.md. | CLOSED 2026-11-15 |
| A-5 | RE-2, spec 001 | Decide whether the guide and the README should state the measured odds of scenario D (stop order lost in 88 % of 40 seeds, collision in 42 %) instead of "a collision can occur". | Owner | At the next spec that touches scenario D or the guide wording. | OPEN |
| A-6 | RE-3, spec 001 | Decide whether the supervisor should keep logging the missed brake deadline once the brake watchdog has tripped (today the deadline branch is an `else if` of the watchdog branch, so only `DM1_BRAKE_CMD_TIMEOUT` shows from 84 % CAN load). Changing it moves the pinned boundaries of scenario E, so it needs its own spec. | Owner | At the next spec that touches the supervisor or the CAN model. | OPEN |
| A-7 | SC-4, spec 001 | Proposal to add to the Delivery checklist of CLAUDE.md: at the last task of a spec, list every check next to its proof of failure (negative test or recorded breakage) before declaring it done. | Owner decides, Claude drafts the wording | Before the next `/implement`. Owner approved; one line added to the Delivery checklist of CLAUDE.md. | CLOSED 2026-11-15 |

## 5. Session journal
Most recent first. Template:

```markdown
### YYYY-MM-DD — Spec NNN (steps covered)

**Self-critique**
- **SC-n — short title.** Fact (references). Impact. Root cause. → action A-x (or "fixed in session").

**Rapport d'étonnement**
- **RE-n — short title.** Finding. Why it is surprising. Proposal. → action A-x (or "for information").

**Follow-up of previous actions**: A-x: status and evidence.
```

### 2026-11-15 — Spec 001 (review of the delivery, T-22 and T-23)

**Self-critique**
- **SC-4 — Five checks were delivered without proof that they could fail.** `/review` found them: scenario B had no recorded breakage, scenario D outcome 2 neither, and it set the publishing mode on the model instead of using the page's selector; the authority and network-cut invariants had no negative test, and the network-cut test compared with the authority at the end of the run, so an authority that kept growing would have passed; `codeName()` fell back silently on the raw code, so deleting the only `code.*` translation broke nothing; the disclaimer check ignored "educational model". Impact: the delivery said "every check proves it can fail" (T-20) and it was not true for these five. Root cause: the evidence table was filled per task from what each task's "Done when" named, and T-20 verified that every row was filled, not that every check had a row. → fixed in session (T-22, 130 tests, breakages in the Evidence table) and → A-7.
- **SC-5 — My first fix of the network-cut assertion was wrong.** I took the authority from trace samples at t ≤ 5.05 s; the cut falls at 5.02 s (the runner starts after a first step), so the sample was one FMS tick too old and the test failed on the real model. Found by running it, not by reading it. Root cause: I assumed the event time was the nominal one. → fixed in session (the authority is read inside the page at the instant of the cut).

**Rapport d'étonnement**
- **RE-4 — The selector's reset of `rxTime` was invisible in scenario D.** At launch the controller had just received a message (`rxTime` equal to `sim.t`), so removing the reset changed nothing there. It only matters after a long quiet spell in BEST_EFFORT, which the scenario never produces. A new test builds that situation on purpose. For information.
- **RE-5 — The slider cannot reach the 100 % loss the tests force.** `rLoss` goes to 60 %; outcome 1 of scenario D forces 100 % on the model to make the outcome certain. Honest, but the visitor cannot reproduce that exact case. For information.

**Decisions of the owner during this review**
- Commit type `ci` accepted (rule 7 of CLAUDE.md and `tasks.md` updated).
- The two Conventions added to CLAUDE.md at T-19 ("The test is the judge", "Every new check proves it can fail") are confirmed.
- Gaps 6, 7 and 10 amended (plan, retrospective actions A-5 and A-6, wording of A-1).

**Follow-up of previous actions**: A-2, A-3, A-4 and A-7 CLOSED the same day (see the register). A-1 IN PROGRESS (decision taken, amendment of S11 to validate), none of their triggers has been reached.

### 2026-11-15 — Spec 001 (specify, plan, tasks, implement T-00 to T-21)

**Self-critique**
- **SC-1 — The first red-CI proof hung instead of failing.** CI run 43711380894 (a syntax error on a throwaway branch) was cancelled at the 10-minute job limit instead of turning red: every browser test waited its 30 s default and there are about 100 of them. Impact: one extra push and a second throwaway branch. Found only by actually pushing a broken commit, which is what T-18 existed to do. Root cause: the plan's risk table covered seeds, flakiness and pinned thresholds but not "the page does not start", and `openPage` used the default wait. → fixed in session (commit `4418461`: 8 s start-up deadline that names the page's error, run stopped after 10 failures, file-only checks in a first `static` project; the broken page now fails in 21 s locally and 76 s on GitHub); rule recorded in the Conventions of CLAUDE.md (T-19).
- **SC-2 — Twice, a small sample made me misread the model.** Scenario A looked like "the truck never stops" in a 0.5 s trace (3.1 km/h), while it stops at 0.097 m/s for 0.76 s just before the token is released (T-10); I was about to propose a spec amendment on a gap that did not exist. Scenario D looked harmless over 6 seeds and 30 s, while over 40 seeds and 60 s a collision happens in 17 runs (42 %). Impact: none, both caught before they became a decision. Root cause: I measured coarser, shorter or fewer than the phenomenon needs. → fixed in session (trace step `pasTrace`, "stopped" = the model's own 0.3 m/s) and → A-4.
- **SC-3 — The first link check reported three false positives.** It collected every URL of the page (font origins, preconnect hints, the GoatCounter endpoint) while S11 is about the links a reader follows. Caught by reading the real report before committing T-16. Root cause: I wrote the extraction from the plan's shorthand ("href attributes") without listing which hrefs the page actually contains. → fixed in session (anchors only).

**Rapport d'étonnement**
- **RE-1 — Four of the ten checked links warn in CI, always.** `iso.org` answers 403 to every automated request, and `image-ppubs.uspto.gov` answers 200 from the owner's machine but 403 from GitHub's servers: the same URL answers differently depending on who asks, so a link check cannot confirm these sources. Proposal: keep the warnings, or keep a commented allow-list so a new real dead link is not drowned. → A-1.
- **RE-2 — The scenario D promise holds, and it is odds, not a possibility.** Over 40 seeds (60 s after launch) the stop order is lost in 35 runs (88 %) and a collision happens in 17 (42 %); in 5 runs nothing is lost. The README's "a collision can occur" is closer to "about two runs in five". The suite forces both outcomes to stay reproducible and does not assert these odds. → A-5.
- **RE-3 — Once the brake watchdog trips, the supervisor stops logging the deadline.** The deadline branch is an `else if` of the watchdog branch, so from 84 % load the log shows `DM1_BRAKE_CMD_TIMEOUT` only, although the deadline is of course missed too. Found by a wrong expectation in a test (T-13), by design, not in the guide. → A-6.

**Follow-up of previous actions**: none, the register was empty.