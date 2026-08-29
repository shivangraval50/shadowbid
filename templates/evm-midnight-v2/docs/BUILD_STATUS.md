# Build status

Last reviewed: 2026-08-29.

## Implemented

- Solidity `ShadowBidAuction` contains ERC-721 escrow, commitment records, cancellation, EIP-712 settlement, replay, payment, and proceeds logic.
- `contract-shadowbid` contains Compact registration, two commitment slots, close/open/consume circuits, nullifiers, and coordinator-result publication.
- EffectStream ShadowBid primitives, append-only facts, reducer, database migration, API routes, privacy checks, and a strict batcher adapter are present.
- The frontend renders a read-only ShadowBid dashboard and explicitly labels write/proof actions unavailable.

## Not complete

- The Compact source has only slots 0 and 1; the existing three-bid capability test expects slot 2 and fails.
- `start.dev.ts` compiles/deploys the legacy `contract-round-value`; the ShadowBid contract is not wired into the generic Midnight sync primitive.
- The dev batcher uses an authoritative reader that always returns `null`; it fails closed and cannot settle.
- Frontend create/bid/close/open/settle actions are not connected.

Do not describe the repository as an end-to-end three-bid auction demo until these gaps are fixed.
