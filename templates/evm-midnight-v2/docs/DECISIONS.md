# Decisions

## 2026-08-29 — Public projection is not authority

ShadowBid source facts are append-only observations. The reducer is replay/order tolerant, but settlement must read finalized EVM/Midnight state and the coordinator result authority. EffectStream/API/database receipts cannot authorize settlement.

## 2026-08-29 — EVM settlement uses explicit trust boundary

`ShadowBidAuction` verifies an EIP-712 signature from `settlementSigner` and exact payment from the signed winner. It deliberately does not verify Midnight proofs. This is an implemented trust assumption, not a trustless bridge.

## 2026-08-29 — Fail closed while authority is unwired

`batcher.dev.ts` supplies an authoritative reader returning `null`, so the strict ShadowBid adapter rejects settlement requests until deployment wires a real finalized-state reader.

## 2026-08-29 — Three fixed Compact slots

The Compact contract now provides slots 0, 1, and 2, with per-slot consume/nullifier paths. This meets the existing deterministic three-bid capability test; it is not an unbounded bidder design.

## 2026-08-29 — Compact auction IDs use the EVM uint256 encoding

`register_auction` must receive the EVM auction id as its zero-left-padded unsigned `Bytes<32>` representation. The Midnight primitive converts that public representation back to the decimal EVM event key before reducing facts. This is an indexing convention, not proof of a bridge.
