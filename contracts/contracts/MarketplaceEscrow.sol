// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {EscrowSettlement} from "./EscrowSettlement.sol";

contract MarketplaceEscrow is EscrowSettlement {
    address public immutable override admin;
    address public immutable override superAdmin;

    constructor(address treasury, address evidenceSigner, address adminWallet, address superAdminWallet)
        EscrowSettlement(treasury, evidenceSigner)
    {
        if (adminWallet == address(0) || superAdminWallet == address(0) || adminWallet == superAdminWallet) {
            revert InvalidConfiguration();
        }
        admin = adminWallet;
        superAdmin = superAdminWallet;
    }

    function openDispute(bytes32 orderId) external override nonReentrant {
        Order storage order = _getReviewableOrder(orderId);
        if (msg.sender != order.buyer && msg.sender != order.seller) revert Unauthorized();

        order.status = OrderStatus.IN_REVIEW;
        emit OrderInReview(orderId, msg.sender, false);
    }

    function escalateExpiredOrder(bytes32 orderId) external override nonReentrant {
        Order storage order = _getReviewableOrder(orderId);
        if (block.timestamp < order.deadline) revert DeadlineNotPassed();

        order.status = OrderStatus.IN_REVIEW;
        emit OrderInReview(orderId, msg.sender, true);
    }

    function resolveDispute(bytes32 orderId, bool refundBuyer, bytes32 decisionHash) external override nonReentrant {
        if (!_isStaff(msg.sender)) revert Unauthorized();
        Order storage order = _orders[orderId];
        if (order.status != OrderStatus.IN_REVIEW) revert InvalidOrderState();
        if (decisionHash == bytes32(0)) revert InvalidDecision();

        order.decisionHash = decisionHash;
        emit DisputeResolved(orderId, msg.sender, refundBuyer, decisionHash);

        if (refundBuyer) {
            order.status = OrderStatus.REFUNDED;
            _payOrQueue(order.buyer, order.amount);
            emit OrderRefunded(orderId, order.amount);
        } else {
            _releaseOrder(orderId, order);
        }
    }

    function withdrawPendingPayout() external override nonReentrant {
        uint256 amount = pendingPayouts[msg.sender];
        if (amount == 0) revert NoPendingPayout();

        // A failed transfer reverts the debit. The recipient can retry later.
        pendingPayouts[msg.sender] = 0;
        (bool sent,) = payable(msg.sender).call{value: amount}("");
        if (!sent) revert PayoutFailed();

        emit PayoutWithdrawn(msg.sender, amount);
    }

    function setFundingPaused(bool paused) external override nonReentrant {
        if (msg.sender != superAdmin) revert Unauthorized();
        if (fundingPaused == paused) return;

        fundingPaused = paused;
        emit FundingPauseChanged(paused);
    }

    function _requireTradeWallets(address buyer, address seller) internal view override {
        if (_isStaff(buyer) || _isStaff(seller)) revert Unauthorized();
    }

    function _isStaff(address wallet) private view returns (bool) {
        return wallet == admin || wallet == superAdmin;
    }

    function _getReviewableOrder(bytes32 orderId) private view returns (Order storage order) {
        order = _orders[orderId];
        if (order.status != OrderStatus.FUNDED && order.status != OrderStatus.DELIVERED) {
            revert InvalidOrderState();
        }
    }
}
