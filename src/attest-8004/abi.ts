// Research confirmed 2026-06-17 (Task 14, Step 1).
// Source: git clone https://github.com/erc-8004/erc-8004-contracts /tmp/erc8004
//
// ABI: abis/ValidationRegistry.json in that repo — validationRequest signature is:
//   validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)
// This DIFFERS from the spec placeholder (uint256 validatorAgentId, uint256 serverAgentId, bytes32 dataHash).
// The real ABI is used below.
//
// Mantle Mainnet addresses (chainId 5000) — CONFIRMED live on 2026-06-18 via eth_getCode
// against https://rpc.mantle.xyz (all three returned UUPS proxy bytecode 0x6080604052...):
//   IdentityRegistry:   0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
//   ReputationRegistry: 0x8004BAa17C55a88189AE136b182e5fdA19dE9b63
//   ValidationRegistry: 0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58
// Addresses are the canonical MAINNET_ADDRESSES from erc-8004-contracts/scripts/addresses.ts
// (deterministic CREATE2 vanity deployments, identical across mainnet chains). The repo README's
// per-chain section omits ValidationRegistry, but its bytecode is present on Mantle (verified above).
// Set ERC8004_VALIDATION_REGISTRY in .env to the address above.

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
