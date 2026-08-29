# Decisions

## 2026-08-29 — Public projection is not authority

ShadowBid source facts are append-only observations. The reducer is replay/order tolerant, but settlement must read finalized EVM/Midnight state and the coordinator result authority. EffectStream/API/database receipts cannot authorize settlement.

## 2026-08-29 — EVM settlement uses explicit trust boundary

`ShadowBidAuction` verifies an EIP-712 signature from `settlementSigner` and exact payment from the signed winner. It deliberately does not verify Midnight proofs. This is an implemented trust assumption, not a trustless bridge.

## 2026-08-29 — Fail closed while authority is unwired

`batcher.dev.ts` supplies an authoritative reader returning `null`, so the strict ShadowBid adapter rejects settlement requests until deployment wires a real finalized-state reader.

## 2026-08-29 — Documentation reflects current capability

The current Compact contract has two commitment slots. The three-bid test is retained as a failing acceptance signal; documentation must not claim three bidder support.
