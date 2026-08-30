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

`buildAuthoritativeSettlementReader` (shadowbid-coordinator-wiring.ts) returns `undefined` — and both `batcher.dev.ts` and `batcher.mainnet.ts` fall back to the pre-existing always-`null` reader — unless `SHADOWBID_COORDINATOR_RESULTS_DIR`, `SHADOWBID_EVM_CHAIN_ID`, and `SHADOWBID_EVM_AUCTION_CONTRACT`, and `SHADOWBID_SETTLEMENT_SIGNER` are all supplied. As of 2026-08-30 (see below), a real `LiveMidnightAuctionStateReader` is now constructed by default whenever those four are set, so setting them genuinely enables settlement — this remains "opt in," not "on by default." A deployment that never sets any of the four keeps its exact pre-2026-08-30 fail-closed behavior.

## 2026-08-30 — Coordinator-to-batcher handoff is a local file, not a new service

`FileCoordinatorResultStore` (shadowbid-coordinator.ts) writes/reads one JSON file per auction under `SHADOWBID_COORDINATOR_RESULTS_DIR`, mirroring `DurableReplayGuard`'s existing atomic-write pattern (`mkdir` + temp file + `rename`). The process that watches the Midnight commit deadline, decides the winner out-of-band, and holds `settlementSigner`'s private key was, at that date, out of scope for this template; the `shadowbid-coordinator-cli.ts` process described below now fills that role.

## 2026-08-30 — Live Midnight ledger reads reuse the exact frontend reference pattern, not a new client

`LiveMidnightAuctionStateReader` (shadowbid-midnight-reader.ts) is backed by `@midnight-ntwrk/midnight-js-indexer-public-data-provider`'s `queryContractState(address).data`, fed directly into the generated `ShadowBidContract.ledger()` decoder — the identical pattern `packages/frontend/client/src/increment.ts`'s `getCounterLedgerState` already uses for the Counter reference contract. No wallet, private-state provider, or proof provider is constructed, because reading *public* ledger state requires none of them; only writing (submitting a Compact transaction) would. Any error from `queryContractState` — not only `IndexerError` instances — is treated as `indexer-unavailable` and fails closed: a genuinely unreachable indexer surfaces as a plain `TypeError` from the underlying network client before ever reaching the GraphQL/IndexerError layer, and narrowing the catch to `instanceof IndexerError` let that case propagate uncaught instead of failing closed (found and fixed via `shadowbid-midnight-reader.test.ts`).

## 2026-08-30 — There is no reader-level "wrong Midnight network/contract" check independent of the coordinator's own domain comparison

`shadowbid.compact`'s `midnight_network`/`midnight_contract` fields are opaque `Bytes<32>` domain separators the caller of `register_auction` chooses; this template defines no canonical encoding of a network *name* into those bytes. `LiveMidnightAuctionStateReader` therefore cannot independently decide a fetched contract "belongs to the wrong network" from the ledger alone — that byte-exact comparison is already performed, correctly, by `createEip712AuthoritativeReader` (against the signed request's own domain fields) and by `validateCoordinatorDecision` (against the coordinator's decision input). Guessing an encoding here to add a redundant check would risk being actively wrong.

## 2026-08-30 — Coordinator EVM auction-contract address encoding is a new convention, not a pre-existing one

Analogous to the existing "EVM uint256 encoding" decision above, `shadowbid.compact`'s `evm: Bytes<32>` parameter (in `register_auction`) has no compiler-fixed encoding for a 20-byte EVM address, and nothing in this repository called `register_auction` before this date. `addressToBytes32` (shadowbid-coordinator.ts, reused by shadowbid-coordinator-core.ts) zero-left-pads the address the same way `abi.encode(address)` and the existing auction-id convention already do. Whatever process eventually registers a real auction on Midnight must use this exact same encoding, or every domain check that reads `evm_auction` will fail closed permanently for that auction. This was found and fixed as a real bug during this work: an earlier version of the domain check compared the raw 20-byte address against the 32-byte ledger field directly, which can never match.

## 2026-08-30 — The trusted coordinator is a CLI, not a background service, and never guesses a winner

`shadowbid-coordinator-cli.ts` takes an operator-supplied JSON decision file naming the winner, amount, and commitment explicitly; it never reads private Compact bid data and never compares amounts. It calls `validateCoordinatorDecision` (shadowbid-coordinator-core.ts) against live Midnight ledger state before signing anything, refusing to sign if the decision's domain fields, commitment, or deadlines don't match. `SHADOWBID_COORDINATOR_PRIVATE_KEY` has no default and is read only from the environment; the CLI never writes it anywhere. This still does not make winner selection proof-backed or trustless — see the 2026-08-30 "Winner/amount correctness remains a trusted-coordinator claim" decision above, which is unchanged by this addition.

## 2026-08-30 — `contract-shadowbid` now compiles with real ZK proving/verifier keys by default

The `--skip-zk` compile flag was previously assumed necessary because an earlier agent's sandbox denied Compact's proving-key subprocess, and a first attempt in this session appeared to hang past 90 seconds. A background retry in this same environment completed in under 2 minutes producing all 16 real key files (8 circuits × prover+verifier), and a foreground `bun run build:midnight` afterward completed in 19.5 seconds — the earlier "did not finish" observation was premature measurement, not a real block. `contract-shadowbid/package.json`'s `compact`/`contract:compile` scripts now run the real compile; `compact:skip-zk` is kept as an explicit fallback script for environments that are genuinely blocked. The regenerated `managed/contract/index.js` now has a populated `expectedVk` (was `{}` under `--skip-zk`) and is committed, since it was already a tracked file. Generated `managed/keys/*` and `managed/zkir/*.bzkir` binaries remain untracked and gitignored (see the fixed `.gitignore` gaps below) regardless of which compile mode produced them.

## 2026-08-30 — `.gitignore` gaps for `contract-shadowbid`'s generated output were a real, separate bug

`contract-round-value` (the reference Counter contract) was excluded from git via `templates/evm-midnight-v2/.gitignore` (`.../contract-round-value/src/managed`) and `packages/contracts-midnight/.gitignore` (`contract-round-value.*.json`), but the equivalent `contract-shadowbid` paths were never added — an asymmetry that predates this work and became actively dangerous once the real (non-`--skip-zk`) compile started producing large binary proving-key files under `managed/keys/`. Both `.gitignore` files now have the matching `contract-shadowbid` entries.

## 2026-08-30 — Two real, independent bugs in the hand-rolled `shadowbid.queries.ts` `prepared()` shim were blocking every ShadowBid API read

1. **Off-by-one in `locs.b`**: `@pgtyped/runtime`'s `replaceIntervals` (`preprocessor.js`) computes `str.slice(interval.b + offset + 1, ...)`, i.e. it expects `locs.b` to be the *inclusive* index of a parameter's last character, not one past it (confirmed against the real, compiler-generated `sm_example.queries.ts`, whose hand-verified `locs` are inclusive). The hand-rolled shim used an exclusive end, which silently ate the character immediately following any parameter that had more query text after it — corrupting `listShadowBidAuctions`'s `LIMIT :limit! OFFSET :offset!` into invalid SQL (`LIMIT $1OFFSET $2`) the moment a real Postgres/PGLite connection actually parsed it. Every query ending in a parameter (the common case in hand-written SQL) masked this for as long as no live database was reachable.
2. **PostgreSQL `::type` casts matched as named parameters**: the shim's regex (`/:([a-z_]+)(!)?/g`) matched the `:int` inside `COUNT(*)::int`, corrupting `shadowBidServiceState`'s query into `COUNT(*):$1 AS auction_count` — neither a valid cast nor a valid placeholder. Fixed with a negative lookbehind (`(?<!:):...`) excluding a colon immediately preceded by another colon.

Both bugs were latent through every prior review and QA pass because no live database was ever reachable to execute these queries; they were only found once this session's environment repairs (see below) made a full local stack reachable for the first time. `docs/SOL_FINAL_REVIEW.md`/`QA_REPORT_2026-08-29.md` correctly noted this as an untested surface, not a known-good one.

## 2026-08-30 — `ShadowBidAuctionModule`'s Ignition return key was inconsistent with every other module, blocking `deploy.ts`

Every other Ignition module in `packages/contracts-evm/ignition/modules/` returns `{ contract }`; `shadowBidAuction.ts` alone returned `{ auction }`. `deploy.ts`'s shared logging code reads `result.contract.address` for every deployment in its loop, so this was `undefined` specifically for the ShadowBid deployment, throwing before the Midnight contract deployment step ever ran. Renamed to `{ contract }` to match the established convention; nothing reads the destructured key name itself (the deployed-address lookup elsewhere uses the ignition-generated `"ShadowBidAuctionModule#ShadowBidAuction"` manifest key, derived from the contract name, not this return key).

## 2026-08-30 — A missing `@nomicfoundation/hardhat-ignition` symlink in this worktree's `node_modules`, not a lockfile/version problem, was blocking every EVM deploy

`packages/contracts-evm/node_modules/@nomicfoundation/` had symlinks for `hardhat-ignition-viem` and `ignition-core` (declared dependencies of `@effectstream/evm-contracts`/`@effectstream/evm-hardhat` at the same `3.0.2` version) but not for `hardhat-ignition` itself, despite it being declared identically. The package was present and correctly resolved in the shared `.bun` store; only this one workspace-local symlink was absent, reproducibly, even after `bun install --force`. Manually creating the missing symlink (matching the exact pattern of its already-linked sibling `ignition-core`) resolved `@nomicfoundation/hardhat-ignition/modules` immediately. This is a `node_modules` repair, not a manifest or lockfile change, and — being inside a gitignored directory — does not persist across a fresh `bun install` elsewhere; if this recurs in another environment, repeat the same manual symlink repair rather than touching `package.json` or `bun.lock` dependency versions.
