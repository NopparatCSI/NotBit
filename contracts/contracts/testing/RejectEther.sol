// SPDX-License-Identifier: MIT
pragma solidity 0.8.38;

import {IEscrow} from "../IEscrow.sol";

contract RejectEther {
    bool private _accepting;
    IEscrow private _callbackEscrow;
    bytes4 public callbackError;

    function allowPayouts() external {
        _accepting = true;
    }

    function withdrawFrom(IEscrow escrow) external {
        escrow.withdrawPendingPayout();
    }

    function withdrawWithCallback(IEscrow escrow) external {
        _callbackEscrow = escrow;
        escrow.withdrawPendingPayout();
        delete _callbackEscrow;
    }

    receive() external payable {
        if (!_accepting) revert();
        if (address(_callbackEscrow) != address(0)) {
            try _callbackEscrow.withdrawPendingPayout() {
                revert("nested withdrawal succeeded");
            } catch (bytes memory reason) {
                callbackError = bytes4(reason);
            }
        }
    }
}
