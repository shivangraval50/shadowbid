# ShadowBid security

> Current posture: component-level controls and an authenticated trusted-coordinator handoff are validated; this is not a production audit or trustless settlement protocol.

## Implemented controls

- ERC-721 escrow accepts only the expected NFT/token in `onERC721Received`.
- Reentrancy guards protect create, settle, cancel, and proceeds withdrawal.
- EIP-712 settlement authorization is bound to the verifying contract, EVM chain, auction, winner, amount, commitment, Midnight contract/network, result version, expiry, and nonce.
- Settlement enforces the commit/settlement windows, reserve, exact `msg.value`, valid winner, and configured signer.
- Used settlement digests and per-auction nonces prevent replay.
- The unauthenticated Compact result-publication circuit does not exist; the batcher rejects missing/invalid authority state and remains fail-closed when not configured.
- The live reader reads public Midnight ledger state directly, not the EffectStream projection/API/database.
- Public source facts are append-only and the reducer is deterministic under duplicates/reordering.
- Privacy tests verify that salts, openings, and losing amounts do not enter public API/database/browser/log surfaces.

## Security limits

`settlementSigner` is trusted. Its signature proves authorization, not winner correctness. EVM does **not** directly verify a Midnight ZK winner-computation proof, and the Compact circuits do not calculate a global maximum. The coordinator’s out-of-band decision process needs multi-party approval, rate limiting, durable auditing, key protection, and a dedicated operational security review before use with real funds.

Compact lifecycle transitions are not independently authenticated/timed by a reviewed caller/capability primitive in this pinned stack. Do not treat public Midnight lifecycle fields or EffectStream state as settlement authority. The design is limited to three bidder slots and the UI has no wallet-backed auction/bid/settlement writes.

## The concrete attack this design does not prevent

Stated plainly, because a recorded 8/13/11 run can otherwise be over-read: in
the live run, bidders committed 8, 13, and 11, and the coordinator signed for
the 13 bidder. **Nothing in the system verified that 13 was the largest.** Had
the coordinator signed for the bidder who committed 8, every check would still
have passed — the commitment is real and closed, the domain binds correctly, the
EIP-712 signature is valid, the EVM contract's deadline/payment/replay/winner
checks all hold, and EffectStream would project that settlement as final. The
losing bidders would have no on-chain recourse and no evidence of misbehaviour,
because their amounts are private.

Mitigating this requires an in-circuit maximum with deterministic tie rules and
EVM-address binding, which this contract deliberately does not implement. Until
then, `settlementSigner` compromise or dishonesty is a total failure of auction
correctness, bounded only by the reserve price and exact-payment requirement.

See [`PRIVACY.md`](PRIVACY.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), and the historical findings in [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) and [`SOL_FINAL_REVIEW.md`](SOL_FINAL_REVIEW.md).
