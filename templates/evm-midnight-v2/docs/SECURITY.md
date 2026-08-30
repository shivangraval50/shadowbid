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

See [`PRIVACY.md`](PRIVACY.md), [`ARCHITECTURE.md`](ARCHITECTURE.md), and the historical findings in [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) and [`SOL_FINAL_REVIEW.md`](SOL_FINAL_REVIEW.md).
