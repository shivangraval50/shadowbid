# Security

## Implemented controls

- ERC-721 escrow accepts only the expected NFT/token in `onERC721Received`.
- Reentrancy guards protect create, settle, cancel, and proceeds withdrawal.
- Settlement uses EIP-712 typed data bound to the verifying contract and chain.
- Settlement checks winner, exact `msg.value`, reserve, commitment, Midnight domain/network, result version, expiry, nonce, and signer.
- Used settlement digests and per-auction nonces prevent replay.
- Batcher envelopes are canonical, size-limited, time-limited, domain-checked, result-checked, and protected by a durable replay registry.
- Public source facts are append-only and the reducer is deterministic under duplicates/reordering.

## Security limits

`settlementSigner` is trusted. The EVM contract does not verify a Midnight proof or state. The dev batcher fails closed because its authoritative reader is not wired. Do not use the development private keys or treat this as production-ready.

See [`PRIVACY.md`](PRIVACY.md) and the review-owned [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md).
