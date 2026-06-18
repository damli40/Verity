import { createWalletClient, createPublicClient, http, parseEventLogs } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mantle } from "viem/chains";
import { pathToFileURL } from "node:url";
import { identityRegistryAbi } from "./abi.js";

export interface RegisteredAgent {
  agentId: bigint;
  /** The registering wallet = the agent's owner = the validatorAddress used when attesting. */
  owner: `0x${string}`;
  txHash: `0x${string}`;
}

/** Pure: pick the agentId from decoded `Registered` events. Throws if none are present. */
export function pickAgentId(events: { args: { agentId?: bigint } }[]): bigint {
  const ev = events.find((e) => e.args.agentId !== undefined);
  if (!ev || ev.args.agentId === undefined) throw new Error("no Registered event found in receipt");
  return ev.args.agentId;
}

/**
 * Registers Verity's agent identity in the Mantle ERC-8004 Identity Registry and returns the
 * minted agentId + owner. Run this ONCE; then set VERITY_AGENT_ID and VERITY_VALIDATOR_ADDRESS
 * in .env from the output so the attestation step (attest.ts) can reference the identity.
 */
export async function registerAgent(agentURI: string): Promise<RegisteredAgent> {
  const account = privateKeyToAccount(process.env.VERITY_PRIVATE_KEY as `0x${string}`);
  const transport = http(process.env.MANTLE_RPC_URL);
  const wallet = createWalletClient({ account, chain: mantle, transport });
  const pub = createPublicClient({ chain: mantle, transport });
  const address = process.env.ERC8004_IDENTITY_REGISTRY as `0x${string}`;

  const txHash = await wallet.writeContract({
    address,
    abi: identityRegistryAbi,
    functionName: "register",
    args: [agentURI],
  });
  const receipt = await pub.waitForTransactionReceipt({ hash: txHash });
  const events = parseEventLogs({ abi: identityRegistryAbi, eventName: "Registered", logs: receipt.logs });
  return { agentId: pickAgentId(events), owner: account.address, txHash };
}

// CLI entry: `npx tsx src/attest-8004/register.ts [agentURI]`
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const agentURI =
    process.argv[2] ?? process.env.VERITY_AGENT_URI ?? "https://github.com/verity/verity";
  registerAgent(agentURI)
    .then((r) => {
      console.log("Registered Verity agent on Mantle Identity Registry.");
      console.log("  agentId:", r.agentId.toString());
      console.log("  owner / validatorAddress:", r.owner);
      console.log("  tx:", `https://mantlescan.xyz/tx/${r.txHash}`);
      console.log("\nAdd to .env:");
      console.log(`  VERITY_AGENT_ID=${r.agentId.toString()}`);
      console.log(`  VERITY_VALIDATOR_ADDRESS=${r.owner}`);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
