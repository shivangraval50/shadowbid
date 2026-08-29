# Submission readiness

This checklist describes repository readiness only. It does not claim that an external submission occurred.

- [x] README explains pitch, architecture, public/private boundary, trust assumptions, commands, limitations, and track fit.
- [x] DEVPOST copy is prepared.
- [x] DEMO is deterministic, time-boxed, and honest about unavailable writes.
- [x] Security and privacy documentation distinguish guarantees from assumptions.
- [x] Review-owned `SECURITY_REVIEW.md` remains review-owned.
- [x] Reference setup facts in `SETUP_STATUS.md` are preserved.
- [ ] Compact circuit supports the intended three-bid flow; current source has two slots and the capability test fails.
- [ ] ShadowBid Compact deployment is selected by `start.dev.ts` and `config.dev.ts`.
- [ ] Frontend create, commit, close, open, and settle writes are implemented.
- [ ] Authoritative finalized-state reader is implemented; dev batcher currently fails closed.
- [ ] A complete ShadowBid integration test covers three private bids through EVM settlement.
- [ ] Re-run build/test commands after the above fixes and record exact results.
- [ ] Capture final screenshots/video and replace any placeholder plan if desired.
- [ ] Perform external submission separately; no submission is asserted here.
