# Agent handoff

Last reviewed: 2026-08-30, second pass (shadowbid/claude-settlement).

Start from [`SETUP_STATUS.md`](SETUP_STATUS.md), whose reference-stack facts are preserved. This pass completed the operational settlement path that the first pass on this branch (commit `7cd6a36c`) left structurally ready but not wired: a real live Midnight ledger reader, a runnable trusted-coordinator CLI, and repairs to five separate pre-existing environment/build bugs that were blocking validation. All changes stayed inside `templates/evm-midnight-v2`; no Compact, Solidity, or EffectStream primitive/reducer source semantics changed (the Compact *compile mode* changed — see below — but not the `.compact` source).

## What's operational now

- **Live Midnight reads**: `packages/batcher/shadowbid-midnight-reader.ts`'s `LiveMidnightAuctionStateReader` is a real `MidnightAuctionStateReader`, backed by the actual `@midnight-ntwrk/midnight-js-indexer-public-data-provider` client and the generated `ShadowBidContract.ledger()` decoder — the same pattern the frontend already uses for the Counter reference contract. It's wired into both batcher entrypoints by default (`shadowbid-coordinator-wiring.ts`) whenever the four `SHADOWBID_*` environment variables are set.
- **Trusted coordinator**: `packages/batcher/shadowbid-coordinator-cli.ts` (run via `bun run coordinator <decision.json>` from `packages/batcher/`) takes an explicit, human/upstream-supplied decision (winner, amount, commitment, all domain fields), validates it against live Midnight ledger state (`shadowbid-coordinator-core.ts`'s `validateCoordinatorDecision`), and — only if valid — signs it and writes it via the existing `FileCoordinatorResultStore`. It never inspects private bid data and never guesses a winner.
- **End to end**: coordinator CLI → `FileCoordinatorResultStore` → batcher's `createEip712AuthoritativeReader` → `ShadowBidSettlementAdapter.validateInput` is now a real, connected chain, exercised in `shadowbid-coordinator-core.test.ts`'s end-to-end tests (real file I/O, real EIP-712 signing/verification, no mocked SDK behavior for the parts under test).
- **Full local stack**: `bun run test` now progresses from "cannot compile EVM contracts" (the state at the start of this pass) all the way to **29/31 assertions passing**, including real EVM contract deployment via Ignition, real Compact contract deployment with real ZK proving keys, real cross-chain ERC721 mint/transfer/sync tests, and (after two SQL bug fixes) real `/api/auctions` and `/api/shadowbid/service-state` responses. `bun run --cwd packages/frontend build` now succeeds completely (previously failed on a missing deployed-address manifest).

## Bugs found and fixed this pass (see docs/DECISIONS.md for full mechanism on each)

1. `shadowbid-primitive.test.ts` — duplicate `PrimitiveRegistry` instance name across two tests (test-isolation bug, not a library bug).
2. `LiveMidnightAuctionStateReader`'s original catch clause only handled `IndexerError`, letting a raw `TypeError` from a genuinely unreachable indexer crash past the fail-closed guarantee. Found via a real (not mocked) connection to an unbound port.
3. Missing `addressToBytes32` EVM-address-to-`Bytes<32>` encoding in the domain check — the original comparison could never match a real 20-byte EVM address against the 32-byte Midnight ledger field.
4. A missing `@nomicfoundation/hardhat-ignition` symlink in this worktree's `node_modules` (present for its siblings, absent for itself) was the real cause of the previously-reported missing-module error — not a lockfile/version issue. Repaired with a manual symlink (does not persist to a fresh install; repeat if it recurs elsewhere).
5. `ShadowBidAuctionModule`'s Ignition return key (`{auction}` vs. the repo-wide `{contract}` convention) was silently breaking `deploy.ts`'s shared logging for the ShadowBid deployment specifically.
6. Two independent bugs in `shadowbid.queries.ts`'s hand-rolled `prepared()` shim (an off-by-one in computed parameter-location offsets, and a regex that mismatched PostgreSQL `::type` casts as named parameters) — both were invisible until a real database connection executed these queries for the first time in this pass.
7. `contract-shadowbid`'s Compact compile does not actually need `--skip-zk` in this environment; a real compile with proving keys completes in under 20 seconds once warm. Made the default; kept `--skip-zk` as an explicit fallback script.
8. `.gitignore` never excluded `contract-shadowbid`'s generated output (only its `contract-round-value` sibling), a real risk once real proving keys started being generated. Fixed.

## Known remaining gaps (all pre-existing, precisely diagnosed, not fabricated around)

- `packages/tests/run-tests.ts` runs the ShadowBid privacy test's browser check (Phase B) before the frontend is built/started (Phase E) — a test-ordering bug in the existing suite structure. Not fixed here: reordering test phases risks unaudited effects on the cross-chain tests in between.
- `SHADOWBID_LOG_PATHS`-based log-content privacy checking has no logging subsystem behind it anywhere in this template to actually point the variable at.
- No coordinator-decision authorization beyond "holds the private key" — the CLI is a minimal reference implementation of the already-documented trust boundary, not a hardened production service; a real deployment should add its own review of whatever process feeds it decisions.

## Next action

If further hardening is wanted: (1) fix `run-tests.ts`'s phase ordering so the ShadowBid privacy browser/log checks run after Phase E, after auditing what else might depend on the current order; (2) add a real log-file sink so `SHADOWBID_LOG_PATHS` has something legitimate to check; (3) review and harden the coordinator CLI's input/authorization model before pointing it at a real `settlementSigner` key on any non-test network. See docs/CLAUDE_SETTLEMENT_REPORT.md for exact commands, environment variables, and launch instructions.
