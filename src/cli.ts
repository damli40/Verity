import { readFileSync } from "node:fs";
import { loadAllowlist } from "./allowlist.js";
import { runOnchainScout } from "./scouts/onchain-finance-scout.js";
import { runWebScout } from "./scouts/web-scout.js";
import { synthesize } from "./synthesizer.js";
import { judge } from "./verify/llm-judge.js";
import { renderReportHtml, type ReportMeta } from "./report/render-html.js";
import { htmlToPdf } from "./report/generate-pdf.js";
import { hashFile } from "./attest-8004/hash.js";
import { attest } from "./attest-8004/attest.js";
import { makeTelemetry, defaultSink } from "./telemetry.js";
import { runResearch, type ResearchDeps } from "./operator.js";
import { loadSourceAllowlist } from "./verify/source-allowlist.js";
import { captureScrapes } from "./scouts/scrape-scout.js";
import { runRegistryScout, type RawCandidate } from "./discovery/registry-scout.js";
import { matchOnchain } from "./discovery/match-onchain.js";
import type { Report } from "./types.js";

const fixtureMode = process.argv.includes("--fixture");
const telemetry = makeTelemetry(defaultSink());
const outPdf = "examples/mantle-rwa-q2-2026.pdf";
// Public, resolvable pointer to the attested report (the on-chain requestHash anchors the actual
// bytes; this URI just lets a verifier fetch them). Overridable for other deployments.
const reportUri = process.env.VERITY_REPORT_URI ?? `https://raw.githubusercontent.com/damli40/Verity/main/${outPdf}`;

async function renderPdf(report: Report, meta: ReportMeta): Promise<string> {
  await htmlToPdf(renderReportHtml(report, meta), outPdf);
  return outPdf;
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
      synthesize: liveLlm ? synthesize : async () => structuredClone(fixtureReport),
      judge: liveLlm ? judge : async () => ({ passed: true, notes: "fixture: qualitative review stubbed offline" }),
      renderPdf,
      attest: async (pdf) => `simulated-0x${hashFile(pdf).slice(2, 14)}`, // offline demo: no real tx
      telemetry,
    };
    const out = await runResearch(
      { question: fx.question, entities: ["USDY", "mUSD"], queryIds: fx.queryIds, allowlist, now: fx.now, sourceAllowlist },
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
  const discoveryDomains = sourceAllowlist
    .filter((s) => s.roles.includes("discovery"))
    .map((s) => s.domain);
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
      // Discovery fetch is registry-specific and not yet automated; return none until a
      // per-registry parser is added. Quarantine-by-default keeps the Cardinal Rule intact.
      const fetchCandidates = async (_domain: string): Promise<RawCandidate[]> => [];
      const candidates = await runRegistryScout(fetchCandidates, discoveryDomains);
      return matchOnchain(candidates, allowlist, () => null);
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
    { question, entities: ["USDY", "mUSD"], queryIds, allowlist, now: new Date().toISOString().slice(0, 10), sourceAllowlist },
    deps,
  );
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
