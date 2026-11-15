# Project constitution — non-negotiable principles

These principles take precedence over any spec, plan or code decision. Claude must re-read them before every `/plan`.

1. **Spec before code.** No line of feature code without a spec approved by a human.
2. **Small verifiable steps.** Each task under 1 hour, testable, committed separately. No catch-all pull request.
3. **The test is the judge.** A requirement without a test is not done. Lint, typecheck and scoped tests green after each task; full suite green at the end of the spec; delivery checklist green before merge.
4. **Simplicity by default.** No dependency, abstraction or optimisation without a need shown in a spec. YAGNI.
5. **Visitor privacy is sacred.** No account, no cookie, no personal data collected; anything stored stays in the visitor's browser; analytics stay anonymous and aggregated.
6. **Free does not mean careless.** Performance and accessibility are requirements, not options.
7. **The human arbitrates.** Claude proposes, questions and implements; product decisions and validations stay human.
8. **Teaching honesty.** Every number on screen is computed by the model, every simplification is stated in the limitations, and the simulator is never presented as a safety tool.

When a principle stops matching practice, amend it here (dated, with the reason) instead of silently ignoring it.
