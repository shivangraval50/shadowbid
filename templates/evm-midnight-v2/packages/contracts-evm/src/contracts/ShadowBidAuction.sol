// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Escrows ERC-721 assets and settles them from an explicitly trusted
/// coordinator signature. This contract does not verify Midnight proofs or state.
contract ShadowBidAuction is IERC721Receiver, EIP712, ReentrancyGuard {
    enum Phase { None, Commit, Settled, Cancelled }

    struct Auction {
        address seller;
        address nft;
        uint256 tokenId;
        uint64 commitDeadline;
        uint64 settlementDeadline;
        uint128 reservePrice;
        bytes32 midnightContract;
        bytes32 midnightNetwork;
        bool commitmentRecorded;
        Phase phase;
    }

    struct SettlementAuthorization {
        uint256 auctionId;
        address winner;
        uint256 amount;
        bytes32 commitment;
        bytes32 midnightContract;
        bytes32 midnightNetwork;
        uint256 resultVersion;
        uint256 expiry;
        uint256 nonce;
    }

    bytes32 public constant SETTLEMENT_TYPEHASH = keccak256(
        "SettlementAuthorization(uint256 auctionId,address winner,uint256 amount,bytes32 commitment,bytes32 midnightContract,bytes32 midnightNetwork,uint256 resultVersion,uint256 expiry,uint256 nonce)"
    );

    address public immutable settlementSigner;
    uint256 public nextAuctionId = 1;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => uint256) public nextSettlementNonce;
    mapping(uint256 => mapping(bytes32 => bool)) public recordedCommitments;
    mapping(uint256 => uint256) public commitmentCount;
    mapping(bytes32 => bool) public usedSettlementDigests;
    mapping(address => uint256) public proceeds;

    address private expectedNft;
    uint256 private expectedTokenId;

    event AuctionCreated(uint256 indexed auctionId, address indexed seller, address indexed nft, uint256 tokenId, uint64 commitDeadline, uint64 settlementDeadline, uint128 reservePrice, bytes32 midnightContract, bytes32 midnightNetwork);
    event CommitmentRecorded(uint256 indexed auctionId, bytes32 indexed commitment);
    event AuctionSettled(uint256 indexed auctionId, address indexed winner, uint256 amount, bytes32 indexed commitment, bytes32 settlementDigest);
    event AuctionCancelled(uint256 indexed auctionId, address indexed caller, bool timedOut);
    event ProceedsWithdrawn(address indexed seller, uint256 amount);

    error InvalidDeadline();
    error InvalidAddress();
    error InvalidPhase();
    error InvalidCommitment();
    error Unauthorized();
    error IncorrectPayment();
    error SettlementExpired();
    error InvalidSettlement();
    error SettlementReplay();
    error EscrowReceiptUnexpected();
    error EtherTransferFailed();

    constructor(address settlementSigner_) EIP712("ShadowBidAuction", "1") {
        if (settlementSigner_ == address(0)) revert InvalidAddress();
        settlementSigner = settlementSigner_;
    }

    function createAuction(
        address nft,
        uint256 tokenId,
        uint64 commitDeadline,
        uint64 settlementDeadline,
        uint128 reservePrice,
        bytes32 midnightContract,
        bytes32 midnightNetwork
    ) external nonReentrant returns (uint256 auctionId) {
        if (nft == address(0) || midnightContract == bytes32(0) || midnightNetwork == bytes32(0)) revert InvalidAddress();
        if (commitDeadline <= block.timestamp || settlementDeadline <= commitDeadline) revert InvalidDeadline();

        auctionId = nextAuctionId++;
        auctions[auctionId] = Auction({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            commitDeadline: commitDeadline,
            settlementDeadline: settlementDeadline,
            reservePrice: reservePrice,
            midnightContract: midnightContract,
            midnightNetwork: midnightNetwork,
            commitmentRecorded: false,
            phase: Phase.Commit
        });

        expectedNft = nft;
        expectedTokenId = tokenId;
        IERC721(nft).safeTransferFrom(msg.sender, address(this), tokenId);
        expectedNft = address(0);

        emit AuctionCreated(auctionId, msg.sender, nft, tokenId, commitDeadline, settlementDeadline, reservePrice, midnightContract, midnightNetwork);
    }

    /// @notice Records that the trusted coordinator observed an eligible Midnight commitment.
    /// It is solely a cancellation guard; settlement independently checks the same commitment.
    function recordCommitment(uint256 auctionId, bytes32 commitment) external {
        Auction storage auction = auctions[auctionId];
        if (auction.phase != Phase.Commit || block.timestamp > auction.commitDeadline) revert InvalidPhase();
        if (msg.sender != settlementSigner) revert Unauthorized();
        if (commitment == bytes32(0) || recordedCommitments[auctionId][commitment]) revert InvalidCommitment();
        recordedCommitments[auctionId][commitment] = true;
        commitmentCount[auctionId]++;
        auction.commitmentRecorded = true;
        emit CommitmentRecorded(auctionId, commitment);
    }

    function settle(SettlementAuthorization calldata authorization, bytes calldata signature) external payable nonReentrant {
        Auction storage auction = auctions[authorization.auctionId];
        if (auction.phase != Phase.Commit || block.timestamp <= auction.commitDeadline || block.timestamp > auction.settlementDeadline) revert InvalidPhase();
        if (authorization.winner == address(0) || authorization.amount < auction.reservePrice) revert InvalidSettlement();
        if (authorization.expiry < block.timestamp) revert SettlementExpired();
        if (authorization.nonce != nextSettlementNonce[authorization.auctionId]) revert SettlementReplay();
        if (!recordedCommitments[authorization.auctionId][authorization.commitment]) revert InvalidCommitment();
        if (authorization.midnightContract != auction.midnightContract || authorization.midnightNetwork != auction.midnightNetwork || authorization.resultVersion != 1) revert InvalidSettlement();
        if (msg.sender != authorization.winner || msg.value != authorization.amount) revert IncorrectPayment();

        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            SETTLEMENT_TYPEHASH,
            authorization.auctionId,
            authorization.winner,
            authorization.amount,
            authorization.commitment,
            authorization.midnightContract,
            authorization.midnightNetwork,
            authorization.resultVersion,
            authorization.expiry,
            authorization.nonce
        )));
        if (usedSettlementDigests[digest] || ECDSA.recover(digest, signature) != settlementSigner) revert SettlementReplay();

        usedSettlementDigests[digest] = true;
        nextSettlementNonce[authorization.auctionId]++;
        auction.phase = Phase.Settled;
        proceeds[auction.seller] += authorization.amount;
        emit AuctionSettled(authorization.auctionId, authorization.winner, authorization.amount, authorization.commitment, digest);
        IERC721(auction.nft).safeTransferFrom(address(this), authorization.winner, auction.tokenId);
    }

    function cancel(uint256 auctionId) external nonReentrant {
        Auction storage auction = auctions[auctionId];
        if (auction.phase != Phase.Commit) revert InvalidPhase();
        bool timedOut = block.timestamp > auction.settlementDeadline;
        if (!timedOut && (msg.sender != auction.seller || auction.commitmentRecorded || block.timestamp > auction.commitDeadline)) revert Unauthorized();
        auction.phase = Phase.Cancelled;
        emit AuctionCancelled(auctionId, msg.sender, timedOut);
        IERC721(auction.nft).safeTransferFrom(address(this), auction.seller, auction.tokenId);
    }

    function withdrawProceeds() external nonReentrant {
        uint256 amount = proceeds[msg.sender];
        if (amount == 0) revert InvalidSettlement();
        proceeds[msg.sender] = 0;
        (bool sent,) = msg.sender.call{value: amount}("");
        if (!sent) revert EtherTransferFailed();
        emit ProceedsWithdrawn(msg.sender, amount);
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external view returns (bytes4) {
        if (msg.sender != expectedNft || tokenId != expectedTokenId) revert EscrowReceiptUnexpected();
        return IERC721Receiver.onERC721Received.selector;
    }
}
