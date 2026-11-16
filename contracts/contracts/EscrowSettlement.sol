// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IEscrow} from "./IEscrow.sol";

abstract contract EscrowSettlement is IEscrow, EIP712, ReentrancyGuard {
    uint256 private constant OFFER_LIFETIME = 30 minutes;
    uint64 private constant DELIVERY_WINDOW = 24 hours;
    uint64 private constant RECEIPT_WINDOW = 48 hours;
    uint256 private constant FEE_BPS = 500;
    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant PAYOUT_GAS_LIMIT = 50_000;

    bytes32 private constant OFFER_TYPEHASH = keccak256(
        "Offer(bytes32 orderId,bytes32 listingId,address buyer,address seller,uint256 amount,uint64 expiresAt,bytes32 agreementHash)"
    );
    bytes32 private constant EVIDENCE_TYPEHASH = keccak256(
        "EvidenceReceipt(bytes32 orderId,address submitter,uint8 stage,bytes32 evidenceHash)"
    );

    address private immutable _treasury;
    address private immutable _evidenceSigner;

    mapping(bytes32 orderId => Order) internal _orders;
    mapping(bytes32 listingId => bool) public override listingFunded;
    mapping(address recipient => uint256) public override pendingPayouts;
    bool public override fundingPaused;

    constructor(address treasury, address evidenceSigner) EIP712("Game Item Marketplace Escrow", "1") {
        if (treasury == address(0) || evidenceSigner == address(0)) revert InvalidConfiguration();
        _treasury = treasury;
        _evidenceSigner = evidenceSigner;
    }

    function fundOrder(Offer calldata offer, bytes calldata sellerSignature) external payable override nonReentrant {
        if (fundingPaused) revert FundingPaused();
        if (offer.buyer != msg.sender) revert Unauthorized();
        if (
            offer.seller == address(0) || offer.seller == offer.buyer || offer.amount == 0
                || offer.orderId == bytes32(0) || offer.listingId == bytes32(0) || offer.agreementHash == bytes32(0)
        ) revert InvalidOffer();
        _requireTradeWallets(offer.buyer, offer.seller);
        if (msg.value != offer.amount) revert IncorrectAmount();
        if (block.timestamp >= offer.expiresAt) revert DeadlinePassed();
        if (offer.expiresAt > block.timestamp + OFFER_LIFETIME) revert InvalidOffer();
        if (_orders[offer.orderId].status != OrderStatus.NONE) revert InvalidOrderState();
        if (listingFunded[offer.listingId]) revert ListingAlreadyFunded();

        bytes32 offerHash = keccak256(abi.encode(OFFER_TYPEHASH, offer));
        _requireSignature(offerHash, sellerSignature, offer.seller);

        uint64 deadline = uint64(block.timestamp) + DELIVERY_WINDOW;
        Order storage order = _orders[offer.orderId];
        order.listingId = offer.listingId;
        order.buyer = offer.buyer;
        order.seller = offer.seller;
        order.amount = offer.amount;
        order.deadline = deadline;
        order.status = OrderStatus.FUNDED;
        order.agreementHash = offer.agreementHash;
        listingFunded[offer.listingId] = true;

        emit OrderFunded(
            offer.orderId, offer.listingId, offer.buyer, offer.seller, offer.amount, deadline, offer.agreementHash
        );
    }

    function confirmDelivery(EvidenceReceipt calldata receipt, bytes calldata receiptSignature)
        external override nonReentrant
    {
        Order storage order = _orders[receipt.orderId];
        _requireOrderBeforeDeadline(order, OrderStatus.FUNDED);
        if (msg.sender != order.seller) revert Unauthorized();
        _requireEvidence(receipt, receiptSignature, EvidenceStage.DELIVERY);

        order.status = OrderStatus.DELIVERED;
        order.deadline = uint64(block.timestamp) + RECEIPT_WINDOW;
        order.deliveryHash = receipt.evidenceHash;
        emit DeliveryConfirmed(receipt.orderId, order.deadline, receipt.evidenceHash);
    }

    function confirmReceipt(EvidenceReceipt calldata receipt, bytes calldata receiptSignature)
        external override nonReentrant
    {
        Order storage order = _orders[receipt.orderId];
        _requireOrderBeforeDeadline(order, OrderStatus.DELIVERED);
        if (msg.sender != order.buyer) revert Unauthorized();
        _requireEvidence(receipt, receiptSignature, EvidenceStage.RECEIPT);

        order.receiptHash = receipt.evidenceHash;
        emit ReceiptConfirmed(receipt.orderId, receipt.evidenceHash);
        _releaseOrder(receipt.orderId, order);
    }

    function getOrder(bytes32 orderId) external view override returns (Order memory) {
        return _orders[orderId];
    }

    function _requireTradeWallets(address buyer, address seller) internal view virtual;

    // Call only after enforcing the caller's permission and the source order state.
    function _releaseOrder(bytes32 orderId, Order storage order) internal {
        order.status = OrderStatus.RELEASED;
        uint256 fee = Math.mulDiv(order.amount, FEE_BPS, BPS_DENOMINATOR);
        uint256 sellerAmount = order.amount - fee;

        _payOrQueue(order.seller, sellerAmount);
        _payOrQueue(_treasury, fee);
        emit OrderReleased(orderId, sellerAmount, fee);
    }

    function _payOrQueue(address recipient, uint256 amount) internal {
        if (amount == 0) return;

        // Limit gas forwarded to a receiver so a failed payout cannot starve the next one.
        (bool sent,) = payable(recipient).call{value: amount, gas: PAYOUT_GAS_LIMIT}("");
        if (!sent) {
            pendingPayouts[recipient] += amount;
            emit PayoutQueued(recipient, amount);
        }
    }

    function _requireOrderBeforeDeadline(Order storage order, OrderStatus expected) private view {
        if (order.status != expected) revert InvalidOrderState();
        if (block.timestamp >= order.deadline) revert DeadlinePassed();
    }

    function _requireEvidence(
        EvidenceReceipt calldata receipt, bytes calldata signature, EvidenceStage expectedStage
    ) private view {
        if (receipt.submitter != msg.sender || receipt.stage != expectedStage || receipt.evidenceHash == bytes32(0)) {
            revert InvalidReceipt();
        }
        _requireSignature(keccak256(abi.encode(EVIDENCE_TYPEHASH, receipt)), signature, _evidenceSigner);
    }

    function _requireSignature(bytes32 structHash, bytes calldata signature, address signer) private view {
        (address recovered, ECDSA.RecoverError recoverError,) = ECDSA.tryRecoverCalldata(
            _hashTypedDataV4(structHash), signature
        );
        if (recoverError != ECDSA.RecoverError.NoError || recovered != signer) revert InvalidSignature();
    }
}
