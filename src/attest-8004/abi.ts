// Research confirmed 2026-06-17 (Task 14, Step 1).
// Source: git clone https://github.com/erc-8004/erc-8004-contracts /tmp/erc8004
//
// ABI: abis/ValidationRegistry.json in that repo — validationRequest signature is:
//   validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)
// This DIFFERS from the spec placeholder (uint256 validatorAgentId, uint256 serverAgentId, bytes32 dataHash).
// The real ABI is used below.
//
// Mantle Mainnet addresses (from README.md in the same repo, section "Mantle Mainnet"):
//   IdentityRegistry:   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
//     (cross-checks with Ethereum mainnet address cited in spec §5 — vanity-deployed at same addr)
//   ReputationRegistry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
//   ValidationRegistry: NOT listed in the README. The README only lists IdentityRegistry and
//     ReputationRegistry per chain. The ValidationRegistry address for Mantle mainnet must be
//     confirmed on explorer.mantle.xyz (mantlescan.xyz) before any live tx. Set
//     ERC8004_VALIDATION_REGISTRY in .env once confirmed.
//
// Explorer verification URL: https://mantlescan.xyz (search for ValidationRegistryUpgradeable)

export const validationRegistryAbi = [
  {
    type: "function",
    name: "validationRequest",
    stateMutability: "nonpayable",
    inputs: [
      { name: "validatorAddress", type: "address" },
      { name: "agentId", type: "uint256" },
      { name: "requestURI", type: "string" },
      { name: "requestHash", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;
