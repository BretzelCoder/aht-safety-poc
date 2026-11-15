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
| A-1 | | | | | |

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
