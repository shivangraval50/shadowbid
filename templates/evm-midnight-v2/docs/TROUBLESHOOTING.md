# Troubleshooting

## Compiler version

Use Compact `0.33.0-rc.2` and verify the SHA-256 shown in [`SETUP_STATUS.md`](SETUP_STATUS.md). The catalog may not list this archived official build.

## First launch is slow or memory-heavy

The frontend bundle includes ledger/WASM and wallet dependencies. The configured build uses a 4096 MB Node heap; allow several minutes on an 8 GB Mac.

## Service URLs

Frontend `10599`, EffectStream API `9999`, batcher `3334`, EVM RPC `8545`, Midnight node `9944`, indexer `8088`, proof server `6300`, PGLite `5432`.

## No auctions appear

The dashboard is read-only. It will show an empty state until a ShadowBid `AuctionCreated` event is indexed. The current dev launcher does not wire the ShadowBid Midnight deployment into the sync path, so do not expect a complete ShadowBid lifecycle from `bun run dev`.

## Settlement requests are rejected

This is expected in the current dev configuration: `unavailableSettlementReader` returns `null`, so the batcher fails closed. Wire a finalized EVM/Midnight/result-authority reader before enabling settlement.

## Tests

Run the commands in [`TEST_MATRIX.md`](TEST_MATRIX.md). The recorded reference suite was 41/41, but the ShadowBid Compact test currently exposes the two-slot/three-bid mismatch.
