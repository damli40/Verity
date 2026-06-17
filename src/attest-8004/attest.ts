import { createWalletClient, http, type Hash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import { validationRegistryAbi } from "./abi.js";

export interface AttestParams {
  /** keccak256 of the verified PDF bytes — the recomputable anchor. */
  requestHash: `0x${string}`;
  /** Address of the validator agent (the Verity agent's on-chain identity address). */
  validatorAddress: `0x${string}`;
  /** ERC-8004 agentId (ERC-721 tokenId) of the server agent being validated. */
  agentId: bigint;
  /** URI pointing to the off-chain report (IPFS CID or HTTPS URL). */
  requestURI: string;
}

/**
 * Writes one Validation-Registry attestation anchoring the verified PDF's hash on Mantle mainnet.
 * This timestamps/anchors the report; trust comes from the re-runnable Dune queries + this hash,
 * not from the tx itself (see spec §1).
 *
 * DO NOT call until ERC8004_VALIDATION_REGISTRY is confirmed on mantlescan.xyz (Task 14 open q).
 */
export async function attest(p: AttestParams): Promise<Hash> {
  const account = privateKeyToAccount(process.env.VERITY_PRIVATE_KEY as `0x${string}`);
  const client = createWalletClient({ account, chain: mantle, transport: http(process.env.MANTLE_RPC_URL) });
  return client.writeContract({
    address: process.env.ERC8004_VALIDATION_REGISTRY as `0x${string}`,
    abi: validationRegistryAbi,
    functionName: "validationRequest",
    args: [p.validatorAddress, p.agentId, p.requestURI, p.requestHash],
  });
}
