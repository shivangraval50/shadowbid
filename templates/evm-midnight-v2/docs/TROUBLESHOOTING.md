# Troubleshooting

## Compiler and install

Use Compact `0.33.0-rc.2` with the coupled SDK/runtime versions recorded in [`SETUP_STATUS.md`](SETUP_STATUS.md). If the manager catalog cannot resolve the archived build, follow the official archive and SHA-256 procedure in that file. Use `bun install --frozen-lockfile`; the template declares Hardhat Ignition directly.

## First launch is slow or memory-heavy

The frontend bundle includes ledger/WASM and wallet dependencies. The configured build uses a 4096 MB Node heap; allow several minutes on an 8 GB Apple Silicon Mac. Keep at least 5 GiB free for Midnight data and proving artifacts.

## Service URLs

| Service | URL/port |
| --- | --- |
| Frontend | `http://127.0.0.1:10599/` |
| EffectStream API/sync | `http://127.0.0.1:9999` |
| Batcher | `http://127.0.0.1:3334` |
| EVM JSON-RPC | `http://127.0.0.1:8545` |
| Midnight node | `http://127.0.0.1:9944` |
| Midnight indexer | `http://127.0.0.1:8088` |
| Midnight proof server | `http://127.0.0.1:6300` |
| PGLite | `127.0.0.1:5432` |

## No auctions appear

The current dashboard is read-only. It shows an empty state until a ShadowBid `AuctionCreated` event is indexed. The dev stack validates public deployment/projection infrastructure; it does not create a complete auction lifecycle or fabricate sample bids.

## Settlement requests are rejected

This is expected unless the opt-in coordinator path is configured. Both batcher entrypoints fail closed when any required variable is missing. For a configured reference handoff, supply `SHADOWBID_COORDINATOR_RESULTS_DIR`, `SHADOWBID_EVM_CHAIN_ID`, `SHADOWBID_EVM_AUCTION_CONTRACT`, and `SHADOWBID_SETTLEMENT_SIGNER`; the coordinator also requires `SHADOWBID_COORDINATOR_PRIVATE_KEY`. The live reader checks public Midnight state, while the coordinator still makes the trusted out-of-band winner decision.

This path authenticates a signer; it does not prove that the winner is the maximum bid. EVM does not directly verify a Midnight ZK winner-computation proof, and EffectStream is not settlement authority.

## Privacy expectations

Commitment hashes and metadata are public. Amounts, salts, openings, and losing bid values must not appear in public events, EffectStream state, database/API output, browser output, or logs covered by the tests. Winner identity and winning amount become public after settlement. Do not log private witness inputs while debugging.

## Tests and warnings

Run the commands in [`TEST_MATRIX.md`](TEST_MATRIX.md). The final recorded suite is 41/41 orchestrated checks, 45/45 focused batcher/node checks, 8/8 Forge, 4/4 Compact, and 6/6 browser smoke. Non-fatal warnings include local Midnight peer policy, slow operations under build load, duplicate Polkadot versions, and large frontend bundles.
