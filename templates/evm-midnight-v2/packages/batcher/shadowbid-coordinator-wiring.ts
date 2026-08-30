import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import type { AuthoritativeSettlementReader } from "./shadowbid-settlement.ts";
import {
  createEip712AuthoritativeReader,
  FileCoordinatorResultStore,
  type MidnightAuctionStateReader,
} from "./shadowbid-coordinator.ts";
import { LiveMidnightAuctionStateReader } from "./shadowbid-midnight-reader.ts";

/**
 * Reads deployment configuration from the environment and builds the real
 * `AuthoritativeSettlementReader`, or returns `undefined` if any required
 * variable is absent. Both batcher entrypoints fall back to an
 * unconditionally-fail-closed reader when this returns `undefined`, so an
 * unconfigured deployment behaves exactly as before this change.
 *
 * `SHADOWBID_SETTLEMENT_SIGNER` must equal the address passed to
 * `ShadowBidAuction`'s constructor for the deployed contract; a mismatch here
 * would make this reader reject every real coordinator signature, not accept
 * a wrong one, because verification checks the signature against this exact
 * configured address.
 *
 * The Midnight indexer connection defaults to `midnightNetworkConfig`
 * (`MIDNIGHT_INDEXER_HTTP`/`MIDNIGHT_INDEXER_WS`/`MIDNIGHT_NETWORK_ID`, the
 * same env vars and localhost defaults `packages/node/config.dev.ts` already
 * uses) rather than a separate SHADOWBID_-prefixed variable, so a deployment
 * that already points its indexer somewhere for the node/sync stack does not
 * need to configure it twice. Pass `ledgerReader` explicitly (tests do) to
 * override.
 */
export function buildAuthoritativeSettlementReader(
  coordinatorResultsDir = process.env.SHADOWBID_COORDINATOR_RESULTS_DIR,
  evmChainId = process.env.SHADOWBID_EVM_CHAIN_ID,
  evmAuctionContract = process.env.SHADOWBID_EVM_AUCTION_CONTRACT,
  settlementSigner = process.env.SHADOWBID_SETTLEMENT_SIGNER,
  ledgerReader: MidnightAuctionStateReader | undefined = new LiveMidnightAuctionStateReader({
    indexerQueryUrl: midnightNetworkConfig.indexer,
    indexerSubscriptionUrl: midnightNetworkConfig.indexerWS,
  }, (failure) => console.warn("[shadowbid] Midnight ledger read failed:", failure)),
): AuthoritativeSettlementReader | undefined {
  if (!coordinatorResultsDir || !evmChainId || !evmAuctionContract || !settlementSigner || !ledgerReader) return undefined;

  const store = new FileCoordinatorResultStore(coordinatorResultsDir);
  return createEip712AuthoritativeReader({
    domain: {
      name: "ShadowBidAuction",
      version: "1",
      chainId: BigInt(evmChainId),
      verifyingContract: evmAuctionContract as `0x${string}`,
    },
    expectedSigner: settlementSigner as `0x${string}`,
    ledgerReader,
    getSignedResult: (auctionId) => store.read(auctionId),
  });
}
