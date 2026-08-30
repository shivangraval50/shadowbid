# ShadowBid security review disposition

Reviewed and remediated: 2026-08-29. This is a source/build/test review; it is not a proof-capable production audit.

| Finding | Disposition |
| --- | --- |
| H-1 Forgeable Compact result | Fixed fail-closed. `publish_coordinator_result` and result ledger fields were removed, so an unauthenticated caller cannot create a Midnight winner/result state. Compact lifecycle circuits remain unauthenticated because the pinned Compact stack exposes no reviewed contract-caller/capability or ledger-time primitive in this template. Deployments must not treat lifecycle flags or public Compact fields as settlement authority. Re-enable result publication only with a reviewed coordinator-authentication design, finality reader, and proof-capable integration test. |
| H-2 Early EVM settlement | Fixed. `settle` now rejects at or before `commitDeadline`; boundary tests cover before, exactly at, and after the deadline. |
| M-1 Unsafe `SETTLEMENT_READY` projection | Fixed. The projection is now `COMMITMENT_CORRELATED`; it is explicitly non-authoritative and never means settlement-ready. |
| M-2 Replay admission denial | Improved. Replay claims are expiring and idempotent for an identical envelope, so repeated validation/restart does not burn the request. They remain a local single-process guard, not cross-process coordinator authorization. |
| M-3 Midnight network not bound | Fixed. EVM auction creation stores separate nonzero Midnight contract and network identifiers, and signed settlement compares both exactly. |
| M-4 Privacy test coverage | Partially fixed below. Tests now reject unavailable batch publication and retain source-level privacy checks. End-to-end API/DB/rendered-browser/log checks require the documented complete dependency install and running services; they are not claimed as executed here. |
| L-1 Public reserve labelled hidden | Fixed. Dashboard copy displays the public reserve and retains privacy claims only for bid openings. |
| L-2 Stale documentation | Fixed in the security and architecture/privacy/demo documentation. |

Security boundaries: EVM custody settlement still requires the configured EIP-712 `settlementSigner`, exact winner payment, commitment recording, replay protections, deadline checks, and both stored Midnight identifiers. EVM does not verify Midnight proofs. The development authoritative reader returns `null`, so it cannot settle. EffectStream/API facts and UI state are projections only.
