import { main, suspend } from "effection";
import { createNewBatcher, FileStorage, type BatcherConfig } from "@effectstream/batcher-sdk";
import { createEffectstreamL2Adapter } from "./effectstream-l2.ts";
import { createMidnightBalancingAdapter } from "./midnight-balancing.ts";
import {
  DurableReplayGuard,
  ShadowBidSettlementAdapter,
  type AuthoritativeSettlementReader,
} from "./shadowbid-settlement.ts";
import { buildAuthoritativeSettlementReader } from "./shadowbid-coordinator-wiring.ts";

const batchIntervalMs = 1000;
const port = Number(process.env.BATCHER_PORT ?? "3334");

const paimaL2 = createEffectstreamL2Adapter({
  chainId: 31337,
  contractModule: "PaimaL2ContractModule#MyPaimaL2Contract",
  privateKey: process.env.EVM_PRIVATE_KEY ??
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  fee: 0n,
  syncProtocolName: "mainEvmRPC",
});

const midnight = createMidnightBalancingAdapter({
  syncProtocolName: "parallelMidnight",
});

// Fails closed unless SHADOWBID_COORDINATOR_RESULTS_DIR, SHADOWBID_EVM_CHAIN_ID,
// SHADOWBID_EVM_AUCTION_CONTRACT, and SHADOWBID_SETTLEMENT_SIGNER are all set
// (see shadowbid-coordinator-wiring.ts). This deployment also has no live
// Midnight ledger connection wired in, so the reader stays unavailable even
// when those variables are set; the EffectStream API/database is intentionally
// never used as this reader (docs/DECISIONS.md).
const unavailableSettlementReader: AuthoritativeSettlementReader = {
  async getSettlementReadyState() { return null; },
};
const shadowbid = new ShadowBidSettlementAdapter(
  midnight,
  buildAuthoritativeSettlementReader() ?? unavailableSettlementReader,
  new DurableReplayGuard("./batcher-data"),
);

const config: BatcherConfig = {
  pollingIntervalMs: batchIntervalMs,
  adapters: { paimaL2, shadowbid },
  // Omitted targets must reach the strict ShadowBid adapter and be rejected;
  // unrelated Paima L2 input callers must name `paimaL2` explicitly.
  defaultTarget: "shadowbid",
  namespace: "",
  batchingCriteria: {
    paimaL2: { criteriaType: "time", timeWindowMs: batchIntervalMs },
    shadowbid: { criteriaType: "time", timeWindowMs: batchIntervalMs },
  },
  confirmationLevel: "wait-effectstream-processed",
  enableHttpServer: true,
  enableEventSystem: true,
  port,
};

const storage = new FileStorage("./batcher-data");
const batcher = createNewBatcher(config, storage);

main(function* () {
  console.log("Starting EVM Midnight Template Batcher...");

  try {
    batcher.addStateTransition("startup", ({ publicConfig }) => {
      const banner =
        `EVM Midnight Template Batcher startup - polling every ${publicConfig.pollingIntervalMs} ms\n` +
        `      | Default Target: ${publicConfig.defaultTarget}\n` +
        `      | Blockchain Adapter Targets: ${
          publicConfig.adapterTargets.join(", ")
        }\n` +
        `      | Batching Criteria: ${
          Object.entries(publicConfig.criteriaTypes).map(([target, type]) =>
            `${target}=${type}`
          ).join(", ")
        }\n`;
      console.log(banner);
    });

    batcher.addStateTransition("http:start", ({ port }) => {
      const publicConfig = batcher.getPublicConfig();
      const httpInfo = `HTTP Server ready\n` +
        `      | URL: http://localhost:${port}\n` +
        `      | Confirmation: ${publicConfig.confirmationLevel}\n` +
        `      | Events Enabled: ${publicConfig.enableEventSystem}\n` +
        `      | Polling: ${publicConfig.pollingIntervalMs} ms`;
      console.log(httpInfo);
    });

    yield* batcher.runBatcher();
  } catch (error) {
    console.error("Batcher error:", error);
    yield* batcher.gracefulShutdownOp();
  }

  yield* suspend();
});
