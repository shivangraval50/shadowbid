import { contractAddressesEvmMain } from "@evm-midnight/contracts-evm";
import { readMidnightContract } from "@effectstream/midnight-contracts/read-contract";
import { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";
import * as CounterContract from "@evm-midnight/midnight-contract/contract";
import * as ShadowBidContract from "@evm-midnight/shadowbid-midnight-contract/contract";

import {
  ConfigBuilder,
  ConfigNetworkType,
  ConfigSyncProtocolType,
} from "@effectstream/config";
import { hardhat } from "viem/chains";
import { getConnection } from "@effectstream/db";
import { PrimitiveTypeEVMERC721, PrimitiveTypeMidnightGeneric } from "@effectstream/sm/builtin";
import { getEvmEvent } from "@effectstream/config";
import { shadowBidAuctionAbi } from "./shadowbid-primitive.ts";

const shadowBidAuctionAddress = () => contractAddressesEvmMain()
  .chain31337["ShadowBidAuctionModule#ShadowBidAuction"];

const mainSyncProtocolName = "mainNtp";
let launchStartTime: number | undefined;
const dbConn = getConnection();
try {
  const result = await dbConn.query(`
    SELECT * FROM effectstream.sync_protocol_pagination
    WHERE protocol_name = '${mainSyncProtocolName}'
    ORDER BY page_number ASC
    LIMIT 1
  `);
  if (!result || !result.rows.length) {
    throw new Error("DB is empty");
  }
  launchStartTime = result.rows[0].page.root -
    (result.rows[0].page_number * 1000);
} catch {
  // DB not initialized yet
}

export const config = new ConfigBuilder()
  .setNamespace(
    (builder) => builder.setSecurityNamespace("evm-midnight-node"),
  )
  .buildNetworks((builder) =>
    builder
      .addNetwork({
        name: "ntp",
        type: ConfigNetworkType.NTP,
        startTime: launchStartTime ?? new Date().getTime(),
        blockTimeMS: 1000,
      })
      .addViemNetwork({
        ...hardhat,
        name: "evmMain",
      })
      .addNetwork({
        name: "midnight",
        type: ConfigNetworkType.MIDNIGHT,
        networkId: midnightNetworkConfig.id,
        nodeUrl: midnightNetworkConfig.node,
      })
  )
  .buildDeployments((builder) =>
    builder
      .addDeployment(
        (networks) => networks.evmMain,
        (_network) => ({
          name: "Erc721DevModule#Erc721Dev",
          address: contractAddressesEvmMain()
            .chain31337["Erc721DevModule#Erc721Dev"],
        }),
      )
      .addDeployment(
        (networks) => networks.evmMain,
        () => ({
          name: "ShadowBidAuctionModule#ShadowBidAuction",
          address: shadowBidAuctionAddress(),
        }),
      )
  )
  .buildSyncProtocols((builder) =>
    builder
      .addMain(
        (networks) => networks.ntp,
        (network, deployments) => ({
          name: mainSyncProtocolName,
          type: ConfigSyncProtocolType.NTP_MAIN,
          chainUri: "",
          startBlockHeight: 1,
          pollingInterval: 1000,
        }),
      )
      .addParallel(
        (networks) => networks.evmMain,
        (network, deployments) => ({
          name: "mainEvmRPC",
          type: ConfigSyncProtocolType.EVM_RPC_PARALLEL,
          chainUri: network.rpcUrls.default.http[0],
          startBlockHeight: 1,
          pollingInterval: 500,
          confirmationDepth: 1,
        }),
      )
      .addParallel(
        (networks) => networks.midnight,
        (network, deployments) => ({
          name: "parallelMidnight",
          type: ConfigSyncProtocolType.MIDNIGHT_PARALLEL,
          startBlockHeight: 1,
          pollingInterval: 1000,
          indexer: midnightNetworkConfig.indexer,
        }),
      )
  )
  .buildPrimitives((builder) =>
    builder
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        (network, deployments, syncProtocol) => ({
          name: "Arbitrum_ERC721",
          type: PrimitiveTypeEVMERC721,
          startBlockHeight: 0,
          contractAddress: contractAddressesEvmMain()
            .chain31337["Erc721DevModule#Erc721Dev"],
          stateMachinePrefix: "transfer-assets",
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        () => ({
          name: "ShadowBidAuctionCreated",
          type: "EVM:ShadowBidAuction",
          startBlockHeight: 1,
          contractAddress: shadowBidAuctionAddress(),
          stateMachinePrefix: "shadowBidEvm",
          chainId: "31337",
          eventKind: "evm.auction_created",
          abi: getEvmEvent(shadowBidAuctionAbi, "AuctionCreated(uint256,address,address,uint256,uint64,uint64,uint128,bytes32)"),
        } as any),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        () => ({
          name: "ShadowBidCommitmentRecorded",
          type: "EVM:ShadowBidAuction",
          startBlockHeight: 1,
          contractAddress: shadowBidAuctionAddress(),
          stateMachinePrefix: "shadowBidEvm",
          chainId: "31337",
          eventKind: "evm.commitment_recorded",
          abi: getEvmEvent(shadowBidAuctionAbi, "CommitmentRecorded(uint256,bytes32)"),
        } as any),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        () => ({
          name: "ShadowBidAuctionSettled",
          type: "EVM:ShadowBidAuction",
          startBlockHeight: 1,
          contractAddress: shadowBidAuctionAddress(),
          stateMachinePrefix: "shadowBidEvm",
          chainId: "31337",
          eventKind: "evm.auction_settled",
          abi: getEvmEvent(shadowBidAuctionAbi, "AuctionSettled(uint256,address,uint256,bytes32,bytes32)"),
        } as any),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.mainEvmRPC,
        () => ({
          name: "ShadowBidAuctionCancelled",
          type: "EVM:ShadowBidAuction",
          startBlockHeight: 1,
          contractAddress: shadowBidAuctionAddress(),
          stateMachinePrefix: "shadowBidEvm",
          chainId: "31337",
          eventKind: "evm.auction_cancelled",
          abi: getEvmEvent(shadowBidAuctionAbi, "AuctionCancelled(uint256,address,bool)"),
        } as any),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelMidnight,
        (network, deployments, syncProtocol) => ({
          name: "MidnightContractState",
          type: PrimitiveTypeMidnightGeneric,
          startBlockHeight: 1,
          contractAddress: readMidnightContract(
            "contract-round-value",
            { networkId: midnightNetworkConfig.id },
          ).contractAddress,
          stateMachinePrefix: "midnightContractState",
          contract: { ledger: CounterContract.ledger },
          networkId: midnightNetworkConfig.id,
        }),
      )
      .addPrimitive(
        (syncProtocols) => syncProtocols.parallelMidnight,
        () => ({
          name: "ShadowBidMidnightPublic",
          type: "Midnight:ShadowBidPublic",
          startBlockHeight: 1,
          contractAddress: readMidnightContract(
            "contract-shadowbid",
            { networkId: midnightNetworkConfig.id },
          ).contractAddress,
          stateMachinePrefix: "shadowBidMidnight",
          contract: { ledger: ShadowBidContract.ledger },
          networkId: midnightNetworkConfig.id,
        } as any),
      )
  )
  .build();
