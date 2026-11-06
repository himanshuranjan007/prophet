// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice CCIP testnet details (from @chainlink/local RegisterData, verified on-chain).
/// @dev Hardcoded because chainlink-local 0.3.1's `new Register()` returns zeros outside its own fork setup.
library Networks {
    struct Net {
        uint256 chainId;
        uint64 selector;
        address router;
        address link;
        address bnm;
        address ethUsdFeed; // only set on the hub chain
    }

    function baseSepolia() internal pure returns (Net memory) {
        return Net(
            84532,
            10344971235874465080,
            0xD3b06cEbF099CE7DA4AcCf578aaebFDBd6e88a93,
            0xE4aB69C077896252FAFBD49EFD26B5D171A32410,
            0x88A2d74F47a237a62e7A51cdDa67270CE381555e,
            0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1
        );
    }

    function arbitrumSepolia() internal pure returns (Net memory) {
        return Net(
            421614,
            3478487238524512106,
            0x2a9C5afB0d0e4BAb2BCdaE109EC4b0c4Be15a165,
            0xb1D4538B4571d411F07960EF2838Ce337FE1E80E,
            0xA8C0c11bf64AF62CDCA6f93D3769B88BdD7cb93D,
            address(0)
        );
    }

    function ethereumSepolia() internal pure returns (Net memory) {
        return Net(
            11155111,
            16015286601757825753,
            0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59,
            0x779877A7B0D9E8603169DdbD7836e478b4624789,
            0xFd57b4ddBf88a4e07fF4e34C487b99af2Fe82a05,
            address(0)
        );
    }

    /// Chainlink Data Feeds used by Prophet (8 decimals each).
    address internal constant BTC_USD_BASE_SEPOLIA = 0x0FB99723Aee6f420beAD13e6bBB79b7E6F034298;
    address internal constant SOL_USD_ARB_SEPOLIA = 0x32377717BC9F9bA8Db45A244bCE77e7c0Cc5A775;

    function byChainId(uint256 chainId) internal pure returns (Net memory) {
        if (chainId == 84532) return baseSepolia();
        if (chainId == 421614) return arbitrumSepolia();
        if (chainId == 11155111) return ethereumSepolia();
        revert("unsupported chain");
    }
}
