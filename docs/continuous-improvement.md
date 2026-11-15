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
| A-1 | RE-1, spec 001 | Decide whether the hosts that always answer 403 to automated requests (`iso.org`, `image-ppubs.uspto.gov`) stay as permanent warnings or go into a commented allow-list in `scripts/check-links.mjs`, so that a real dead link stands out among them. | Owner | At the next spec that touches the link check, or the first time a real dead link is missed among the 4 standing warnings. | OPEN |
| A-2 | T-20, spec 001 | See the `Checks` result appear on the first pull request of spec 001: the `pull_request` trigger is declared but has never been exercised (no pull request exists yet). | Owner | When the owner asks for the pull request of spec 001. | OPEN |
| A-3 | T-17, spec 001 | Repeat `npm test` with the network really off: the offline run was emulated with a dead proxy, not a physical cut. | Owner | Before the pull request of spec 001 is merged. | OPEN |
| A-4 | SC-2, spec 001 | Proposal to add to the Conventions of CLAUDE.md: before stopping on a suspected gap between a scenario and its spec, re-measure at the model's own step (0.02 s), with its own thresholds (stopped = under 0.3 m/s), and over enough seeds and time (scenario D: 40 seeds, 60 s). | Owner decides, Claude drafts the wording | Before the next `/implement`. | OPEN |

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

### 2026-11-15 — Spec 001 (specify, plan, tasks, implement T-00 to T-21)

**Self-critique**
- **SC-1 — The first red-CI proof hung instead of failing.** CI run 43711380894 (a syntax error on a throwaway branch) was cancelled at the 10-minute job limit instead of turning red: every browser test waited its 30 s default and there are about 100 of them. Impact: one extra push and a second throwaway branch. Found only by actually pushing a broken commit, which is what T-18 existed to do. Root cause: the plan's risk table covered seeds, flakiness and pinned thresholds but not "the page does not start", and `openPage` used the default wait. → fixed in session (commit `4418461`: 8 s start-up deadline that names the page's error, run stopped after 10 failures, file-only checks in a first `static` project; the broken page now fails in 21 s locally and 76 s on GitHub); rule recorded in the Conventions of CLAUDE.md (T-19).
- **SC-2 — Twice, a small sample made me misread the model.** Scenario A looked like "the truck never stops" in a 0.5 s trace (3.1 km/h), while it stops at 0.097 m/s for 0.76 s just before the token is released (T-10); I was about to propose a spec amendment on a gap that did not exist. Scenario D looked harmless over 6 seeds and 30 s, while over 40 seeds and 60 s a collision happens in 17 runs (42 %). Impact: none, both caught before they became a decision. Root cause: I measured coarser, shorter or fewer than the phenomenon needs. → fixed in session (trace step `pasTrace`, "stopped" = the model's own 0.3 m/s) and → A-4.
- **SC-3 — The first link check reported three false positives.** It collected every URL of the page (font origins, preconnect hints, the GoatCounter endpoint) while S11 is about the links a reader follows. Caught by reading the real report before committing T-16. Root cause: I wrote the extraction from the plan's shorthand ("href attributes") without listing which hrefs the page actually contains. → fixed in session (anchors only).

**Rapport d'étonnement**
- **RE-1 — Four of the ten checked links warn in CI, always.** `iso.org` answers 403 to every automated request, and `image-ppubs.uspto.gov` answers 200 from the owner's machine but 403 from GitHub's servers: the same URL answers differently depending on who asks, so a link check cannot confirm these sources. Proposal: keep the warnings, or keep a commented allow-list so a new real dead link is not drowned. → A-1.
- **RE-2 — The scenario D promise holds, and it is odds, not a possibility.** Over 40 seeds (60 s after launch) the stop order is lost in 35 runs (88 %) and a collision happens in 17 (42 %); in 5 runs nothing is lost. The README's "a collision can occur" is closer to "about two runs in five". The suite forces both outcomes to stay reproducible and does not assert these odds. For information: it could feed the wording of the guide.
- **RE-3 — Once the brake watchdog trips, the supervisor stops logging the deadline.** The deadline branch is an `else if` of the watchdog branch, so from 84 % load the log shows `DM1_BRAKE_CMD_TIMEOUT` only, although the deadline is of course missed too. Found by a wrong expectation in a test (T-13), by design, not in the guide. For information.

**Follow-up of previous actions**: none, the register was empty.