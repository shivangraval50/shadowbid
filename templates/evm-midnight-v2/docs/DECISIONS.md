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

## 2026-08-30 — Coordinator result authority is authenticated off-chain, not on Midnight

The installed Compact SDK (v0.25 language, per `pragma language_version >= 0.25` in `shadowbid.compact`) has no contract-recognized caller/capability primitive, and `shadowbid.contract.test.ts` pins the circuit set at exactly 8 with an explicit assertion that `publish_coordinator_result` does not exist. Adding an on-chain result-publication circuit was therefore not attempted; doing so without an authentication primitive would only recreate the forgeable-result flaw closed in the "gate-fix"/"remediation" checkpoints. Coordinator authentication instead happens off-chain: `packages/batcher/shadowbid-coordinator.ts` defines a `CoordinatorResult` struct whose EIP-712 type string, field order, and domain (`ShadowBidAuction`/`"1"`, EVM chain id, verifying contract) are byte-for-byte identical to `ShadowBidAuction.SettlementAuthorization`/`SETTLEMENT_TYPEHASH`. A signature verified there is the exact signature `ShadowBidAuction.settle` will also accept — there is no second, weaker authentication path. This is `settlementSigner` trust (already documented above), moved earlier in the pipeline rather than replaced.

## 2026-08-30 — Authoritative reader cross-checks the coordinator result against finalized Midnight ledger state, never against the EffectStream projection

`createEip712AuthoritativeReader` (shadowbid-coordinator.ts) requires an injected `MidnightAuctionStateReader` that returns the same public ledger fields as the generated `ShadowBidContract.ledger(state)` (`initialized`, `commitments_closed`, `auction_id`, `evm_chain_id`, `evm_auction`, `midnight_network`, `midnight_contract`, `commitment_0/1/2`, `committed_0/1/2`). It rejects a signed result whose auction/domain fields don't match that ledger, whose commitment isn't one of the closed/committed slots, or whose `expiry` is non-positive; a `null` ledger or `null` signed-result lookup fails the whole check closed. This keeps the "public projection is not authority" decision above intact: EffectStream/API/database state is never consulted by this reader at all.

## 2026-08-30 — Winner/amount correctness remains a trusted-coordinator claim, not a computed or proven result

Nothing in `shadowbid-coordinator.ts` recomputes a winner or compares bid amounts; it only verifies that the coordinator's private key signed a specific, fully domain-bound `(auctionId, winner, amount, commitment, midnightContract, midnightNetwork, resultVersion, expiry, nonce)` tuple, and that the referenced commitment is genuinely one of the auction's closed Midnight commitments. A dishonest coordinator can still sign a false winner/amount, exactly as `SOL_FINAL_REVIEW.md` finding 3 describes. Do not describe this system as proof-backed winner selection.

## 2026-08-30 — Both batcher entrypoints stay fail-closed by default; the real reader is opt-in via environment configuration

`buildAuthoritativeSettlementReader` (shadowbid-coordinator-wiring.ts) returns `undefined` — and both `batcher.dev.ts` and `batcher.mainnet.ts` fall back to the pre-existing always-`null` reader — unless `SHADOWBID_COORDINATOR_RESULTS_DIR`, `SHADOWBID_EVM_CHAIN_ID`, `SHADOWBID_EVM_AUCTION_CONTRACT`, `SHADOWBID_SETTLEMENT_SIGNER`, and a live `MidnightAuctionStateReader` are all supplied. No `MidnightAuctionStateReader` implementation is wired into either entrypoint in this change (no live Midnight indexer/node connection was reachable from this environment to build and validate one against; see BUILD_STATUS.md), so both entrypoints remain fail-closed today regardless of the other four variables. This preserves every existing "fails closed" guarantee for any deployment that does not explicitly opt in.

## 2026-08-30 — Coordinator-to-batcher handoff is a local file, not a new service

`FileCoordinatorResultStore` (shadowbid-coordinator.ts) writes/reads one JSON file per auction under `SHADOWBID_COORDINATOR_RESULTS_DIR`, mirroring `DurableReplayGuard`'s existing atomic-write pattern (`mkdir` + temp file + `rename`). The process that watches the Midnight commit deadline, decides the winner out-of-band, and holds `settlementSigner`'s private key is out of scope for this template — this store is only the handoff point such a process would write to.
