import type { ClaimTier } from "../types.js";

/** Tier badge colors: Verified=green, Corroborated=amber, Forward-looking=grey. */
export const TIER_COLORS: Record<ClaimTier, string> = {
  verified: "#1a7f4b",
  corroborated: "#b8860b",
  "forward-looking": "#6b7280",
};

export const TIER_LABELS: Record<ClaimTier, string> = {
  verified: "Verified",
  corroborated: "Corroborated",
  "forward-looking": "Forward-looking",
};

/** Base stylesheet for the landscape deck. Programmatic only — no external fonts/images. */
export function themeCss(): string {
  return `
 @page { size: A4 landscape; margin: 0; }
 * { box-sizing: border-box; }
 body { margin: 0; color: #14181f; font-family: -apple-system, "Segoe UI", Roboto, sans-serif; }
 .slide { position: relative; width: 297mm; height: 209mm; padding: 22mm 26mm 18mm; overflow: hidden; page-break-after: always; }
 .slide:last-child { page-break-after: auto; }
 h1, h2, .display { font-family: Georgia, "Times New Roman", serif; font-weight: 700; letter-spacing: -0.01em; }
 .cover { background: linear-gradient(135deg, #0b1f3a 0%, #123a63 55%, #1f6f8b 100%); color: #f5f8fc; display: flex; flex-direction: column; justify-content: center; }
 .cover .kicker { text-transform: uppercase; letter-spacing: 0.18em; font-size: 12px; opacity: 0.8; }
 .cover h1 { font-size: 40px; line-height: 1.1; margin: 14px 0; max-width: 80%; }
 .cover .asof { font-size: 14px; opacity: 0.85; }
 .divider { background: linear-gradient(135deg, #11253f 0%, #1f6f8b 100%); color: #f5f8fc; display: flex; flex-direction: column; justify-content: center; }
 .divider .numeral { font-size: 56px; opacity: 0.6; }
 .divider h2 { font-size: 34px; margin: 6px 0 0; }
 .content h1 { font-size: 26px; line-height: 1.2; margin: 0 0 10px; max-width: 70%; }
 .content .body { font-size: 15px; line-height: 1.55; max-width: 60%; color: #2a313c; }
 .panel { position: absolute; right: 26mm; top: 30mm; width: 105mm; }
 .panel canvas { max-width: 105mm; }
 .callout { margin-top: 18px; font-family: Georgia, serif; font-size: 20px; color: #123a63; }
 .badge { display: inline-block; padding: 3px 10px; border-radius: 999px; color: #fff; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
 .badge.verified { background: ${TIER_COLORS.verified}; }
 .badge.corroborated { background: ${TIER_COLORS.corroborated}; }
 .badge.forward-looking { background: ${TIER_COLORS["forward-looking"]}; }
 .caption { margin-top: 8px; font-size: 12px; color: #5b6470; }
 .toc h2 { font-size: 28px; margin: 0 0 18px; }
 .toc ol { font-size: 16px; line-height: 2; list-style: none; padding: 0; }
 .toc .pages { color: #5b6470; }
 .appendix h2 { font-size: 26px; margin: 0 0 14px; }
 .appendix ul { font-size: 12px; line-height: 1.8; }
 .footer { position: absolute; left: 26mm; right: 26mm; bottom: 10mm; display: flex; justify-content: space-between; font-size: 11px; color: #8b94a0; border-top: 1px solid #e3e7ec; padding-top: 6px; }
`;
}
