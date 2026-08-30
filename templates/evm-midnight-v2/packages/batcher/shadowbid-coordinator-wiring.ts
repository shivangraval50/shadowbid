import type { AuthoritativeSettlementReader } from "./shadowbid-settlement.ts";
import {
  createEip712AuthoritativeReader,
  FileCoordinatorResultStore,
  type MidnightAuctionStateReader,
} from "./shadowbid-coordinator.ts";

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
 */
export function buildAuthoritativeSettlementReader(
  coordinatorResultsDir = process.env.SHADOWBID_COORDINATOR_RESULTS_DIR,
  evmChainId = process.env.SHADOWBID_EVM_CHAIN_ID,
  evmAuctionContract = process.env.SHADOWBID_EVM_AUCTION_CONTRACT,
  settlementSigner = process.env.SHADOWBID_SETTLEMENT_SIGNER,
  ledgerReader?: MidnightAuctionStateReader,
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
