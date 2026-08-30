# Submission readiness

This checklist describes repository readiness only. It does not claim that an external submission occurred.

- [x] README explains pitch, architecture, public/private boundary, trust assumptions, commands, limitations, and track fit.
- [x] DEVPOST copy is prepared.
- [x] DEMO is deterministic, time-boxed, and honest about unavailable writes.
- [x] Security and privacy documentation distinguish guarantees from assumptions.
- [x] Review-owned `SECURITY_REVIEW.md` remains review-owned.
- [x] Reference setup facts in `SETUP_STATUS.md` are preserved.
- [x] Compact circuit supports the deterministic three-bid flow with fixed slots; it is not an unbounded-bidder design.
- [x] ShadowBid Compact deployment is selected by `config.dev.ts` and deployed by the local Midnight deployment script.
- [ ] Frontend create, commit, close, open, and settle writes are implemented.
- [ ] Authoritative finalized-state reader is implemented; dev batcher currently fails closed.
- [ ] An authenticated, proof-capable ShadowBid integration test covers three private bids through winner selection and EVM settlement.
- [ ] Re-run build/test commands after the above fixes and record exact results.
- [ ] Capture final screenshots/video and replace any placeholder plan if desired.
- [ ] Perform external submission separately; no submission is asserted here.
