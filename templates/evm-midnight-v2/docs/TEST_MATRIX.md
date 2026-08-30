# Test matrix

| Area | Evidence | Status |
| --- | --- | --- |
| EVM contract | `packages/contracts-evm/test/src/ShadowBidAuction.t.sol` covers escrow/cancel, timeout, signed settlement, replay, domains, payment, authorization, and three recorded commitments | **Passed: 8/8** (`forge test --match-contract ShadowBidAuctionTest`), unchanged |
| Compact privacy boundary | `shadowbid.contract.test.ts` checks persistent commitments, no salt disclosure, lifecycle circuits, and the third slot; asserts exactly 8 circuits and no `publish_coordinator_result` | **Passed: 4/4**; now compiled with real ZK proving/verifier keys by default (was `--skip-zk`; see BUILD_STATUS.md) |
| Reducer | `packages/node/shadowbid.test.ts` covers readiness, replay/order convergence, terminal precedence, invalid lifecycle, canonical keys | **Passed: 5/5**, unchanged |
| Primitive privacy | `packages/node/shadowbid-primitive.test.ts` checks public facts and ABI field boundary | **Passed: 6/6** (fixed the pre-existing `PrimitiveRegistry` duplicate-instanceName isolation failure; added a regression test for it) |
| Batcher: envelope/replay | `packages/batcher/shadowbid-settlement.test.ts` covers canonical envelopes, rejection cases, authoritative readiness, and durable replay | **Passed: 6/6**, unchanged |
| Batcher: coordinator authentication | `packages/batcher/shadowbid-coordinator.test.ts` — valid three-bidder settlement (only winner+amount public), forged coordinator result, non-coordinator signer, wrong Midnight network/contract domain, wrong EVM chain/contract domain, premature and expired results, missing Midnight ledger state, missing signed result, unknown/uncommitted commitment, digest determinism, sign/verify round-trip, `toHexLedgerState`, **new:** `addressToBytes32` encoding | **Passed: 18/18** (17 from the prior pass + 1 new) |
| **New:** Batcher: live Midnight reader | `packages/batcher/shadowbid-midnight-reader.test.ts` — indexer unavailable (real connection to an unbound port, not mocked), invalid contract-address format, missing contract (`queryContractState` → `null`), malformed/undecodable state | **Passed: 4/4** |
| **New:** Batcher: coordinator core (validate/sign) | `packages/batcher/shadowbid-coordinator-core.test.ts` — accepts a valid decision; rejects zero-address winner and non-positive amount; rejects non-future and unreasonably-far-future expiry; fails closed when Midnight state is unavailable; rejects unregistered auction and commitments-not-closed; rejects domain mismatch (Midnight contract, Midnight network, EVM chain id, EVM auction contract); rejects unknown commitment; rejects premature (deadline not elapsed) and expired (past settlement deadline) decisions; signs a verifiable EIP-712 result; **end-to-end**: validate → sign → real `FileCoordinatorResultStore` file → `createEip712AuthoritativeReader` reaches `SETTLEMENT_READY`; a wrong-key-signed decision never reaches `SETTLEMENT_READY` even after passing validation | **Passed: 11/11** |
| Integration privacy | `packages/tests/stm/shadowbid-privacy.test.ts` checks API, DB columns/values, browser output, and configured logs | API and DB checks **now pass** for the first time (see SQL bug fixes in DECISIONS.md); browser and log checks remain blocked on pre-existing test-ordering/logging-infrastructure gaps (see BUILD_STATUS.md "Not complete") |
| Full cross-chain/UI | `packages/tests/run-tests.ts` includes infra, DB/API, EVM cross-chain, frontend build/render/wallet tests | **29/31 passed** (was 0 reachable at the start of this pass — the suite could not get past `compile-evm-contracts-forge`). Remaining 2 failures are the pre-existing browser-ordering and log-path gaps above. |

## Commands run for this pass, exact results

```sh
# Repair (see BUILD_STATUS.md item 4 — a node_modules symlink repair, not a manifest/lockfile change)
ln -s ../../../../node_modules/.bun/@nomicfoundation+hardhat-ignition@3.0.2+<hash>/node_modules/@nomicfoundation/hardhat-ignition \
  packages/contracts-evm/node_modules/@nomicfoundation/hardhat-ignition

bun install                                                       # no changes beyond prior pass's lockfile state
bun install --force                                               # confirms the symlink gap is reproducible, not stale-cache
bun install --frozen-lockfile                                     # exit 0, no changes (validates the committed lockfile)

bun run build:midnight                                            # exit 0; now real ZK keys, 19.5s
bun run --cwd packages/contracts-evm build                        # exit 0 (lint warnings only, pre-existing)
forge test --match-contract ShadowBidAuctionTest -vv              # 8 passed, 0 failed
bun run --cwd packages/contracts-midnight/contract-shadowbid test # 4 passed, 0 failed

bun test packages/batcher/ packages/node/shadowbid.test.ts packages/node/shadowbid-primitive.test.ts
                                                                   # 45 passed, 0 failed, 106 expect() calls, across 6 files

bun run --cwd packages/frontend build                             # exit 0 — PASSES for the first time this branch
bun run test                                                      # 29 passed, 2 failed (pre-existing gaps; see above) — PROGRESSES for the first time past compile
```

Port ownership was checked (`lsof -nP -iTCP:5432,8545,9944,8088,6300,3334,9999,10599,4747 -sTCP:LISTEN`) before every `bun run test` invocation; no listeners were found before any run, and none remained after each run's orchestrator shutdown — no process belonging to another worktree was ever at risk of being touched.

## Final validation update — 2026-08-30

- Integration privacy: API, database, captured-log, and live-browser checks all pass in the appropriate lifecycle phases.
- Final full orchestrated run: `bun run test` exits **0** with **35/35 core assertions plus 6/6 wallet/browser assertions passing (41 total checks)**.
- Current ShadowBid wallet/registry browser smoke also passes **6/6** independently.
- Persistent launch: all critical services remained healthy; real browser load succeeded with zero console errors.
- Reproducibility: `bun install --frozen-lockfile` passes with Hardhat Ignition declared directly.
