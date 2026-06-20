import { readFileSync } from "node:fs";
import { loadAllowlist } from "./allowlist.js";
import { runOnchainScout } from "./scouts/onchain-finance-scout.js";
import { runWebScout } from "./scouts/web-scout.js";
import { synthesize } from "./synthesizer.js";
import { judge } from "./verify/llm-judge.js";
import { renderDeck, type ReportMeta } from "./report/render-deck.js";
import { htmlToPdf } from "./report/generate-pdf.js";
import { hashFile } from "./attest-8004/hash.js";
import { attest } from "./attest-8004/attest.js";
import { makeTelemetry, defaultSink } from "./telemetry.js";
import { runResearch, type ResearchDeps } from "./operator.js";
import { loadSourceAllowlist } from "./verify/source-allowlist.js";
import { captureScrapes } from "./scouts/scrape-scout.js";
import { runRegistryScout, type RawCandidate } from "./discovery/registry-scout.js";
import { matchOnchain } from "./discovery/match-onchain.js";
import { makeLookup } from "./discovery/resolve-address.js";
import { toRawCandidate } from "./discovery/sources.js";
import type { Report } from "./types.js";

const fixtureMode = process.argv.includes("--fixture");
const telemetry = makeTelemetry(defaultSink());
const outPdf = "examples/mantle-rwa-q2-2026.pdf";
// Public, resolvable pointer to the attested report (the on-chain requestHash anchors the actual
// bytes; this URI just lets a verifier fetch them). Overridable for other deployments.
const reportUri = process.env.VERITY_REPORT_URI ?? `https://raw.githubusercontent.com/damli40/Verity/main/${outPdf}`;

async function renderPdf(report: Report, meta: ReportMeta): Promise<string> {
  await htmlToPdf(renderDeck(report, meta), outPdf);
  return outPdf;
}

/** Extract candidate RWA rows from a registry page via Firecrawl. Returns [] when no key is configured. */
async function extractRwaRows(url: string): Promise<Record<string, unknown>[]> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return [];
  const res = await fetch("https://api.firecrawl.dev/v1/extract", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      urls: [url],
      prompt:
        "Extract every tokenized real-world-asset (RWA) listed on this page that is deployed on the Mantle network. " +
        "For each, return name, issuer, category, networks (array), and the Mantle contract address.",
      schema: {
        type: "object",
        properties: {
          rwas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" }, issuer: { type: "string" }, category: { type: "string" },
                networks: { type: "array", items: { type: "string" } }, address: { type: "string" },
              },
            },
          },
        },
      },
    }),
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { data?: { rwas?: Record<string, unknown>[] } };
  return json.data?.rwas ?? [];
}

/** Confirm an address is a deployed contract on Mantle via Etherscan V2 multichain (free eth_getCode). */
async function confirmErc20OnMantle(address: string): Promise<boolean> {
  const key = process.env.ETHERSCAN_API_KEY;
  if (!key) return false;
  const u =
    `https://api.etherscan.io/v2/api?chainid=5000&module=proxy&action=eth_getCode` +
    `&address=${address}&tag=latest&apikey=${key}`;
  const res = await fetch(u);
  if (!res.ok) return false;
  const json = (await res.json()) as { result?: string };
  return typeof json.result === "string" && json.result !== "0x";
}

async function main(): Promise<void> {
  if (fixtureMode) {
    const fx = JSON.parse(readFileSync("fixtures/mantle-rwa-q2-2026.json", "utf8"));
    const allowlist = loadAllowlist("data/allowlist.fixture.json");
    const sourceAllowlist = loadSourceAllowlist("data/source-allowlist.json");
    const fixtureReport = JSON.parse(readFileSync("fixtures/report.json", "utf8")) as Report;
    // VERITY_FIXTURE_LIVE_LLM=1 exercises the REAL synthesizer + judge (e.g. OpenAI models) over the
    // cached scout data — a cheap way to test the LLM path without Dune/Exa keys. Default is fully
    // offline (no LLM calls): synth returns the cached report, judge auto-passes.
    const liveLlm = Boolean(process.env.VERITY_FIXTURE_LIVE_LLM);
    const deps: ResearchDeps = {
      onchain: async () => fx.dune,
      web: async () => fx.web,
      scrape: async () => fx.scrapes ?? [],
      discover: async () => fx.discovered ?? { verified: [], quarantined: [] },
      synthesize: liveLlm ? synthesize : async () => ({ report: structuredClone(fixtureReport), tokens: 0 }),
      judge: liveLlm ? judge : async () => ({ passed: true, notes: "fixture: qualitative review stubbed offline" }),
      renderPdf,
      attest: async (pdf) => `simulated-0x${hashFile(pdf).slice(2, 14)}`, // offline demo: no real tx
      telemetry,
    };
    const out = await runResearch(
      {
        question: fx.question, entities: ["USDY", "mUSD"], queryIds: fx.queryIds, allowlist, now: fx.now, sourceAllowlist,
        anchor: { agentId: "134", registry: "0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58", chain: "Mantle mainnet (5000)" },
      },
      deps,
    );
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const allowlist = loadAllowlist("data/allowlist.json");
  const sourceAllowlist = loadSourceAllowlist("data/source-allowlist.json");
  const scrapeTargets = (process.env.VERITY_SCRAPE_URLS ?? "")
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url) => ({ url, domain: new URL(url).hostname.replace(/^www\./, "") }));
  const question =
    process.argv.slice(2).filter((a) => a !== "--fixture").join(" ") ||
    "Did Mantle's RWA growth accelerate in Q2 2026?";
  const queryIds = (process.env.VERITY_QUERY_IDS ?? "").split(",").filter(Boolean).map(Number);
  const deps: ResearchDeps = {
    onchain: (ids) => runOnchainScout(ids, process.env.DUNE_API_KEY!),
    web: (q) => runWebScout(q, process.env.EXA_API_KEY!),
    scrape: () =>
      captureScrapes(
        scrapeTargets,
        async (url) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`scrape failed: ${url} ${res.status}`);
          return res.text();
        },
        new Date().toISOString(),
      ),
    discover: async () => {
      const discoveryDomainsList = sourceAllowlist
        .filter((s) => s.roles.includes("discovery"))
        .map((s) => s.domain);

      // Cast the net: extract candidate RWA rows from each discovery registry (Firecrawl), map to RawCandidate.
      const fetchCandidates = async (domain: string): Promise<RawCandidate[]> => {
        const url = `https://${domain}`;
        const rows = await extractRwaRows(url);
        return rows.map((r) => toRawCandidate(r, url));
      };
      const candidates = await runRegistryScout(fetchCandidates, discoveryDomainsList);

      // Resolve each candidate via issuer-official source + on-chain (Etherscan V2, chainid 5000) confirmation.
      const lookup = makeLookup({
        list: sourceAllowlist,
        fetchText: async (u) => {
          const res = await fetch(u);
          return res.ok ? res.text() : "";
        },
        confirmOnchain: confirmErc20OnMantle,
      });
      return matchOnchain(candidates, allowlist, lookup);
    },
    synthesize,
    judge,
    renderPdf,
    attest: async (pdf) =>
      attest({
        requestHash: hashFile(pdf),
        validatorAddress: process.env.VERITY_VALIDATOR_ADDRESS as `0x${string}`,
        agentId: BigInt(process.env.VERITY_AGENT_ID ?? "0"),
        requestURI: reportUri,
      }),
    telemetry,
  };
  const out = await runResearch(
    {
      question, entities: ["USDY", "mUSD"], queryIds, allowlist, now: new Date().toISOString().slice(0, 10), sourceAllowlist,
      anchor: {
        agentId: process.env.VERITY_AGENT_ID ?? "—",
        registry: process.env.ERC8004_VALIDATION_REGISTRY ?? "—",
        chain: "Mantle mainnet (5000)",
      },
    },
    deps,
  );
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
