# Verity v3 — Plan 1: Discovery Funnel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stubbed discovery (`fetchCandidates → []`, `lookup → null`) with a real funnel that discovers candidate Mantle RWAs, resolves each to an address via the issuer's own official source, and auto-verifies only on issuer-source ∩ on-chain agreement — so the agent finds RWAs beyond the two hand-typed tokens without ever trusting an invented address.

**Architecture:** Keep the existing `registry-scout → match-onchain → {verified, quarantined}` seam. Add candidate metadata (`claimedAddress`, `sourceUrl`), a strict pure issuer-address matcher, an async resolver that composes issuer-official page fetch + on-chain confirmation, and an async `matchOnchain` that auto-promotes issuer-confirmed candidates to verified allowlist entries. All external I/O is injected so logic is unit-testable offline.

**Tech Stack:** TypeScript (Node/ESM), `tsx` to run, `vitest` to test. Firecrawl (candidate extraction) + Etherscan V2 multichain API `chainid=5000` (on-chain confirmation) wired in the CLI composition root only.

## Global Constraints

- **Cardinal Rule (CLAUDE.md §5):** numbers validated programmatically, never by the LLM; an address is trusted only when traceable to the issuer's own official source; never invent or auto-trust an address from a bare registry claim.
- **Mantle mainnet = chainId 5000** for every synthesized allowlist entry.
- **Offline `--fixture` path must never hit the network and must stay green with zero API keys** (regression bar for every task).
- **TDD (§6):** failing test → run it fail → minimal impl → run it pass → commit. External I/O injected.
- **One commit per task**, using that task's commit message.
- **Update `handoff.md` (§7)** after the final task with the commit SHAs and status.
- TypeScript/ESM, one responsibility per file; match existing file boundaries and style.

---

### Task 1: Candidate metadata + issuer-official source role

**Files:**
- Modify: `src/types.ts` (SourceRole, RwaCandidate, SourceAllowlistEntry)
- Modify: `src/discovery/registry-scout.ts` (RawCandidate, parseCandidates passthrough)
- Modify: `src/discovery/registry-scout.test.ts`
- Modify: `src/verify/source-allowlist.test.ts`
- Modify: `data/source-allowlist.json`

**Interfaces:**
- Produces: `RwaCandidate` now carries optional `claimedAddress?: string` + `sourceUrl?: string`; `SourceRole` includes `"issuer-official"`; `SourceAllowlistEntry` carries optional `issuer?: string`. `parseCandidates` passes `claimedAddress`/`sourceUrl` through unchanged.

- [ ] **Step 1: Update the types**

In `src/types.ts`, change the `SourceRole` union and the two interfaces:

```typescript
/** What a web source is trusted to do. */
export type SourceRole = "discovery" | "corroboration" | "issuer-official";

export interface SourceAllowlistEntry {
  domain: string;
  roles: SourceRole[];
  /** The RWA issuer this domain officially belongs to (set on issuer-official entries). */
  issuer?: string;
}
```

And extend `RwaCandidate`:

```typescript
/** A candidate RWA asset discovered from a registry, before on-chain matching. */
export interface RwaCandidate {
  name: string;
  issuer: string;
  category: RwaCategory;
  networks: string[];
  /** Contract address as claimed by the discovery registry (UNVERIFIED until issuer-confirmed). */
  claimedAddress?: string;
  /** The registry page this candidate was discovered on. */
  sourceUrl?: string;
}
```

- [ ] **Step 2: Update the failing test for parseCandidates passthrough**

In `src/discovery/registry-scout.test.ts`, replace the first test's `raw`/expectation so the kept rows carry `claimedAddress`/`sourceUrl`:

```typescript
  it("keeps Mantle rows, coerces unknown category, defaults issuer, dedupes by name, passes address+url", () => {
    const raw: RawCandidate[] = [
      { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Ethereum", "Mantle"],
        claimedAddress: "0x5bE26527e817998A7206475496fDE1E68957c5A6", sourceUrl: "https://app.rwa.xyz/x" },
      { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Mantle"] }, // dup
      { name: "MI4", category: "wildcard-thing", networks: ["mantle"] }, // unknown cat → other, missing issuer
      { name: "OffChainOnly", issuer: "X", category: "index-fund", networks: ["Ethereum"] }, // not Mantle → dropped
      { issuer: "NoName", category: "other", networks: ["Mantle"] }, // no name → dropped
    ];
    const out = parseCandidates(raw);
    expect(out).toEqual([
      { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Ethereum", "Mantle"],
        claimedAddress: "0x5bE26527e817998A7206475496fDE1E68957c5A6", sourceUrl: "https://app.rwa.xyz/x" },
      { name: "MI4", issuer: "", category: "other", networks: ["mantle"], claimedAddress: undefined, sourceUrl: undefined },
    ]);
  });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/discovery/registry-scout.test.ts`
Expected: FAIL — output objects lack `claimedAddress`/`sourceUrl`.

- [ ] **Step 4: Implement the passthrough**

In `src/discovery/registry-scout.ts`, extend `RawCandidate` and the push in `parseCandidates`:

```typescript
/** A raw row as pulled from a discovery registry, before normalization. */
export interface RawCandidate {
  name?: string;
  issuer?: string;
  category?: string;
  networks?: string[];
  claimedAddress?: string;
  sourceUrl?: string;
}
```

```typescript
    out.push({
      name: r.name,
      issuer: r.issuer ?? "",
      category: coerceCategory(r.category),
      networks: r.networks ?? [],
      claimedAddress: r.claimedAddress,
      sourceUrl: r.sourceUrl,
    });
```

- [ ] **Step 5: Add the issuer-official allowlist data + test**

In `data/source-allowlist.json`, give the Ondo docs the `issuer-official` role + `issuer`, and add Securitize + Maple official domains:

```json
[
  { "domain": "app.rwa.xyz", "roles": ["discovery"] },
  { "domain": "defillama.com", "roles": ["discovery", "corroboration"] },
  { "domain": "messari.io", "roles": ["discovery", "corroboration"] },
  { "domain": "mantle.xyz", "roles": ["corroboration"] },
  { "domain": "docs.ondo.finance", "roles": ["corroboration", "issuer-official"], "issuer": "Ondo" },
  { "domain": "securitize.io", "roles": ["issuer-official"], "issuer": "Securitize" },
  { "domain": "maple.finance", "roles": ["issuer-official"], "issuer": "Maple" }
]
```

In `src/verify/source-allowlist.test.ts`, add a case inside the existing `describe("loadSourceAllowlist", …)`:

```typescript
  it("carries at least one issuer-official domain with an issuer name", () => {
    const l = loadSourceAllowlist("data/source-allowlist.json");
    const io = l.filter((e) => e.roles.includes("issuer-official"));
    expect(io.length).toBeGreaterThan(0);
    expect(io.every((e) => typeof e.issuer === "string" && e.issuer.length > 0)).toBe(true);
  });
```

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 7: Verify the offline fixture still renders**

Run: `npx tsx src/cli.ts --fixture`
Expected: JSON with `"passed": true` (the optional candidate fields don't break the cached `discovered` block).

- [ ] **Step 8: Commit**

```bash
git add src/types.ts src/discovery/registry-scout.ts src/discovery/registry-scout.test.ts src/verify/source-allowlist.test.ts data/source-allowlist.json
git commit -m "feat(discovery): candidate address/url metadata + issuer-official source role"
```

---

### Task 2: Strict issuer-address matcher (pure)

**Files:**
- Create: `src/discovery/resolve-address.ts`
- Create: `src/discovery/resolve-address.test.ts`

**Interfaces:**
- Produces: `matchIssuerAddress(claimedAddress: string | undefined, issuerPageText: string): string | null` — the Cardinal-Rule core: an address is returned only when the issuer's own page confirms it.

- [ ] **Step 1: Write the failing test**

Create `src/discovery/resolve-address.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { matchIssuerAddress } from "./resolve-address.js";

const USDY = "0x5bE26527e817998A7206475496fDE1E68957c5A6";

describe("matchIssuerAddress", () => {
  it("confirms a claimed address that literally appears on the issuer page (case-insensitive)", () => {
    const page = `Mantle deployment: ${USDY.toLowerCase()} — USDY`;
    expect(matchIssuerAddress(USDY, page)).toBe(USDY);
  });
  it("rejects a claimed address the issuer page does not contain (registry claim unconfirmed)", () => {
    const page = `Mantle deployment: 0x1111111111111111111111111111111111111111`;
    expect(matchIssuerAddress(USDY, page)).toBeNull();
  });
  it("returns the sole address when none is claimed and the page is unambiguous", () => {
    expect(matchIssuerAddress(undefined, `Address: ${USDY}`)).toBe(USDY);
  });
  it("returns null when no address is claimed and the page lists several (ambiguous)", () => {
    const page = `${USDY} and 0x1111111111111111111111111111111111111111`;
    expect(matchIssuerAddress(undefined, page)).toBeNull();
  });
  it("returns null when the page has no address at all", () => {
    expect(matchIssuerAddress(USDY, "no addresses here")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/discovery/resolve-address.test.ts`
Expected: FAIL with "Cannot find module './resolve-address.js'".

- [ ] **Step 3: Write the minimal implementation**

Create `src/discovery/resolve-address.ts`:

```typescript
const ADDR_RE = /0x[a-fA-F0-9]{40}/g;

/**
 * Strictly extract the issuer-confirmed contract address for a candidate from its issuer-official page text.
 * The Cardinal Rule (§5) lives here: an address is trusted ONLY when the issuer's own page confirms it.
 * - With a claimedAddress: return it iff that exact address (case-insensitive) appears literally in the page.
 * - Without one: return the page's single address iff exactly one distinct address is present (unambiguous).
 * Pure — no I/O.
 */
export function matchIssuerAddress(claimedAddress: string | undefined, issuerPageText: string): string | null {
  const found = [...issuerPageText.matchAll(ADDR_RE)].map((m) => m[0]);
  const distinct = [...new Set(found.map((a) => a.toLowerCase()))];
  if (claimedAddress) {
    return distinct.includes(claimedAddress.toLowerCase()) ? claimedAddress : null;
  }
  return distinct.length === 1 ? found[0] : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/discovery/resolve-address.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/discovery/resolve-address.ts src/discovery/resolve-address.test.ts
git commit -m "feat(discovery): strict issuer-official address matcher"
```

---

### Task 3: Issuer-official domain lookup + async resolver

**Files:**
- Modify: `src/verify/source-allowlist.ts` (add `issuerOfficialDomain`)
- Modify: `src/verify/source-allowlist.test.ts`
- Modify: `src/discovery/resolve-address.ts` (add `ResolvedAddress`, `makeLookup`)
- Modify: `src/discovery/resolve-address.test.ts`

**Interfaces:**
- Consumes: `matchIssuerAddress` (Task 2); `SourceAllowlistEntry` with `issuer?` (Task 1).
- Produces:
  - `issuerOfficialDomain(issuer: string, list: SourceAllowlistEntry[]): string | null`
  - `interface ResolvedAddress { address: string; category: RwaCategory; provenance: string }`
  - `makeLookup(deps: { list: SourceAllowlistEntry[]; fetchText: (url: string) => Promise<string>; confirmOnchain: (address: string) => Promise<boolean> }): (c: RwaCandidate) => Promise<ResolvedAddress | null>`

- [ ] **Step 1: Write the failing test for issuerOfficialDomain**

In `src/verify/source-allowlist.test.ts`, add the import and a describe block:

```typescript
import { loadSourceAllowlist, hasRole, issuerOfficialDomain } from "./source-allowlist.js";
```

```typescript
describe("issuerOfficialDomain", () => {
  const l: SourceAllowlistEntry[] = [
    { domain: "docs.ondo.finance", roles: ["issuer-official"], issuer: "Ondo" },
    { domain: "app.rwa.xyz", roles: ["discovery"] },
  ];
  it("returns the issuer-official domain for a known issuer (case-insensitive)", () => {
    expect(issuerOfficialDomain("ondo", l)).toBe("docs.ondo.finance");
  });
  it("returns null for an unknown issuer", () => {
    expect(issuerOfficialDomain("Unknown Co", l)).toBeNull();
  });
  it("returns null when the matching domain lacks the issuer-official role", () => {
    expect(issuerOfficialDomain("rwa.xyz", l)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/verify/source-allowlist.test.ts`
Expected: FAIL — `issuerOfficialDomain` is not exported.

- [ ] **Step 3: Implement issuerOfficialDomain**

In `src/verify/source-allowlist.ts`, add:

```typescript
/** The issuer-official domain registered for `issuer`, or null. Match is case-insensitive on issuer name. */
export function issuerOfficialDomain(issuer: string, list: SourceAllowlistEntry[]): string | null {
  const i = issuer.trim().toLowerCase();
  if (!i) return null;
  const hit = list.find(
    (e) => e.roles.includes("issuer-official") && (e.issuer ?? "").toLowerCase() === i,
  );
  return hit ? hit.domain : null;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/verify/source-allowlist.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing test for makeLookup**

In `src/discovery/resolve-address.test.ts`, add imports + a describe block:

```typescript
import { makeLookup } from "./resolve-address.js";
import type { RwaCandidate, SourceAllowlistEntry } from "../types.js";

const list: SourceAllowlistEntry[] = [
  { domain: "docs.ondo.finance", roles: ["issuer-official"], issuer: "Ondo" },
];
const ondo = (claimedAddress?: string): RwaCandidate =>
  ({ name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Mantle"], claimedAddress });

describe("makeLookup", () => {
  it("resolves when issuer page confirms the address AND it is a real on-chain ERC-20", async () => {
    const lookup = makeLookup({
      list,
      fetchText: async () => `USDY on Mantle: ${USDY}`,
      confirmOnchain: async () => true,
    });
    const r = await lookup(ondo(USDY));
    expect(r?.address).toBe(USDY);
    expect(r?.category).toBe("tokenized-treasuries");
    expect(r?.provenance).toContain("docs.ondo.finance");
  });
  it("returns null for an unknown issuer (no issuer-official domain)", async () => {
    const lookup = makeLookup({ list, fetchText: async () => USDY, confirmOnchain: async () => true });
    const r = await lookup({ name: "Mystery", issuer: "Nobody", category: "other", networks: ["Mantle"] });
    expect(r).toBeNull();
  });
  it("returns null when the issuer page does not confirm the claimed address", async () => {
    const lookup = makeLookup({ list, fetchText: async () => "no match here", confirmOnchain: async () => true });
    expect(await lookup(ondo(USDY))).toBeNull();
  });
  it("returns null when on-chain confirmation fails (not a real ERC-20)", async () => {
    const lookup = makeLookup({ list, fetchText: async () => `USDY: ${USDY}`, confirmOnchain: async () => false });
    expect(await lookup(ondo(USDY))).toBeNull();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/discovery/resolve-address.test.ts`
Expected: FAIL — `makeLookup` is not exported.

- [ ] **Step 7: Implement ResolvedAddress + makeLookup**

In `src/discovery/resolve-address.ts`, add the imports at the top and the new exports:

```typescript
import type { RwaCandidate, RwaCategory, SourceAllowlistEntry } from "../types.js";
import { issuerOfficialDomain } from "../verify/source-allowlist.js";
```

```typescript
/** A candidate resolved to a trusted on-chain address (issuer-official ∩ on-chain confirmed). */
export interface ResolvedAddress {
  address: string;
  category: RwaCategory;
  provenance: string;
}

export interface LookupDeps {
  list: SourceAllowlistEntry[];
  fetchText: (url: string) => Promise<string>;
  confirmOnchain: (address: string) => Promise<boolean>;
}

/**
 * Compose issuer-official confirmation: resolve the issuer's official domain, fetch it, require the page
 * to confirm the address (matchIssuerAddress), then require on-chain ERC-20 confirmation. Any failure ⇒
 * null (the caller quarantines). Never trusts a bare registry claim.
 */
export function makeLookup(deps: LookupDeps): (c: RwaCandidate) => Promise<ResolvedAddress | null> {
  return async (c) => {
    const domain = issuerOfficialDomain(c.issuer, deps.list);
    if (!domain) return null;
    const url = `https://${domain}`;
    const text = await deps.fetchText(url).catch(() => "");
    const address = matchIssuerAddress(c.claimedAddress, text);
    if (!address) return null;
    const ok = await deps.confirmOnchain(address).catch(() => false);
    if (!ok) return null;
    return {
      address,
      category: c.category,
      provenance: `Issuer-official source ${url} confirms ${address}; on-chain ERC-20 verified on Mantle (chainId 5000).`,
    };
  };
}
```

- [ ] **Step 8: Run it to verify it passes**

Run: `npx vitest run src/discovery/resolve-address.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean.

- [ ] **Step 9: Commit**

```bash
git add src/verify/source-allowlist.ts src/verify/source-allowlist.test.ts src/discovery/resolve-address.ts src/discovery/resolve-address.test.ts
git commit -m "feat(discovery): issuer-official domain lookup + async address resolver"
```

---

### Task 4: Async matchOnchain with issuer-confirmed auto-promotion

**Files:**
- Modify: `src/discovery/match-onchain.ts`
- Modify: `src/discovery/match-onchain.test.ts`

**Interfaces:**
- Consumes: `ResolvedAddress` (Task 3); `AllowlistEntry`, `RwaCandidate`.
- Produces: `matchOnchain(candidates, allowlist, lookup: (c) => Promise<ResolvedAddress | null>): Promise<DiscoveryResult>`. A non-null resolution is issuer-confirmed by construction → verified (reusing the existing allowlist entry if the address is already on it, else synthesizing a `status:"verified"` entry). Null ⇒ quarantined.

- [ ] **Step 1: Rewrite the test to the new (async, auto-promoting) contract**

Replace the body of `src/discovery/match-onchain.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { matchOnchain } from "./match-onchain.js";
import type { AllowlistEntry, RwaCandidate } from "../types.js";
import type { ResolvedAddress } from "./resolve-address.js";

const USDY = "0x5bE26527e817998A7206475496fDE1E68957c5A6";
const allowlist: AllowlistEntry[] = [
  { name: "USDY", address: USDY, chainId: 5000,
    category: "tokenized-treasuries", status: "verified", provenance: "Ondo docs" },
];
const cand = (name: string, category: RwaCandidate["category"] = "other"): RwaCandidate =>
  ({ name, issuer: "x", category, networks: ["Mantle"] });
const resolves = (address: string, category: RwaCandidate["category"] = "other"): ResolvedAddress =>
  ({ address, category, provenance: "issuer-official ∩ on-chain" });

describe("matchOnchain", () => {
  it("returns the existing allowlist entry when an issuer-confirmed address is already on it", async () => {
    const r = await matchOnchain([cand("USDY", "tokenized-treasuries")], allowlist,
      async () => resolves(USDY, "tokenized-treasuries"));
    expect(r.verified.map((e) => e.name)).toEqual(["USDY"]);
    expect(r.verified[0].provenance).toBe("Ondo docs"); // existing entry preserved
    expect(r.quarantined).toEqual([]);
  });
  it("auto-promotes a NEW issuer-confirmed candidate to a synthesized verified entry", async () => {
    const newAddr = "0xab575258d37EaA5C8956EfABe71F4eE8F6397cF3";
    const r = await matchOnchain([cand("mUSD", "tokenized-treasuries")], allowlist,
      async () => resolves(newAddr, "tokenized-treasuries"));
    expect(r.verified).toHaveLength(1);
    expect(r.verified[0]).toMatchObject({
      name: "mUSD", address: newAddr, chainId: 5000, category: "tokenized-treasuries", status: "verified",
    });
    expect(r.verified[0].provenance).toContain("issuer-official");
    expect(r.quarantined).toEqual([]);
  });
  it("quarantines a candidate the resolver could not confirm (null)", async () => {
    const r = await matchOnchain([cand("Ghost")], allowlist, async () => null);
    expect(r.verified).toEqual([]);
    expect(r.quarantined.map((c) => c.name)).toEqual(["Ghost"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/discovery/match-onchain.test.ts`
Expected: FAIL — current `matchOnchain` is synchronous, takes a `() => string | null` lookup, and never synthesizes entries.

- [ ] **Step 3: Implement the async, auto-promoting matchOnchain**

Replace `src/discovery/match-onchain.ts`:

```typescript
import type { AllowlistEntry, RwaCandidate } from "../types.js";
import type { ResolvedAddress } from "./resolve-address.js";

export interface DiscoveryResult {
  verified: AllowlistEntry[];
  quarantined: RwaCandidate[];
}

/**
 * Resolve each candidate via `lookup` (issuer-official ∩ on-chain). A non-null resolution is
 * issuer-confirmed by construction → verified: reuse the existing allowlist entry when the address is
 * already on it, otherwise synthesize a `status:"verified"` entry (the deliberate auto-promotion, spec §5
 * decision 5 — gated on issuer-source agreement, never a bare registry claim). Unresolved ⇒ quarantined.
 */
export async function matchOnchain(
  candidates: RwaCandidate[],
  allowlist: AllowlistEntry[],
  lookup: (c: RwaCandidate) => Promise<ResolvedAddress | null>,
): Promise<DiscoveryResult> {
  const verifiedByAddr = new Map(
    allowlist.filter((e) => e.status === "verified").map((e) => [e.address.toLowerCase(), e]),
  );
  const verified: AllowlistEntry[] = [];
  const quarantined: RwaCandidate[] = [];
  for (const c of candidates) {
    const resolved = await lookup(c);
    if (!resolved) {
      quarantined.push(c);
      continue;
    }
    const existing = verifiedByAddr.get(resolved.address.toLowerCase());
    verified.push(
      existing ?? {
        name: c.name,
        address: resolved.address,
        chainId: 5000,
        category: resolved.category,
        status: "verified",
        provenance: resolved.provenance,
      },
    );
  }
  return { verified, quarantined };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/discovery/match-onchain.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean. (tsc will flag the CLI's old synchronous `lookup` — fixed in Task 5.)

- [ ] **Step 5: Commit**

```bash
git add src/discovery/match-onchain.ts src/discovery/match-onchain.test.ts
git commit -m "feat(discovery): async matchOnchain with issuer-confirmed auto-promotion"
```

---

### Task 5: Live candidate adapter + CLI wiring

**Files:**
- Create: `src/discovery/sources.ts` (pure `toRawCandidate`)
- Create: `src/discovery/sources.test.ts`
- Modify: `src/cli.ts` (live `discover` wiring)
- Modify: `.env.example`

**Interfaces:**
- Consumes: `RawCandidate` (Task 1), `runRegistryScout`, `makeLookup` (Task 3), `matchOnchain` (Task 4), `loadSourceAllowlist`.
- Produces: `toRawCandidate(row: Record<string, unknown>, sourceUrl: string): RawCandidate` — maps one extracted registry row into a `RawCandidate`, tolerant of missing fields.

- [ ] **Step 1: Write the failing test for toRawCandidate**

Create `src/discovery/sources.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { toRawCandidate } from "./sources.js";

describe("toRawCandidate", () => {
  it("maps a full extracted row (networks array) into a RawCandidate carrying the source url", () => {
    const row = { name: "USDY", issuer: "Ondo", category: "tokenized-treasuries",
      networks: ["Mantle"], address: "0x5bE2…" };
    expect(toRawCandidate(row, "https://app.rwa.xyz/x")).toEqual({
      name: "USDY", issuer: "Ondo", category: "tokenized-treasuries", networks: ["Mantle"],
      claimedAddress: "0x5bE2…", sourceUrl: "https://app.rwa.xyz/x",
    });
  });
  it("accepts a singular `network` string and leaves missing fields undefined", () => {
    expect(toRawCandidate({ name: "MI4", network: "Mantle" }, "https://defillama.com")).toEqual({
      name: "MI4", issuer: undefined, category: undefined, networks: ["Mantle"],
      claimedAddress: undefined, sourceUrl: "https://defillama.com",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/discovery/sources.test.ts`
Expected: FAIL with "Cannot find module './sources.js'".

- [ ] **Step 3: Implement toRawCandidate**

Create `src/discovery/sources.ts`:

```typescript
import type { RawCandidate } from "./registry-scout.js";

/**
 * Map one extracted registry row into a RawCandidate. Tolerant of missing fields and of `networks`
 * being either an array or a singular `network` string. The actual extraction call (Firecrawl) lives in
 * the CLI composition root; this pure mapper is what we unit-test.
 */
export function toRawCandidate(row: Record<string, unknown>, sourceUrl: string): RawCandidate {
  const networks = Array.isArray(row.networks)
    ? (row.networks as unknown[]).map(String)
    : typeof row.network === "string"
      ? [row.network]
      : [];
  return {
    name: typeof row.name === "string" ? row.name : undefined,
    issuer: typeof row.issuer === "string" ? row.issuer : undefined,
    category: typeof row.category === "string" ? row.category : undefined,
    networks,
    claimedAddress: typeof row.address === "string" ? row.address : undefined,
    sourceUrl,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/discovery/sources.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the live `discover` path in the CLI**

In `src/cli.ts`, update the imports:

```typescript
import { runRegistryScout, type RawCandidate } from "./discovery/registry-scout.js";
import { matchOnchain } from "./discovery/match-onchain.js";
import { makeLookup } from "./discovery/resolve-address.js";
import { toRawCandidate } from "./discovery/sources.js";
```

Replace the entire live `discover:` property (the stub that returns `[]`/`null`) with:

```typescript
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
```

Add these two composition-root helpers above `async function main()` in `src/cli.ts`:

```typescript
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
```

- [ ] **Step 6: Add the new env vars**

In `.env.example`, append under the discovery section:

```bash
# Discovery: Firecrawl extracts candidate RWAs from discovery-role registries; Etherscan V2 (chainid 5000)
# confirms a resolved address is a real on-chain contract on Mantle. Without these keys, live discovery
# returns nothing (quarantine-by-default) — the offline --fixture path never needs them.
FIRECRAWL_API_KEY=
ETHERSCAN_API_KEY=
```

- [ ] **Step 7: Verify tsc is clean and the offline fixture still renders**

Run: `npx vitest run && npx tsc --noEmit`
Expected: full suite PASS, tsc clean (the async-lookup mismatch from Task 4 is now resolved).

Run: `npx tsx src/cli.ts --fixture`
Expected: `"passed": true`. The fixture path uses the cached `discovered` block and never calls `extractRwaRows`/`confirmErc20OnMantle`, so no keys are required.

- [ ] **Step 8: Commit**

```bash
git add src/discovery/sources.ts src/discovery/sources.test.ts src/cli.ts .env.example
git commit -m "feat(discovery): live candidate adapter + CLI funnel wiring (Firecrawl + Etherscan)"
```

---

### Task 6: Update handoff

**Files:**
- Modify: `handoff.md`

- [ ] **Step 1: Record Plan 1 completion**

Append a dated entry to the `## Progress log` in `handoff.md`: discovery funnel wired (candidate metadata + issuer-official role + strict matcher + async resolver + auto-promoting matchOnchain + live Firecrawl/Etherscan adapters), the test count, `tsc` clean, offline `--fixture` green, and the per-task commit SHAs. Note the accepted follow-ups: additional candidate sources (DefiLlama protocol list, Nansen screener, Dune issuer-deployer enumeration) are same-shaped injected adapters deferred to keep Plan 1 lean; live discovery correctness is exercised end-to-end in Plan 3's flagship run.

- [ ] **Step 2: Commit**

```bash
git add handoff.md
git commit -m "docs(handoff): Verity v3 Plan 1 (discovery funnel) complete"
```

---

## Self-Review

**Spec coverage (Plan 1 scope):**
- Types delta (`claimedAddress`, `sourceUrl`, `issuer-official` role) → Task 1. ✓
- Issuer-official resolution (`lookup`) with strict address confirmation → Tasks 2–3. ✓
- `matchOnchain` auto-promote only on issuer-source ∩ on-chain agreement → Task 4. ✓
- Live `fetchCandidates` + CLI wiring → Task 5. ✓
- Cardinal Rule (no bare-claim trust; null ⇒ quarantine) enforced in `matchIssuerAddress`/`makeLookup`/`matchOnchain`. ✓
- Offline `--fixture` regression bar checked in Tasks 1, 5. ✓
- Deferred (noted in Task 6): DefiLlama/Nansen/Dune-deployer candidate sources are additional same-shaped injected adapters — out of scope for Plan 1 by design (one real address-bearing source proves the funnel); Nansen/Etherscan as *verification* providers are Plan 2.

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every run step states expected output.

**Type consistency:** `RawCandidate` (with `claimedAddress`/`sourceUrl`) is produced by Task 1 and consumed by Tasks 4–5; `ResolvedAddress` is produced by Task 3 and consumed by Task 4's `matchOnchain` and its test; `makeLookup`'s `(c) => Promise<ResolvedAddress | null>` signature matches `matchOnchain`'s `lookup` parameter; `issuerOfficialDomain` is defined in Task 3 and used by `makeLookup` in the same task. Consistent.
