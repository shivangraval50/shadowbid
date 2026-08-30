# Claude settlement report — shadowbid/claude-settlement

Date: 2026-08-30. Branch created from `shadowbid-build` at `80cb6029` (merge: shadowbid gate fix), in an isolated worktree at `shadowbid-worktrees/shadowbid-claude-settlement/templates/evm-midnight-v2`.

## Task

Close the operational-settlement-path blockers documented in `docs/SOL_FINAL_REVIEW.md` (critical: "Midnight does not determine the auction result"; high: "There is no operational cross-chain settlement path") by implementing the smallest secure trusted-coordinator settlement path consistent with the repository's existing architecture, without adding a public unauthenticated result-publication circuit and without claiming proof-backed winner computation.

## Files changed

All changes are confined to `templates/evm-midnight-v2/packages/batcher/` (plus the lockfile and four docs). No Compact, Solidity, EffectStream primitive/reducer, database, API, or frontend source file was modified.

- **New** `packages/batcher/shadowbid-coordinator.ts` — `CoordinatorResult` type and `SETTLEMENT_AUTHORIZATION_TYPES` (byte-for-byte the same EIP-712 type string, field order, and struct as `ShadowBidAuction.SettlementAuthorization`/`SETTLEMENT_TYPEHASH`); `coordinatorResultDigest` / `verifyCoordinatorResult` (viem `hashTypedData` / `verifyTypedData`); `MidnightAuctionLedgerState` + `MidnightAuctionStateReader` interface + `toHexLedgerState` adapter for the generated `ShadowBidContract.ledger()` output; `FileCoordinatorResultStore` (atomic per-auction JSON file, mirroring `DurableReplayGuard`'s write pattern); `createEip712AuthoritativeReader`, which builds the real `AuthoritativeSettlementReader`.
- **New** `packages/batcher/shadowbid-coordinator-wiring.ts` — `buildAuthoritativeSettlementReader`, which reads `SHADOWBID_COORDINATOR_RESULTS_DIR` / `SHADOWBID_EVM_CHAIN_ID` / `SHADOWBID_EVM_AUCTION_CONTRACT` / `SHADOWBID_SETTLEMENT_SIGNER` from the environment and an injected `MidnightAuctionStateReader`, returning `undefined` (fail closed) if any is absent.
- **New** `packages/batcher/shadowbid-coordinator.test.ts` — 17 tests (see Tests below).
- **Changed** `packages/batcher/shadowbid-settlement.ts` — removed the unconditional `throw new Error("Midnight result publication is disabled pending authenticated coordinator support")` in `validateInput`, so the pre-existing (previously dead) check sequence — authoritative state lookup, expiry, domain match, known-commitment check, result match, replay claim — actually runs. No other logic in this file changed.
- **Changed** `packages/batcher/shadowbid-settlement.test.ts` — replaced the test asserting the old permanent-throw message with tests asserting real accept/reject behavior against an injected reader; all other tests unchanged.
- **Changed** `packages/batcher/batcher.dev.ts`, `packages/batcher/batcher.mainnet.ts` — both now call `buildAuthoritativeSettlementReader()` and use its result if defined, else keep the pre-existing always-`null` reader.
- **Changed** `packages/batcher/package.json` — added `"viem": "2.37.3"` as an explicit dependency (already present transitively via `@effectstream/batcher-sdk` at the identical pinned version everywhere else in the lockfile; made explicit because `packages/batcher` imports it directly now).
- **Changed** `bun.lock` — regenerated (non-frozen `bun install`) after the above `package.json` change. Diff is transitive-dependency re-hoisting only; no top-level pinned version changed.
- **Changed** `docs/DECISIONS.md`, `docs/BUILD_STATUS.md`, `docs/AGENT_HANDOFF.md`, `docs/TEST_MATRIX.md` — see those files for the exact additions.

## Trust / security model

**What changed:** the batcher can now authenticate a coordinator result cryptographically and cross-check it against injected Midnight ledger state before returning `SETTLEMENT_READY`, closing the "no operational cross-chain settlement path" finding.

**What did not change:**

1. **The Compact contract is untouched.** `shadowbid.compact` still exposes exactly 8 circuits; `shadowbid.contract.test.ts` (unmodified) asserts this and asserts `publish_coordinator_result` does not exist. No on-chain result-publication circuit was added, per the task's explicit constraint. The installed Compact SDK (`pragma language_version >= 0.25`) has no contract-recognized caller/capability/signature-verification primitive available to this template, so an authenticated on-chain circuit was not a safely implementable option here — this is stated as a hard blocker, not worked around.
2. **The EVM contract is untouched.** `ShadowBidAuction.sol` already enforced deadline (`commitDeadline < block.timestamp <= settlementDeadline`), full domain binding (EVM chain id + verifying contract via EIP-712, plus explicit `midnightContract`/`midnightNetwork` equality checks), signature authentication (`ECDSA.recover` against `settlementSigner`), replay protection (`usedSettlementDigests` + per-auction nonce), exact payment, escrow, and winner identity (`msg.sender == winner`). All 8 Forge tests pass unchanged, including the three-bidder settlement test.
3. **Winner/amount correctness is still a trusted-coordinator claim, not a proof.** `verifyCoordinatorResult` proves *who* signed a result (the holder of `settlementSigner`'s private key), never *why* the winner/amount are correct. A dishonest or compromised coordinator can still sign a false winner, exactly as `SOL_FINAL_REVIEW.md` finding 3 already documented. This report does not claim otherwise.
4. **The authoritative reader never trusts the EffectStream projection/API/database**, consistent with the pre-existing "public projection is not authority" decision. It only trusts (a) a valid EIP-712 signature from the configured `settlementSigner` address and (b) injected Midnight ledger state showing the signed commitment was actually closed/committed.
5. **Both batcher entrypoints remain fail-closed by default.** `buildAuthoritativeSettlementReader()` returns `undefined` (falling back to the pre-existing always-`null` reader) unless all four environment variables *and* a live `MidnightAuctionStateReader` are supplied. No `MidnightAuctionStateReader` implementation backed by a real indexer connection was wired into either entrypoint in this change (see Remaining blockers), so **both entrypoints are unconditionally fail-closed as shipped**, identical in effect to before this change.
6. **No new unauthenticated public entry point of any kind was added.** The only new inputs to the system are (a) an EIP-712 signature verified against a fixed configured address, and (b) local files under an operator-configured directory that only a process with filesystem access can write.

## Commands run and exact results

```
$ bun install
Resolved, downloaded and extracted [1]
Saved lockfile
1659 packages installed [15.12s]

$ bun run build:midnight
$ bun run --filter @evm-midnight/shadowbid-midnight-contract compact
@evm-midnight/shadowbid-midnight-contract compact: Exited with code 0

$ bun run --cwd packages/contracts-evm build
(lint warnings only, pre-existing, unrelated to this change) ... exit 0

$ forge test --match-contract ShadowBidAuctionTest -vv
Ran 8 tests for test/src/ShadowBidAuction.t.sol:ShadowBidAuctionTest
[PASS] testEscrowCancellationAndTimeoutRecovery()
[PASS] testRejectsForgedWinnerWrongDomainAndSettlementBeforeCommitClose()
[PASS] testRejectsInvalidDeadlinesAndPrematureOrExpiredSettlement()
[PASS] testRejectsUnauthorizedAndNonexistentAuctionOperations()
[PASS] testRejectsWrongWinnerPaymentAndDuplicateCommitment()
[PASS] testSettlementConsumesAuthorizationAndCreditsSeller()
[PASS] testSettlementRequiresCommitDeadlineAndExactMidnightNetwork()
[PASS] testThreeBidderFlowSettlesHighestAuthorizedBidToWinner()
8 passed; 0 failed; 0 skipped

$ bun run --cwd packages/contracts-midnight/contract-shadowbid test
✓ src/shadowbid.contract.test.ts (4 tests)
Test Files  1 passed (1)
Tests  4 passed (4)

$ bun test packages/batcher/shadowbid-settlement.test.ts packages/batcher/shadowbid-coordinator.test.ts packages/node/shadowbid.test.ts
23 pass
0 fail
54 expect() calls
Ran 23 tests across 3 files.

$ bun test packages/node/shadowbid-primitive.test.ts
4 pass
1 fail  (pre-existing: PrimitiveRegistry singleton rejects a reused instanceName:"midnight"
         across two test cases in this unmodified file — unrelated to this change)

$ bun test packages/tests/stm/shadowbid-privacy.test.ts
0 pass, 0 fail — 0 tests executed (unchanged: this file only exports the integration
function consumed by packages/tests/run-tests.ts; matches QA_REPORT_2026-08-29.md)

$ bun run --cwd packages/frontend build
FAILED (pre-existing, unrelated): vite-plugin-static-copy could not find
packages/contracts-midnight/contract-round-value.*.json — requires a deployed
local chain's address manifest, which this environment does not have running.

$ bun run test
FAILED (pre-existing, unrelated): deploy-evm-contracts step —
"Cannot find module '@nomicfoundation/hardhat-ignition/modules'" — a dependency
resolution gap in the installed tree, before any chain is deployed. Progressed
further than QA_REPORT_2026-08-29.md's snapshot (that report could not even
start compile-evm-contracts-forge because of an unwritable dependency symlink;
this run compiled EVM contracts, compiled the Compact contract, and started the
Hardhat node before failing at deploy).
```

Total for the settlement-path work itself: **23/23 new+updated unit tests passing**, plus **8/8 EVM Forge tests** and **4/4 Compact privacy-boundary tests** unchanged and still passing.

## Remaining blockers

1. **No live Midnight ledger connection.** `MidnightAuctionStateReader` is a real, typed interface matching the generated `ShadowBidContract.ledger()` shape (via `toHexLedgerState`), but no implementation backed by `@midnight-ntwrk/midnight-js-indexer-public-data-provider` (or an equivalent live node/indexer client) was built, because no such indexer/node was reachable from this environment to build and validate one against. This is the single largest remaining gap between "authenticated coordinator support exists" and "the batcher can settle a real auction."
2. **No coordinator process exists.** The thing that watches the Midnight commit deadline, has out-of-band access to decide the true winner (bid amounts and openings are private Compact witness data, never disclosed on any public ledger or the EffectStream projection — confirmed by reading `shadowbid.ts`/`shadowbid-primitive.ts`), holds `settlementSigner`'s private key, and writes a signed `CoordinatorResult` via `FileCoordinatorResultStore`, is out of scope for this change and was not built. This is where all remaining trust in the system concentrates and would need its own dedicated security review.
3. **`contract-shadowbid`'s Compact compile still uses `--skip-zk`.** A full (non-`--skip-zk`) compile was attempted once during this work and did not complete within 90 seconds in this environment (the retained Counter reference contract's trivial `increment` circuit does compile with real proving keys quickly in the same environment, confirming the toolchain itself is not categorically blocked — the ShadowBid contract's 8 circuits over private `Bid`/`Nullifier` structs are simply far more expensive). No proof-capable end-to-end run was executed, and none is claimed.
4. **Full orchestrated build/test (`bun run test`, `packages/frontend build`) still cannot complete** in this environment for reasons unrelated to this change (missing `@nomicfoundation/hardhat-ignition/modules` at deploy time; frontend needs a deployed chain's address manifest). See `docs/BUILD_STATUS.md`.

## Privacy guarantees and limitations

**Unchanged from the existing, already-validated design** (nothing in this change touches privacy-relevant code paths):

- Losing bid amounts, salts, and openings are private Compact circuit arguments and are never passed to `disclose()`, never appear in an EVM event, and are rejected if present in an ingested Midnight fact (`ingestShadowBidFact` rejects payloads containing `amount` or `salt`, per `shadowbid.ts`).
- The public API/database/dashboard expose only: commitment hashes, lifecycle/phase state, the terminal `AuctionSettled` event's winner and winning amount (public by protocol design once settlement occurs), and commitment/slot counts.
- `shadowbid-coordinator.test.ts`'s "valid three-bidder settlement" test asserts structurally — not just by spot-checking values — that `SettlementReadyState.approvedResult` contains exactly `{winner, commitment, amount, settlementDigest, nonce}` and nothing else, and that `recordedCommitments` is opaque hashes only.

**Limitations, stated plainly:**

- The winning amount and winner identity **do** become public at settlement — this has always been true of the protocol (a sealed-bid auction with a public settlement event), not something this change introduces or could avoid.
- **Runtime cryptographic non-leakage has not been re-verified in this pass.** No live database/API/browser was available to exercise (see blocker 4), so this report relies on the same static source-level evidence `QA_REPORT_2026-08-29.md` already recorded, plus the new structural test above. This is not a substitute for a live privacy runtime check.
- The coordinator process (not built here) will necessarily have access to private bid data out-of-band in order to determine the true winner; the privacy guarantee is that this data does not flow through any public ledger, API, or database — it does flow through whatever out-of-band channel a real coordinator implementation uses, which is unspecified and unreviewed here.
