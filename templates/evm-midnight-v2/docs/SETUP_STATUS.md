# Local setup status

Last validated: 2026-08-29 on macOS 15.3.2 (24D81), Apple Silicon arm64, 8 GB RAM.

## Repository checkpoint

- Repository: `effectstream/effectstream`, template `templates/evm-midnight-v2`
- Branch: `v-next`
- Untouched baseline commit recorded before changes: `7bbd6709647f55a65912185a4046e358c93143a5`
- No ShadowBid code has been added.

## Installed tools

- Bun 1.4.0
- Node.js 22.23.1
- Foundry/Forge 1.8.1
- Compact manager 0.5.2
- Compact compiler selection `0.33.0-rc.2`: compiler 0.33.0, language 0.25.0, ledger `ledger-9.1.0.0-rc.3`, runtime 0.18.0-rc.1
- Docker client 24.0.7 (darwin/arm64); the daemon is not running and is not required for the native macOS launch path used by this template.

The existing Bun and Foundry binaries were exposed through `~/.local/bin` so the orchestrator can resolve `bun`, `bunx`, `forge`, `anvil`, `cast`, `chisel`, and `solar` from the normal shell path.

## Coupled dependency set retained

The compiler pin was not changed in isolation. The template's intended prerelease dependency set is retained:

- EffectStream packages and native wrappers: 0.200.1
- `@midnight-ntwrk/compact-runtime`: 0.18.0-rc.1
- `@midnight-ntwrk/compact-js`: 2.5.5-rc.7
- `@midnight-ntwrk/midnight-js-*`: 5.0.0-beta.6
- `@midnightntwrk/ledger-v9`: 1.0.0-rc.3
- `@midnightntwrk/onchain-runtime-v4`: 4.0.0-rc.3
- PGLite resolved version: 0.3.16
- Midnight node binary: 2.0.0-rc.4
- Midnight indexer binary: 4.4.0-rc.1
- Midnight proof server binary: 9.0.0-rc.5

## Diagnosis and changes

1. The Compact manager's current catalog does not list `0.33.0-rc.2`, but the exact compiler is an official immutable LFDT-Minokawa prerelease. The correct fix is option A: install the archived exact build, preserving the template's ledger-v9/runtime coupling.
2. Installed the official `aarch64-darwin` archive under `~/.compact/versions/0.33.0-rc.2/aarch64-darwin`. Verified SHA-256: `35a28009c9a57d20902e4fcfd12f0ca9ea94338208954cf8bcd335652e24f382`.
3. Added a Bun patch for `graphql-tag@2.12.7` so its CommonJS entry does not synchronously require GraphQL 17's ESM entry under Bun 1.4.0. The patch is committed as `patches/graphql-tag@2.12.7.patch` and registered in the root template package manifest/lockfile.
4. Updated the frontend to use the installed wallet SDK's exported `TransactionHistoryEntryCommonSchema` name.
5. Set the frontend Vite builds to a 4096 MB JavaScript heap. The default heap exhausted memory while rendering this template's 8,900-module/ledger-WASM bundle on an 8 GB Mac.
6. Applied the same heap setting to the frontend integration build-smoke test because it invokes Vite directly instead of using the package build script.

No EffectStream, Midnight SDK, ledger, runtime, node, indexer, proof-server, or Compact compiler version was upgraded or downgraded.

## Reproducing the archived compiler install

The manager currently cannot fetch this prerelease by version name. On Apple Silicon, download the official asset:

```sh
curl -fL -o /tmp/compactc.zip https://github.com/LFDT-Minokawa/compact/releases/download/compactc-v0.33.0-rc.2/compactc_v0.33.0-rc.2_aarch64-darwin.zip
openssl dgst -sha256 /tmp/compactc.zip
mkdir -p "$HOME/.compact/versions/0.33.0-rc.2/aarch64-darwin"
ditto -x -k /tmp/compactc.zip "$HOME/.compact/versions/0.33.0-rc.2/aarch64-darwin"
compact compile +0.33.0-rc.2 --version
```

The digest must exactly match the value above before extracting.

## Validated commands

```sh
bun install --frozen-lockfile
bun run build:midnight
bun run build:evm
bun run --cwd packages/frontend build
bun run test
bun run dev
```

Validated service endpoints/listeners:

- PGLite: TCP 5432
- EVM JSON-RPC: 8545 (`eth_chainId` returned `0x7a69`)
- Midnight node JSON-RPC: 9944 (`system_health` reported synchronized, local-dev peer policy)
- Midnight indexer GraphQL: 8088 (GraphQL introspection returned HTTP 200)
- Midnight proof server: 6300 (HTTP 200 and successful `/prove` calls)
- EffectStream API/sync: 9999
- Batcher: 3334
- Frontend: http://127.0.0.1:10599 (HTTP 200)

## Warnings that remain non-fatal

- The isolated development Midnight node periodically logs `No known peers`; `system_health` reports `shouldHavePeers: false` and `isSyncing: false`.
- The indexer can log slow SQLite statements on this 8 GB machine while Vite is building.
- Foundry emits lint warnings in reference contracts.
- Rollup removes several dependency `PURE` annotations and warns about `eval` in browser shims; the build succeeds.
- The frontend bundle is large because it contains ledger/on-chain WASM and wallet dependencies.
- Bun/Node warn that `NO_COLOR` is ignored when the orchestrator sets `FORCE_COLOR`.
- Some Midnight clients log WebSocket `1000 Normal Closure` while disposing short-lived connections.

## Disk-capacity resolution

The complete integration suite passed **41 tests with 0 failures**, including frontend rendering and wallet-modal behavior. During that run, macOS briefly fell below the Midnight node's 512 MiB storage-monitor threshold. An inspect-only audit followed by the user-approved low-risk cleanup removed npm/npx, Bun, pip, Homebrew, VS Code update, and JetBrains log caches. Free space was subsequently verified at **13 GiB**, so the host-capacity blocker is resolved. Approximately 5.8 MiB of legacy root-owned npm cache content was deliberately left untouched; no `sudo` was used.

## Successful launch

From this template directory, the exact launch command is:

```sh
bun run dev
```

Wait for `Server listening on http://127.0.0.1:10599`, then open http://127.0.0.1:10599. The first launch performs two frontend production builds and can take several minutes on this machine.

## Persistent reference-stack validation — 2026-08-29

The untouched EVM + Midnight reference application was launched with `bun run dev` and left running through both frontend builds and an extended observation period. All eight expected TCP listeners remained present: PGLite 5432, Anvil 8545, Midnight node 9944, indexer 8088, proof server 6300, batcher 3334, EffectStream 9999, and frontend 10599.

- Midnight `system_health`: `isSyncing: false`, `shouldHavePeers: false`.
- Indexer GraphQL and proof-server health endpoints: HTTP 200.
- EffectStream health: `status: ok`; database failure counters remained zero; all three protocols (`mainNtp`, `mainEvmRPC`, `parallelMidnight`) remained `ok` with zero producer errors/restarts.
- EffectStream advanced from startup through at least finalized block 1,868 while tracking Midnight block 315.
- Batcher OpenAPI documentation and frontend root: HTTP 200.
- The in-app browser loaded `http://127.0.0.1:10599/`, rendered the complete “Midnight/EVM” example UI, and its live block indicator advanced to 1,804. Browser console warnings/errors: none.
- No service exited and no fatal error appeared during the persistent run. The stack was left running after validation.
- Disk headroom after startup/builds: approximately 10 GiB free.

The earlier full suite remains green at **41/41 tests**, and both Compact/Midnight and Forge/EVM builds pass. The only observed runtime warnings are the non-blocking items documented above, plus duplicate `@polkadot/util` version diagnostics from the reference dependency graph and occasional local-node trie-cache/indexer slow-operation warnings under build load.

## ShadowBid persistent validation — 2026-08-30

- Branch: `shadowbid-build`; implementation/test-infrastructure checkpoint: `8cb92fbe` (including merged Claude commits `7cd6a36c` and `e9095e43`).
- Architecture remains the intended trusted-coordinator reference model: live Midnight ledger reads and EIP-712 coordinator authentication are implemented; winner/amount correctness is not represented as a trustless proof.
- `bun install --frozen-lockfile` succeeds. `@nomicfoundation/hardhat-ignition` is now a direct exact dependency, eliminating the non-reproducible `node_modules` symlink repair.
- The final complete `bun run test` rerun exits **0**: **35/35 core registered assertions plus 6/6 wallet/browser assertions pass (41 total checks)**. The stale legacy wallet selector was updated to the current ShadowBid wallet/registry UI and verified both narrowly and in full orchestration.
- Persistent `bun run dev` validation ran for more than five minutes. PGLite, Hardhat/EVM, Midnight node, indexer, proof server, EffectStream sync, batcher, and frontend all remained running. EffectStream advanced beyond finalized block 200 with all protocol states `ok` and zero database/producer error counters.
- Midnight `system_health`: `isSyncing: false`, `shouldHavePeers: false`. Proof server and EffectStream health: `status: ok`. Frontend: HTTP 200.
- The in-app browser loaded `http://127.0.0.1:10599/`, rendered the ShadowBid header, operational status, auction registry, and privacy model, with zero browser console errors.
- The stack was shut down through the orchestrator API after validation; `bun run dev` reports exit 1 only for that intentional API-triggered shutdown.

Exact successful launch command: `bun run dev`
Local frontend URL: `http://127.0.0.1:10599/`
