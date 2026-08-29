# Test matrix

| Area | Evidence | Status |
| --- | --- | --- |
| Reference infrastructure | `bun run test` baseline recorded as 41/41 in `SETUP_STATUS.md` | Passed on recorded baseline |
| EVM contract | `packages/contracts-evm/test/src/ShadowBidAuction.t.sol` covers escrow/cancel, timeout, signed settlement, replay, domains, payment, authorization, and three recorded commitments | Present; run Forge build/tests before submission |
| Compact privacy boundary | `shadowbid.contract.test.ts` checks persistent commitments, no salt disclosure, lifecycle circuits, and expects a third slot | Fails/incomplete because source has only slots 0/1 |
| Reducer | `packages/node/shadowbid.test.ts` covers readiness, replay/order convergence, terminal precedence, invalid lifecycle, canonical keys | Present |
| Primitive privacy | `packages/node/shadowbid-primitive.test.ts` checks public facts and ABI field boundary | Present |
| Batcher | `packages/batcher/shadowbid-settlement.test.ts` covers canonical envelopes, rejection cases, authoritative readiness, and durable replay | Present |
| Integration privacy | `packages/tests/stm/shadowbid-privacy.test.ts` checks API, DB columns/values, browser output, and configured logs | Present in suite; does not prove cryptographic secrecy |
| Full cross-chain/UI | `packages/tests/run-tests.ts` includes infra, DB/API, EVM cross-chain, frontend build/render/wallet tests | Reference path passes 41/41; no complete ShadowBid write/settle flow |

```sh
bun run build:midnight
bun run build:evm
bun run --cwd packages/frontend build
bun run test
```
