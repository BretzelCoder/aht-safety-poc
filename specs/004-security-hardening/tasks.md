# Tasks — Spec 004

- [x] **T-01** Write spec and plan (approved 2026-11-18 in the audit discussion).
- [x] **T-02** Gate the test-only hook: `js/test-hook.js` creates `window.__sim` only off the published site (guard on `GC_HOST`), release stamps updated, new pure check `verifierCrochet` with its negative test (AC-3, S4-S6).
- [x] **T-03** Pin the three workflow actions by 40-hex commit SHA with `# vX` comments; new pure check `verifierEpinglage` with its negative test (AC-4, S7).
- [x] **T-04** Add the CSP `<meta>` of S1 (stamps run first, base64 hashes of the two inline scripts computed last); new pure check `verifierCsp` with its negative tests (stale hash, foreign origin, missing directive) (AC-1, AC-2, S1-S3).
- [x] **T-05** Full `npm test` green on Node 24 (see evidence table).

## Evidence table (per convention "every new check proves it can fail")

| Check | Proof that it fails |
|---|---|
| `verifierCrochet` (S6, check T-02) | Negative test: the guard replaced by nothing in a copy of `js/test-hook.js` -> one error naming the hook. |
| `verifierEpinglage` (S7, check T-03) | Negative test: `uses: actions/checkout@v7` back in a copy of the workflow -> one error naming the action; a wrong-length pin is also reported. |
| `verifierCsp` (S2, check T-04) | Three negative tests: a policy without the hash of one inline script; a foreign origin (`https://example.org`) in the policy; `base-uri` absent. Each is reported with its reason. |
| CSP accepted by the browser (AC-1, S3) | The full suite runs the real page from disk (`file://`), under `/aht-safety-poc/` and renders it in FR/EN/DE: the start-up guard passed in every one of them (the guard needs both inline scripts allowed by hash, and every `js/` file allowed by the policy). |
