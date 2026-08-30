# Build status

Last reviewed: 2026-08-29.

## Implemented

- Solidity `ShadowBidAuction` contains ERC-721 escrow, commitment records, cancellation, EIP-712 settlement, replay, payment, and proceeds logic.
- `contract-shadowbid` contains Compact registration, three fixed commitment slots, close/open/consume circuits, and nullifiers. Its generated bindings expose eight circuits; coordinator-result publication is intentionally absent.
- EffectStream ShadowBid primitives, append-only facts, reducer, database migration, API routes, privacy checks, and a strict batcher adapter are present.
- The frontend renders a read-only ShadowBid dashboard from live API state; unavailable write/proof flows are not exposed as controls.
- Local orchestration compiles and deploys both the retained Counter reference contract and `contract-shadowbid`; the ShadowBid sync primitive reads the deployed ShadowBid ledger.

## Not complete

- The dev and mainnet batcher readers currently return `null`; they fail closed and cannot settle.
- The current local execution environment denies Compact's proving-key subprocess (`zkir`, `Operation not permitted`), so the binding script uses the compiler's documented `--skip-zk` mode. ZKIR circuit output is generated, but a live proof/settlement run still needs a host that permits proof-key generation.

Do not describe the repository as an end-to-end settlement demo, trustless bridge, or proof-backed auction until a finalized EVM/Midnight/coordinator authority reader, authenticated winner-selection design, and proof-capable host are supplied.
