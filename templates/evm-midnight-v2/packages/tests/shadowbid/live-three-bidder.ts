/**
 * A deliberately single-auction local integration exercise.  The current
 * Compact contract is a singleton, so this runner joins the one deployed
 * `contract-shadowbid` instance and must never be presented as multi-auction
 * infrastructure.
 *
 * It proves the actual Compact circuits, but never writes or logs bid openings
 * or salts.  The three bidder identities are public Bytes<32> identifiers used
 * by the Compact circuit; the local dev network funds one Midnight wallet, so
 * this is not evidence of three independently funded Midnight wallets.
 */
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  http,
  hexToBytes,
  keccak256,
  padHex,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { hardhat } from "viem/chains";
import { mnemonicToAccount } from "viem/accounts";
import { MidnightLocalConnector } from "@effectstream/wallets/midnight-local";
import { syncAndWaitForFunds } from "@effectstream/midnight-contracts";
import { CompiledContract } from "@midnight-ntwrk/compact-js";
import { findDeployedContract } from "@midnight-ntwrk/midnight-js-contracts";
import { indexerPublicDataProvider } from "@midnight-ntwrk/midnight-js-indexer-public-data-provider";
import { httpClientProofProvider } from "@midnight-ntwrk/midnight-js-http-client-proof-provider";
import { NodeZkConfigProvider } from "@midnight-ntwrk/midnight-js-node-zk-config-provider";
import { levelPrivateStateProvider } from "@midnight-ntwrk/midnight-js-level-private-state-provider";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
// Root export (`_index.ts`), not the `/contract` subpath: this file needs both
// the `ShadowBid` namespace and `witnesses`, and only the root re-exports both.
// The `/contract` subpath exports `Contract`/`ledger` directly with no namespace
// and no witnesses (that shape is what shadowbid-midnight-reader.ts consumes).
import * as ShadowBidContract from "@evm-midnight/shadowbid-midnight-contract";
import { addressToBytes32, toHexLedgerState } from "../../batcher/shadowbid-coordinator.ts";
import { signCoordinatorDecision, validateCoordinatorDecision } from "../../batcher/shadowbid-coordinator-core.ts";
import { LiveMidnightAuctionStateReader } from "../../batcher/shadowbid-midnight-reader.ts";

const EVM_RPC = "http://127.0.0.1:8545";
const INDEXER_HTTP = "http://127.0.0.1:8088/api/v4/graphql";
const INDEXER_WS = "ws://127.0.0.1:8088/api/v4/graphql/ws";
const PROOF_SERVER = "http://127.0.0.1:6300";
const MIDNIGHT_NETWORK_ID = "undeployed";
const GENESIS_SEED = "0000000000000000000000000000000000000000000000000000000000000001";
const EFFECTSTREAM_API = "http://127.0.0.1:9999";

// Standard local Hardhat accounts. This public development mnemonic is used
// only by the disposable local EVM launched by the template; never reuse it
// on a network carrying value.
const LOCAL_DEV_MNEMONIC = "test test test test test test test test test test test junk";
const coordinator = mnemonicToAccount(LOCAL_DEV_MNEMONIC, { addressIndex: 0 });
const seller = mnemonicToAccount(LOCAL_DEV_MNEMONIC, { addressIndex: 1 });
const winner = mnemonicToAccount(LOCAL_DEV_MNEMONIC, { addressIndex: 2 });

const erc721Abi = [
  { type: "function", name: "mint", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "tokenId", type: "uint256" }], outputs: [] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;

const auctionAbi = [
  { type: "function", name: "nextAuctionId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "createAuction", stateMutability: "nonpayable", inputs: [
    { name: "nft", type: "address" }, { name: "tokenId", type: "uint256" }, { name: "commitDeadline", type: "uint64" }, { name: "settlementDeadline", type: "uint64" }, { name: "reservePrice", type: "uint128" }, { name: "midnightContract", type: "bytes32" }, { name: "midnightNetwork", type: "bytes32" },
  ], outputs: [{ type: "uint256" }] },
  { type: "function", name: "recordCommitment", stateMutability: "nonpayable", inputs: [{ name: "auctionId", type: "uint256" }, { name: "commitment", type: "bytes32" }], outputs: [] },
  { type: "function", name: "settle", stateMutability: "payable", inputs: [{ name: "authorization", type: "tuple", components: [
    { name: "auctionId", type: "uint256" }, { name: "winner", type: "address" }, { name: "amount", type: "uint256" }, { name: "commitment", type: "bytes32" }, { name: "midnightContract", type: "bytes32" }, { name: "midnightNetwork", type: "bytes32" }, { name: "resultVersion", type: "uint256" }, { name: "expiry", type: "uint256" }, { name: "nonce", type: "uint256" },
  ] }, { name: "signature", type: "bytes" }], outputs: [] },
] as const;

export type LiveThreeBidderResult = {
  auctionId: bigint;
  midnightContractAddress: string;
  winner: Address;
  owner: Address;
  publicCommitments: readonly Hex[];
};

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const asBytes32 = (value: Hex) => hexToBytes(padHex(value, { size: 32 }));
const addressBytes32 = (value: Address) => hexToBytes(addressToBytes32(value));

async function waitForReceipt(publicClient: ReturnType<typeof createPublicClient>, hash: Hex): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`EVM transaction reverted: ${hash}`);
}

async function deployedAddresses(): Promise<{ nft: Address; auction: Address }> {
  const addressesPath = path.resolve(import.meta.dirname!, "../../contracts-evm/ignition/deployments/chain-31337/deployed_addresses.json");
  const addresses = JSON.parse(await readFile(addressesPath, "utf8")) as Record<string, Address>;
  const nft = addresses["Erc721DevModule#Erc721Dev"];
  const auction = addresses["ShadowBidAuctionModule#ShadowBidAuction"];
  if (!nft || !auction) throw new Error("ShadowBid EVM deployment addresses are unavailable");
  return { nft, auction };
}

async function deployedMidnightAddress(): Promise<string> {
  const filename = path.resolve(import.meta.dirname!, "../../contracts-midnight/contract-shadowbid.undeployed.json");
  const record = JSON.parse(await readFile(filename, "utf8")) as { contractAddress?: unknown };
  if (typeof record.contractAddress !== "string" || !/^[0-9a-f]{64}$/i.test(record.contractAddress)) {
    throw new Error("ShadowBid Midnight deployment address is unavailable");
  }
  return record.contractAddress;
}

async function waitForWallClock(seconds: bigint): Promise<void> {
  while (BigInt(Math.floor(Date.now() / 1000)) <= seconds) await pause(250);
}

async function waitForSettledProjection(auctionId: bigint, expectedOwner: Address): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const response = await fetch(`${EFFECTSTREAM_API}/api/auctions/${auctionId}`);
    if (response.ok) {
      const value = await response.json() as { auction?: { phase?: string; winner?: string | null; winning_amount?: string | null } };
      if (
        value.auction?.phase === "SETTLED" &&
        value.auction.winner?.toLowerCase() === expectedOwner.toLowerCase() &&
        value.auction.winning_amount === "13"
      ) return;
    }
    await pause(500);
  }
  throw new Error("EffectStream did not project the settled public auction outcome within 60 seconds");
}

/**
 * Executes a local, singleton-Compact demonstration. Values 8/13/11 and salts
 * are passed only to Compact proving calls. The returned object contains only
 * public commitments and the public EVM outcome.
 */
export async function runLiveThreeBidderAuction(): Promise<LiveThreeBidderResult> {
  const publicClient = createPublicClient({ chain: hardhat, transport: http(EVM_RPC) });
  const coordinatorClient = createWalletClient({ account: coordinator, chain: hardhat, transport: http(EVM_RPC) });
  const sellerClient = createWalletClient({ account: seller, chain: hardhat, transport: http(EVM_RPC) });
  const winnerClient = createWalletClient({ account: winner, chain: hardhat, transport: http(EVM_RPC) });
  const { nft, auction } = await deployedAddresses();
  const midnightContractAddress = await deployedMidnightAddress();

  const latest = await publicClient.getBlock();
  const wallNow = BigInt(Math.floor(Date.now() / 1000));
  const baseTime = latest.timestamp > wallNow ? latest.timestamp : wallNow;
  // Compact proof generation has a material startup cost on this machine.
  const commitDeadline = baseTime + 150n;
  const settlementDeadline = commitDeadline + 300n;
  const midnightDomain = keccak256(toHex("shadowbid-local-undeployed"));
  const midnightIdentity = (`0x${midnightContractAddress}`) as Hex;

  const auctionId = await publicClient.readContract({ address: auction, abi: auctionAbi, functionName: "nextAuctionId" });
  const tokenId = 900_000n + auctionId;
  await waitForReceipt(publicClient, await sellerClient.writeContract({ address: nft, abi: erc721Abi, functionName: "mint", args: [seller.address, tokenId] }));
  await waitForReceipt(publicClient, await sellerClient.writeContract({ address: nft, abi: erc721Abi, functionName: "approve", args: [auction, tokenId] }));
  await waitForReceipt(publicClient, await sellerClient.writeContract({
    address: auction, abi: auctionAbi, functionName: "createAuction",
    args: [nft, tokenId, commitDeadline, settlementDeadline, 1n, midnightIdentity, midnightDomain],
  }));

  setNetworkId(MIDNIGHT_NETWORK_ID as any);
  const connector = await MidnightLocalConnector.instance().connectFromSeed({
    seed: GENESIS_SEED,
    networkId: MIDNIGHT_NETWORK_ID,
    networkUrls: { indexer: INDEXER_HTTP, indexerWS: INDEXER_WS, node: "http://127.0.0.1:9944", proofServer: PROOF_SERVER },
  });
  const walletResult = (connector.getConnection().api as any).walletResult;
  if (!walletResult) throw new Error("Midnight wallet facade was not constructed");
  await syncAndWaitForFunds(walletResult.wallet, { timeoutMs: 300_000 });

  const walletProvider = {
    getCoinPublicKey: () => walletResult.zswapSecretKeys.coinPublicKey,
    getEncryptionPublicKey: () => walletResult.zswapSecretKeys.encryptionPublicKey,
    async balanceTx(tx: any, ttl?: Date) {
      const recipe = await walletResult.wallet.balanceUnboundTransaction(tx, {
        shieldedSecretKeys: walletResult.walletZswapSecretKeys,
        dustSecretKey: walletResult.walletDustSecretKey,
      }, { ttl: ttl ?? new Date(Date.now() + 3_600_000) });
      const signed = await walletResult.wallet.signRecipe(recipe, (payload: Uint8Array) => walletResult.unshieldedKeystore.signDataAsync(payload));
      return walletResult.wallet.finalizeRecipe(signed);
    },
    submitTx: (tx: any) => walletResult.wallet.submitTransaction(tx),
  };
  // The provider encrypts contract state. Its database is an ephemeral /tmp
  // test location and this runner never serializes bid openings or salts.
  const privateStateProvider = levelPrivateStateProvider({
    midnightDbName: `/private/tmp/shadowbid-e2e-${process.pid}`,
    privateStoragePasswordProvider: async () => "ShadowBidE2E-Local!7",
    privateStateStoreName: "shadowbid-e2e-private-state",
    accountId: walletResult.unshieldedAddress || "shadowbid-e2e",
  } as any);
  const publicDataProvider = indexerPublicDataProvider({ queryURL: INDEXER_HTTP, subscriptionURL: INDEXER_WS });
  const managedDir = path.resolve(import.meta.dirname!, "../../contracts-midnight/contract-shadowbid/src/managed");
  const compiledContract = CompiledContract.make("contract-shadowbid", ShadowBidContract.ShadowBid.Contract).pipe(
    CompiledContract.withWitnesses(ShadowBidContract.witnesses as never),
    CompiledContract.withCompiledFileAssets(managedDir),
  );
  const providers = {
    privateStateProvider, publicDataProvider,
    zkConfigProvider: new NodeZkConfigProvider(managedDir),
    proofProvider: httpClientProofProvider(PROOF_SERVER, new NodeZkConfigProvider(managedDir)),
    walletProvider, midnightProvider: walletProvider,
  };
  const compact = await findDeployedContract(providers, {
    contractAddress: midnightContractAddress,
    compiledContract: compiledContract as any,
    privateStateId: "shadowbid-e2e-private-state",
    initialPrivateState: { bids: {} },
  });

  await compact.callTx.register_auction(
    asBytes32(toHex(auctionId)), 1n, 31337n, addressBytes32(auction), asBytes32(midnightDomain), asBytes32(midnightIdentity), commitDeadline, settlementDeadline,
  );

  // Salts remain only in this scope until their matching consume proof is
  // generated. Neither values nor salts are returned, logged, or written to a
  // result file. Amounts are intentionally not added to any public structure.
  const bids = [
    { bidder: addressBytes32("0x0000000000000000000000000000000000000808"), amount: 8n, salt: randomBytes(32) },
    { bidder: addressBytes32(winner.address), amount: 13n, salt: randomBytes(32) },
    { bidder: addressBytes32("0x0000000000000000000000000000000000001111"), amount: 11n, salt: randomBytes(32) },
  ];
  await compact.callTx.commit_bid_0(bids[0]!.bidder, bids[0]!.amount, bids[0]!.salt);
  await compact.callTx.commit_bid_1(bids[1]!.bidder, bids[1]!.amount, bids[1]!.salt);
  await compact.callTx.commit_bid_2(bids[2]!.bidder, bids[2]!.amount, bids[2]!.salt);

  const reader = new LiveMidnightAuctionStateReader({ indexerQueryUrl: INDEXER_HTTP, indexerSubscriptionUrl: INDEXER_WS });
  const committedLedger = await reader.getAuctionLedgerState(midnightContractAddress);
  if (!committedLedger || !committedLedger.committed_0 || !committedLedger.committed_1 || !committedLedger.committed_2) {
    throw new Error("Midnight ledger did not expose all three public commitment hashes");
  }
  const commitments = [committedLedger.commitment_0, committedLedger.commitment_1, committedLedger.commitment_2] as const;
  for (const commitment of commitments) {
    if (BigInt(Math.floor(Date.now() / 1000)) >= commitDeadline) throw new Error("Compact proof generation exceeded the configured EVM commit window");
    await waitForReceipt(publicClient, await coordinatorClient.writeContract({ address: auction, abi: auctionAbi, functionName: "recordCommitment", args: [auctionId, commitment] }));
  }

  await compact.callTx.close_commitments();
  await compact.callTx.open_and_consume_0(bids[0]!.bidder, bids[0]!.amount, bids[0]!.salt);
  await compact.callTx.open_and_consume_1(bids[1]!.bidder, bids[1]!.amount, bids[1]!.salt);
  await compact.callTx.open_and_consume_2(bids[2]!.bidder, bids[2]!.amount, bids[2]!.salt);
  await waitForWallClock(commitDeadline);

  const closedLedger = await reader.getAuctionLedgerState(midnightContractAddress);
  if (!closedLedger?.commitments_closed || !closedLedger.consumed_0 || !closedLedger.consumed_1 || !closedLedger.consumed_2) {
    throw new Error("Midnight close/open-consume lifecycle did not finalize");
  }
  const now = BigInt(Math.floor(Date.now() / 1000));
  const decision = {
    auctionId: String(auctionId), winner: winner.address, amount: 13n, commitment: commitments[1],
    midnightContractAddress, midnightContract: midnightIdentity, midnightNetwork: midnightDomain,
    evmChainId: 31337n, evmAuctionContract: auction, resultVersion: 1n, expiry: now + 120n, nonce: 0n,
  };
  const validation = await validateCoordinatorDecision(decision, { async getAuctionLedgerState() { return closedLedger; } }, Number(now));
  if (!validation.valid) throw new Error(`Coordinator rejected the permitted result: ${validation.failure.kind}`);
  const envelope = await signCoordinatorDecision(decision, { name: "ShadowBidAuction", version: "1", chainId: 31337n, verifyingContract: auction }, coordinator);

  // Use the EVM's local test clock only to satisfy the same post-deadline rule
  // enforced by production settlement; the coordinator validation above used
  // real wall-clock time against finalized Midnight ledger data.
  //
  // Only nudge the clock when the chain has NOT already moved past the commit
  // deadline on its own. Compact proving and the three `recordCommitment`
  // transactions each mine blocks, so by this point the chain has usually
  // advanced past `commitDeadline` already; `evm_setNextBlockTimestamp` rejects
  // any value at or below the latest block's timestamp, which previously failed
  // the whole run at the final settlement step.
  const beforeSettle = await publicClient.getBlock();
  if (beforeSettle.timestamp <= commitDeadline) {
    await publicClient.request({ method: "evm_setNextBlockTimestamp", params: [Number(commitDeadline + 1n)] });
  } else if (beforeSettle.timestamp > settlementDeadline) {
    throw new Error(
      `EVM settlement window closed before settle(): block ${beforeSettle.timestamp} > settlementDeadline ${settlementDeadline}`,
    );
  }
  await waitForReceipt(publicClient, await winnerClient.writeContract({
    address: auction, abi: auctionAbi, functionName: "settle", value: decision.amount,
    args: [{ auctionId, winner: winner.address, amount: decision.amount, commitment: decision.commitment, midnightContract: decision.midnightContract, midnightNetwork: decision.midnightNetwork, resultVersion: 1n, expiry: decision.expiry, nonce: 0n }, envelope.signature],
  }));
  const owner = await publicClient.readContract({ address: nft, abi: erc721Abi, functionName: "ownerOf", args: [tokenId] });
  if (owner.toLowerCase() !== winner.address.toLowerCase()) throw new Error("EVM settlement did not transfer the NFT to the authorized winner");
  await waitForSettledProjection(auctionId, winner.address);
  await reader.dispose();
  return { auctionId, midnightContractAddress, winner: winner.address, owner, publicCommitments: commitments };
}
