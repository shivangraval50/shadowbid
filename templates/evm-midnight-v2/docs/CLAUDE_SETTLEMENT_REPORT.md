# Claude settlement report — shadowbid/claude-settlement
<!-- HISTORICAL IMPLEMENTATION REPORT: This report records the settlement pass and intermediate results. Later final validation supersedes intermediate counts and blockers; see BUILD_STATUS.md and TEST_MATRIX.md. -->

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

---

# Second pass — 2026-08-30, continuing from commit `7cd6a36c`

## Task for this pass

Complete as much of the remaining operational settlement path as safely possible: a real live Midnight state reader, a runnable trusted-coordinator process, finished batcher wiring, the pre-existing `shadowbid-primitive.test.ts` isolation failure, and reproducible full-stack launch — while preserving every guarantee from the first pass.

## Files changed (this pass)

**New:**
- `packages/batcher/shadowbid-midnight-reader.ts` — `LiveMidnightAuctionStateReader` (real `MidnightAuctionStateReader` backed by `@midnight-ntwrk/midnight-js-indexer-public-data-provider` + the generated `ShadowBidContract.ledger()` decoder), `MidnightReaderFailure`/`MidnightReaderError` typed failures, `ContractStateSource` injection seam for testing.
- `packages/batcher/shadowbid-coordinator-core.ts` — `CoordinatorDecision`, `validateCoordinatorDecision` (live-ledger + internal-consistency checks), `signCoordinatorDecision`.
- `packages/batcher/shadowbid-coordinator-cli.ts` — the trusted coordinator CLI entrypoint.
- `packages/batcher/shadowbid-midnight-reader.test.ts` (4 tests), `packages/batcher/shadowbid-coordinator-core.test.ts` (11 tests).

**Changed:**
- `packages/batcher/shadowbid-coordinator.ts` — exported `addressToBytes32` (was missing entirely; fixed a real bug where the EVM-auction-contract domain check could never match a real address), added its documentation.
- `packages/batcher/shadowbid-coordinator-wiring.ts` — `buildAuthoritativeSettlementReader` now constructs a real `LiveMidnightAuctionStateReader` by default from `@effectstream/midnight-contracts/midnight-env`'s shared config.
- `packages/batcher/shadowbid-coordinator.test.ts` — fixed a pre-existing fixture bug (`evm_auction: auction.evmContract` set both sides of a comparison identically, masking the missing `addressToBytes32` encoding); added a direct `addressToBytes32` unit test.
- `packages/batcher/package.json` — added `@effectstream/midnight-contracts` (0.200.1, already pinned elsewhere) and `@midnight-ntwrk/midnight-js-indexer-public-data-provider` (5.0.0-beta.6, already pinned elsewhere) as explicit dependencies; added a `coordinator` script.
- `packages/node/shadowbid-primitive.test.ts` — fixed the `PrimitiveRegistry` duplicate-instanceName isolation bug; added a regression test.
- `packages/contracts-evm/ignition/modules/shadowBidAuction.ts` — return key `{auction}` → `{contract}` to match every other Ignition module and unblock `deploy.ts`.
- `packages/contracts-midnight/contract-shadowbid/package.json` — `compact`/`contract:compile` now run the real (non-`--skip-zk`) compile; added `compact:skip-zk` as an explicit fallback.
- `packages/database/sql/shadowbid.queries.ts` — fixed the off-by-one `locs.b` bug and the `::type`-cast-matched-as-parameter regex bug in the hand-rolled `prepared()` shim.
- `templates/evm-midnight-v2/.gitignore`, `packages/contracts-midnight/.gitignore` — added the missing `contract-shadowbid` equivalents of the existing `contract-round-value` exclusions.
- `packages/contracts-midnight/contract-shadowbid/src/managed/contract/index.js`, `index.js.map`, `compiler/contract-manifest.json` — regenerated with the real compile (populated `expectedVk`; these were already tracked files from before this pass).
- `bun.lock` — regenerated (non-frozen `bun install`) after the `package.json` changes above; diff is the two new dependency edges plus transitive re-hoisting, no top-level pinned version changed.

Not committed (correctly gitignored, generated binaries): `packages/contracts-midnight/contract-shadowbid/src/managed/keys/*` (16 files, real proving/verifier keys), `.../managed/zkir/*.bzkir`, `packages/contracts-midnight/contract-shadowbid.undeployed.json`.

## Trust/security model — what's new, what's unchanged

**Unchanged from the first pass** (still true, re-verified): the Compact contract has no on-chain result-publication circuit and none was added; the EVM contract's deadline/domain/signature/replay/payment/escrow/winner checks are untouched; winner/amount correctness is authenticated but not proof-backed; the authoritative reader never trusts the EffectStream projection.

**New this pass:**
- The authoritative reader is now genuinely connected to live Midnight state, not just structurally ready for it. `LiveMidnightAuctionStateReader` reads only the contract's public ledger fields (see its module doc for the exhaustive field list) — there is no private witness, salt, bid amount, or bidder identity in that type for it to expose even by construction.
- A concrete trusted-coordinator implementation exists: `shadowbid-coordinator-cli.ts`. It is intentionally a thin CLI, not a service — it takes one explicit decision, validates it against live state, signs it once, and exits. It holds `SHADOWBID_COORDINATOR_PRIVATE_KEY` only for the duration of that one process invocation, reads it only from the environment, and writes it nowhere.
- `validateCoordinatorDecision` is a **necessary but not sufficient** safety check: it proves the decision is internally consistent and consistent with live Midnight ledger state (registered, closed, right domain, real commitment, deadline window respected). It does **not** prove the winner is correct — a coordinator (or whoever feeds it a decision file) can still name the wrong winner and this validation will happily pass and sign it, exactly as SOL_FINAL_REVIEW.md finding 3 already documented. This is unchanged, restated for emphasis given the CLI now actually exists and could be run.

## Launch instructions

### Full local stack (unchanged command, now actually completes)

```sh
bun run test          # from templates/evm-midnight-v2 — runs packages/tests/run-tests.ts,
                       # which compiles, deploys, and orchestrates the entire local stack
                       # (Hardhat EVM node, Midnight node/indexer/proof-server, sync, API,
                       # frontend build/render) before running its assertions.
```
Before running it, check no other worktree owns its ports: `lsof -nP -iTCP:5432,8545,9944,8088,6300,3334,9999,10599,4747 -sTCP:LISTEN`. If something is listening, `lsof` also names the PID/working-directory — confirm it belongs to a different worktree before assuming it's safe to leave alone (do not kill it either way unless you started it yourself in this worktree).

### Coordinator CLI

```sh
cd packages/batcher
SHADOWBID_COORDINATOR_PRIVATE_KEY=0x<coordinator EOA private key, matches settlementSigner> \
SHADOWBID_COORDINATOR_RESULTS_DIR=./coordinator-results \
bun run coordinator path/to/decision.json
```
`decision.json`'s exact required shape is documented in full at the top of `shadowbid-coordinator-cli.ts`. Optional: `MIDNIGHT_INDEXER_HTTP` / `MIDNIGHT_INDEXER_WS` override the indexer endpoint (default: `@effectstream/midnight-contracts/midnight-env`'s resolved config, i.e. `http://127.0.0.1:8088/api/v4/graphql` / `ws://127.0.0.1:8088/api/v4/graphql/ws` for the local `undeployed` network).

### Batcher, with the live reader enabled

```sh
cd packages/batcher
SHADOWBID_COORDINATOR_RESULTS_DIR=./coordinator-results \
SHADOWBID_EVM_CHAIN_ID=31337 \
SHADOWBID_EVM_AUCTION_CONTRACT=0x<deployed ShadowBidAuction address> \
SHADOWBID_SETTLEMENT_SIGNER=0x<address matching the coordinator's private key> \
bun run start          # or `bun run start:mainnet`
```
`SHADOWBID_COORDINATOR_RESULTS_DIR` must be the exact same path the coordinator CLI writes to. If any of the four variables is unset, both entrypoints keep their pre-existing fail-closed behavior (`buildAuthoritativeSettlementReader()` returns `undefined`; the batcher rejects every ShadowBid settlement request).

## Commands run and exact results

See `docs/TEST_MATRIX.md`'s "Commands run for this pass" section for the exact command list and results. Summary: 45/45 focused unit tests pass across 6 files; 8/8 Forge tests pass; 4/4 Compact tests pass (now with real ZK keys); `bun install --frozen-lockfile` passes; `bun run --cwd packages/frontend build` passes (previously failed); `bun run test` reaches 29/31 (previously could not get past the first compile step).

## Remaining blockers

1. **`packages/tests/run-tests.ts` phase ordering** — the ShadowBid privacy test's browser-output check runs in Phase B, before the frontend is built/started in Phase E. Diagnosed precisely (see DECISIONS.md); not fixed, because reordering test phases risks unaudited effects on Phases C/D that were not part of this pass's scope.
2. **No log-file sink exists** for `SHADOWBID_LOG_PATHS` to point at — the privacy test's log-content check is correctly implemented (fails, doesn't vacuously pass, when unset) but there is nothing valid to configure it with in this template.
3. **The coordinator CLI is a minimal reference implementation**, not a hardened service: no multi-party signoff, no rate limiting, no audit trail beyond the file store, no protection against a compromised or malicious decision-file source. Before pointing it at a real `settlementSigner` key on any non-test network, it needs its own dedicated security review — exactly as the first pass's report already flagged for "whatever process eventually holds this key."
4. **`@nomicfoundation/hardhat-ignition`'s missing symlink is a `node_modules` state repair**, not a code or lockfile fix — it will not persist to a fresh clone or a fresh `bun install` in a different environment. If this exact error recurs elsewhere, the fix is the same manual symlink (see DECISIONS.md), not a dependency version change.

## Privacy guarantees and limitations (this pass)

**Newly verified, not just newly claimed:** `bun run test`'s Phase B now actually executes `/api/auctions` and `/api/shadowbid/service-state` against a real PGLite-backed database (previously these queries never successfully ran against a real connection due to the two SQL bugs fixed this pass) — the "ShadowBid API output does not disclose private bid fields" and "ShadowBid database state has no private bid columns or values" checks are genuine runtime passes now, not the static-only evidence the first pass had to rely on.

**Still limitations:** the browser-output and configured-logs privacy checks remain unexercised for the pre-existing reasons above (blockers 1–2) — this pass improved the privacy runtime-verification coverage from "database and API only, statically reasoned" to "database and API, genuinely runtime-verified," not to full coverage of every documented check.
