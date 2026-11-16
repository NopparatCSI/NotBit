// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

interface IEscrow {
    enum OrderStatus { NONE, FUNDED, DELIVERED, IN_REVIEW, RELEASED, REFUNDED }
    enum EvidenceStage { DELIVERY, RECEIPT }

    struct Offer {
        bytes32 orderId;
        bytes32 listingId;
        address buyer;
        address seller;
        uint256 amount;
        uint64 expiresAt;
        bytes32 agreementHash;
    }

    struct EvidenceReceipt {
        bytes32 orderId;
        address submitter;
        EvidenceStage stage;
        bytes32 evidenceHash;
    }

    struct Order {
        bytes32 listingId;
        address buyer;
        address seller;
        uint256 amount;
        uint64 deadline;
        OrderStatus status;
        bytes32 agreementHash;
        bytes32 deliveryHash;
        bytes32 receiptHash;
        bytes32 decisionHash;
    }

    event OrderFunded(
        bytes32 indexed orderId, bytes32 indexed listingId, address indexed buyer,
        address seller, uint256 amount, uint64 deadline, bytes32 agreementHash
    );
    event DeliveryConfirmed(bytes32 indexed orderId, uint64 deadline, bytes32 evidenceHash);
    event ReceiptConfirmed(bytes32 indexed orderId, bytes32 evidenceHash);
    event OrderInReview(bytes32 indexed orderId, address indexed actor, bool expired);
    event DisputeResolved(bytes32 indexed orderId, address indexed resolver, bool refundBuyer, bytes32 decisionHash);
    event OrderReleased(bytes32 indexed orderId, uint256 sellerAmount, uint256 fee);
    event OrderRefunded(bytes32 indexed orderId, uint256 amount);
    event PayoutQueued(address indexed recipient, uint256 amount);
    event PayoutWithdrawn(address indexed recipient, uint256 amount);
    event FundingPauseChanged(bool paused);

    error Unauthorized();
    error InvalidOrderState();
    error InvalidOffer();
    error InvalidSignature();
    error InvalidReceipt();
    error IncorrectAmount();
    error FundingPaused();
    error ListingAlreadyFunded();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error InvalidDecision();
    error InvalidConfiguration();
    error NoPendingPayout();
    error PayoutFailed();

    function fundOrder(Offer calldata offer, bytes calldata sellerSignature) external payable;
    function confirmDelivery(EvidenceReceipt calldata receipt, bytes calldata receiptSignature) external;
    function confirmReceipt(EvidenceReceipt calldata receipt, bytes calldata receiptSignature) external;
    function openDispute(bytes32 orderId) external;
    function escalateExpiredOrder(bytes32 orderId) external;
    function resolveDispute(bytes32 orderId, bool refundBuyer, bytes32 decisionHash) external;
    function withdrawPendingPayout() external;
    function setFundingPaused(bool paused) external;
    function fundingPaused() external view returns (bool);
    function getOrder(bytes32 orderId) external view returns (Order memory);
    function pendingPayouts(address account) external view returns (uint256);
    function listingFunded(bytes32 listingId) external view returns (bool);
    function admin() external view returns (address);
    function superAdmin() external view returns (address);
}
