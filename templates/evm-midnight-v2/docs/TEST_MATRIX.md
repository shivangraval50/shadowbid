# Test matrix

| Area | Evidence | Status |
| --- | --- | --- |
| Reference infrastructure | `bun run test` baseline recorded as 41/41 in `SETUP_STATUS.md` | Not rerun this pass (see "Full cross-chain/UI" below) |
| EVM contract | `packages/contracts-evm/test/src/ShadowBidAuction.t.sol` covers escrow/cancel, timeout, signed settlement, replay, domains, payment, authorization, and three recorded commitments | **Passed: 8/8** (`forge test --match-contract ShadowBidAuctionTest`), unchanged by this update |
| Compact privacy boundary | `shadowbid.contract.test.ts` checks persistent commitments, no salt disclosure, lifecycle circuits, and the third slot; asserts exactly 8 circuits and no `publish_coordinator_result` | **Passed: 4/4** (`bun run --cwd packages/contracts-midnight/contract-shadowbid test`); compiled with `--skip-zk` (unchanged), full proving-key generation not attempted to completion (see BUILD_STATUS.md) |
| Reducer | `packages/node/shadowbid.test.ts` covers readiness, replay/order convergence, terminal precedence, invalid lifecycle, canonical keys | **Passed: 5/5**, unchanged by this update |
| Primitive privacy | `packages/node/shadowbid-primitive.test.ts` checks public facts and ABI field boundary | 4/5 passed; 1 pre-existing failure (`PrimitiveRegistry` singleton rejects a duplicate `instanceName: "midnight"` reused across two test cases in the same file) unrelated to and not introduced by this change |
| Batcher: envelope/replay | `packages/batcher/shadowbid-settlement.test.ts` covers canonical envelopes, rejection cases, authoritative readiness, and durable replay | **Passed: 6/6** (updated: the old "fails closed while the circuit is disabled" test is replaced with real accept/reject assertions now that `validateInput` calls a real reader) |
| **New:** Batcher: coordinator authentication | `packages/batcher/shadowbid-coordinator.test.ts` — valid three-bidder settlement (only winner+amount public), forged coordinator result, non-coordinator signer, wrong Midnight network/contract domain, wrong EVM chain/contract domain, premature (commitments not closed) and expired (`expiry<=0`) results, missing Midnight ledger state, missing signed result, unknown/uncommitted commitment, digest determinism, direct sign/verify round-trip, `toHexLedgerState` adapter correctness | **Passed: 17/17** |
| Integration privacy | `packages/tests/stm/shadowbid-privacy.test.ts` checks API, DB columns/values, browser output, and configured logs | Present in suite; 0 tests executed standalone (exports the integration function for `run-tests.ts` only, unchanged); does not prove cryptographic secrecy |
| Full cross-chain/UI | `packages/tests/run-tests.ts` includes infra, DB/API, EVM cross-chain, frontend build/render/wallet tests | **Blocked**, pre-existing and unrelated to this change: `deploy-evm-contracts` fails with `Cannot find module '@nomicfoundation/hardhat-ignition/modules'` (dependency-resolution gap in the installed tree) before any chain is deployed; `packages/frontend build` separately fails needing a deployed local chain's address manifest |

## Commands run for this change (packages/batcher/, exact results)

```sh
bun install                                                     # not frozen: added viem@2.37.3 (already pinned elsewhere in the lockfile) as an explicit batcher dependency
bun run build:midnight                                          # exit 0
bun run --cwd packages/contracts-evm build                      # exit 0 (lint warnings only, pre-existing)
forge test --match-contract ShadowBidAuctionTest -vv             # 8 passed, 0 failed
bun run --cwd packages/contracts-midnight/contract-shadowbid test   # 4 passed, 0 failed
bun test packages/batcher/shadowbid-settlement.test.ts packages/batcher/shadowbid-coordinator.test.ts packages/node/shadowbid.test.ts
                                                                  # 23 passed, 0 failed, 54 expect() calls
bun run --cwd packages/frontend build                            # FAILED: pre-existing, needs a deployed local chain (see BUILD_STATUS.md)
bun run test                                                      # FAILED: pre-existing, missing @nomicfoundation/hardhat-ignition/modules during deploy (see BUILD_STATUS.md)
```
