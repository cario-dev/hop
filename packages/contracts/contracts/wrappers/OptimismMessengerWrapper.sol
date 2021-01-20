// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "../interfaces/optimism/messengers/iOVM_L1CrossDomainMessenger.sol";
import "./MessengerWrapper.sol";

contract OptimismMessengerWrapper is MessengerWrapper {

    iOVM_L1CrossDomainMessenger public l1MessengerAddress;

    function setL1MessengerAddress(iOVM_L1CrossDomainMessenger _l1MessengerAddress) public {
        l1MessengerAddress = _l1MessengerAddress;
    }

    function sendCrossDomainMessage(bytes memory _calldata) public override {
        l1MessengerAddress.sendMessage(
            l2BridgeAddress,
            _calldata,
            uint32(defaultGasLimit)
        );
    }

    function verifySender(bytes memory _data) public override {
        // ToDo: Verify sender with Optimism L1 messenger
        // Verify that sender is l2BridgeAddress
    }
}
