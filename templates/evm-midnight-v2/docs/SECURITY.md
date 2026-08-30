# Security

## Implemented controls

- ERC-721 escrow accepts only the expected NFT/token in `onERC721Received`.
- Reentrancy guards protect create, settle, cancel, and proceeds withdrawal.
- Settlement uses EIP-712 typed data bound to the verifying contract and chain.
- Settlement checks winner, exact `msg.value`, reserve, commitment, separately stored Midnight contract/network identifiers, result version, expiry, nonce, signer, and that the commit phase has ended.
- Used settlement digests and per-auction nonces prevent replay.
- The unauthenticated Compact result-publication circuit is removed and its batcher path fails closed.
- Replay claims are canonical, size-limited, time-limited, durable, expiring, and idempotent for an identical envelope.
- Public source facts are append-only and the reducer is deterministic under duplicates/reordering.

## Security limits

`settlementSigner` is trusted. The EVM contract does not verify a Midnight proof or state. The dev batcher fails closed because its authoritative reader is not wired. The pinned Compact stack has no reviewed contract-caller/capability or ledger-time primitive here, so lifecycle flags and public Compact ledger must never authorize settlement. Do not use the development private keys or treat this as production-ready.

See [`PRIVACY.md`](PRIVACY.md) and the review-owned [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md).
