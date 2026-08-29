import { MidnightAdapter } from "@effectstream/batcher-sdk";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import { ShadowBid, witnesses } from "@evm-midnight/shadowbid-midnight-contract";

export interface MidnightBalancingEnv {
  networkId?: string;
  syncProtocolName: string;
}

function getMidnightContractData(networkId: string) {
  const data = readMidnightContract("contract-shadowbid", { networkId });
  if (!data.contractAddress) {
    throw new Error(`Midnight contract address not found for networkId=${networkId}`);
  }
  return data;
}

export function createMidnightBalancingAdapter(env: MidnightBalancingEnv) {
  const networkId = env.networkId ?? midnightNetworkConfig.id;
  const contractData = getMidnightContractData(networkId);

  return new MidnightAdapter(
    contractData.contractAddress,
    midnightNetworkConfig.walletSeed!,
    {
      indexer: midnightNetworkConfig.indexer,
      indexerWS: midnightNetworkConfig.indexerWS,
      node: midnightNetworkConfig.node,
      proofServer: midnightNetworkConfig.proofServer,
      zkConfigPath: contractData.zkConfigPath,
      privateStateStoreName: "shadowbid-settlement-private-state",
      privateStateId: "shadowbidSettlementPrivateState",
      contractJoinTimeoutSeconds: 300,
      walletFundingTimeoutSeconds: 300,
      walletNetworkId: networkId,
    },
    new ShadowBid.Contract(witnesses),
    witnesses,
    contractData.contractInfo,
    env.syncProtocolName,
  );
}
