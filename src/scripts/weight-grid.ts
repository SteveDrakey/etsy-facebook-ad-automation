/**
 * READ-ONLY: per-listing table showing smallest / mid / largest scale
 * with computed weight and suggested processing-time tier for each.
 *
 * Lets you see at a glance which listings have a wide enough range that
 * per-variation processing times would help (e.g. small ships in 1-3d
 * but large takes 1-2 weeks).
 *
 * Tiers: <=150g → 1-3d | 150-500g → 3-5d | >500g → 7-14d
 *
 * Usage: npx tsx src/scripts/weight-grid.ts
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;

const REF_HEIGHT_CM = 30;
const REF_WEIGHT_G = 39;
const SCALING_EXPONENT = 2.5;
const MULTICOLOUR_MULT = 1.5;

interface Profile { realHeightM: number; widthFactor: number; multiColour: boolean }
const BUILDINGS: Record<string, Profile> = {
  "Burj Khalifa": { realHeightM: 828, widthFactor: 0.8, multiColour: false },
  "Merdeka 118": { realHeightM: 679, widthFactor: 1.0, multiColour: false },
  "Shanghai Tower": { realHeightM: 632, widthFactor: 1.3, multiColour: false },
  "Jeddah Tower": { realHeightM: 1000, widthFactor: 0.8, multiColour: false },
  "Lotte World Tower": { realHeightM: 555, widthFactor: 0.9, multiColour: false },
  "Grollo Tower (1997)": { realHeightM: 678, widthFactor: 0.9, multiColour: false },
  "Grollo Tower (2001)": { realHeightM: 560, widthFactor: 0.9, multiColour: false },
  "One World Trade Center": { realHeightM: 541, widthFactor: 1.1, multiColour: false },
  "Taipei 101": { realHeightM: 508, widthFactor: 1.3, multiColour: false },
  "China Zun (CITIC Tower)": { realHeightM: 528, widthFactor: 1.1, multiColour: false },
  "Goldin Finance 117": { realHeightM: 597, widthFactor: 1.0, multiColour: false },
  "Princess Tower Dubai": { realHeightM: 414, widthFactor: 0.9, multiColour: false },
  "Gevora Hotel": { realHeightM: 356, widthFactor: 0.9, multiColour: false },
  "Q1 Tower": { realHeightM: 323, widthFactor: 0.9, multiColour: false },
  "Jin Mao Tower": { realHeightM: 421, widthFactor: 1.2, multiColour: false },
  "The Shard": { realHeightM: 310, widthFactor: 0.7, multiColour: false },
  "Empire State Building": { realHeightM: 443, widthFactor: 1.5, multiColour: false },
  "Chrysler Building": { realHeightM: 319, widthFactor: 1.3, multiColour: false },
  "Shanghai World Financial Center": { realHeightM: 492, widthFactor: 1.2, multiColour: false },
  "Hancock Tower": { realHeightM: 457, widthFactor: 1.4, multiColour: false },
  "432 Park Avenue": { realHeightM: 426, widthFactor: 0.7, multiColour: true },
  "Oriental Pearl Tower": { realHeightM: 468, widthFactor: 1.8, multiColour: false },
  "Petronas Twin Towers": { realHeightM: 452, widthFactor: 2.5, multiColour: false },
  "Willis Tower": { realHeightM: 442, widthFactor: 2.2, multiColour: true },
  "Ryugyong Hotel": { realHeightM: 330, widthFactor: 2.0, multiColour: false },
  "The Gherkin": { realHeightM: 180, widthFactor: 1.8, multiColour: false },
  "Walkie Talkie Building": { realHeightM: 160, widthFactor: 2.0, multiColour: false },
  "BT Tower": { realHeightM: 177, widthFactor: 0.9, multiColour: false },
  "NatWest Tower": { realHeightM: 183, widthFactor: 1.0, multiColour: false },
  "Flatiron Building": { realHeightM: 87, widthFactor: 1.5, multiColour: false },
  "Leadenhall Building": { realHeightM: 225, widthFactor: 1.6, multiColour: true },
  "Merdeka 118 Shiny": { realHeightM: 679, widthFactor: 1.0, multiColour: true },
  "Chrysler Building Colour": { realHeightM: 319, widthFactor: 1.3, multiColour: true },
  "One World Trade Center Colour": { realHeightM: 541, widthFactor: 1.1, multiColour: true },
  "Lotte World Tower Colour": { realHeightM: 555, widthFactor: 0.9, multiColour: true },
  "The Gherkin Colour": { realHeightM: 180, widthFactor: 1.8, multiColour: true },
  "Walkie Talkie Building Colour": { realHeightM: 160, widthFactor: 2.0, multiColour: true },
  "Shanghai World Financial Center Colour": { realHeightM: 492, widthFactor: 1.2, multiColour: true },
  "St. Peter's Basilica (Facade)": { realHeightM: 136, widthFactor: 3.0, multiColour: false },
  "St. Peter's Basilica & Square": { realHeightM: 136, widthFactor: 5.0, multiColour: false },
  "Lotus Temple": { realHeightM: 34, widthFactor: 4.0, multiColour: false },
  "Santa Ana Cathedral (Facade)": { realHeightM: 34, widthFactor: 3.0, multiColour: false },
  "Sagrada Familia (Facade)": { realHeightM: 172, widthFactor: 3.5, multiColour: false },
  "World Trade Center (Twin Towers)": { realHeightM: 417, widthFactor: 2.5, multiColour: false },
  "Wrigley Field Stadium": { realHeightM: 30, widthFactor: 8.0, multiColour: false },
  "London Skyline Bundle": { realHeightM: 310, widthFactor: 6.0, multiColour: false },
  "Shanghai Skyline Bundle": { realHeightM: 632, widthFactor: 6.0, multiColour: false },
  "New York City Times Square Skyline": { realHeightM: 380, widthFactor: 7.0, multiColour: false },
  "San Francisco Downtown Skyline": { realHeightM: 260, widthFactor: 7.0, multiColour: false },
  "San Francisco Downtown": { realHeightM: 260, widthFactor: 8.0, multiColour: false },
  "Miniature Shanghai": { realHeightM: 200, widthFactor: 6.0, multiColour: false },
  "Canary Wharf": { realHeightM: 235, widthFactor: 5.0, multiColour: false },
};

const WEIGHT_OVERRIDES: Record<number, number> = {
  4426197221: 1.2, // WTC Twin Towers — very detailed, slow print
};

function computeWeight(heightCm: number, p: Profile): number {
  const colour = p.multiColour ? MULTICOLOUR_MULT : 1.0;
  return REF_WEIGHT_G * Math.pow(heightCm / REF_HEIGHT_CM, SCALING_EXPONENT) * Math.pow(p.widthFactor, 2) * colour;
}

function tierFor(weightG: number): string {
  if (weightG <= 150) return "1-3d";
  if (weightG <= 500) return "3-5d";
  return "7-14d";
}

function matchBuilding(title: string): string | null {
  const t = title.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  if (t.includes("shiny") && t.includes("merdeka")) return "Merdeka 118 Shiny";
  if (t.includes("colour") && t.includes("chrysler")) return "Chrysler Building Colour";
  if (t.includes("colour") && t.includes("one world")) return "One World Trade Center Colour";
  if (t.includes("multi-colour") && t.includes("lotte")) return "Lotte World Tower Colour";
  if (t.includes("colour") && t.includes("lotte")) return "Lotte World Tower Colour";
  if (t.includes("colour") && t.includes("gherkin")) return "The Gherkin Colour";
  if (t.includes("multi colour") && t.includes("walkie")) return "Walkie Talkie Building Colour";
  if (t.includes("colour") && t.includes("walkie")) return "Walkie Talkie Building Colour";
  if (t.includes("colour") && t.includes("shanghai world")) return "Shanghai World Financial Center Colour";
  const candidates = Object.keys(BUILDINGS).sort((a, b) => b.length - a.length);
  for (const name of candidates) {
    if (t.includes(name.toLowerCase())) return name;
  }
  return null;
}

function parseScaleHeight(val: string): number | null {
  const m = val.match(/1:(\d+)\s*[-–—~]\s*([\d.]+)\s*cm/);
  if (m) return parseFloat(m[2]);
  const cm = val.match(/([\d.]+)\s*cm/i);
  if (cm) return parseFloat(cm[1]);
  return null;
}

function allScaleHeights(inventory: any): number[] {
  const heights = new Set<number>();
  const products = (inventory?.products || []).filter((p: any) => !p.is_deleted);
  for (const prod of products) {
    const sv = (prod.property_values || []).find(
      (pv: any) => pv.property_name === "Scale" || pv.property_name === "Size"
    );
    if (!sv) continue;
    for (const v of sv.values) {
      const h = parseScaleHeight(v);
      if (h !== null) heights.add(h);
    }
  }
  return [...heights].sort((a, b) => a - b);
}

async function fetchActiveListings(token: string): Promise<any[]> {
  const all: any[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const url = `${BASE}/shops/${SHOP_ID}/listings/active?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, { headers: { "x-api-key": API_KEY, Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const body = (await res.json()) as any;
    all.push(...body.results);
    if (all.length >= body.count || body.results.length === 0) break;
    offset += limit;
  }
  return all;
}

async function fetchInventory(listingId: number, token: string): Promise<any> {
  const res = await fetch(`${BASE}/listings/${listingId}/inventory`, {
    headers: { "x-api-key": API_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

interface Row {
  id: number;
  title: string;
  building: string | null;
  small: { cm: number; g: number; tier: string } | null;
  mid: { cm: number; g: number; tier: string } | null;
  large: { cm: number; g: number; tier: string } | null;
  currentProcessing: string;
  worstTier: string;
  spread: boolean; // true if small and large fall in different tiers
}

async function main() {
  const token = await getAccessToken();
  const listings = await fetchActiveListings(token);
  console.log(`Fetched ${listings.length} active listings; pulling inventories...`);

  const rows: Row[] = [];

  for (const l of listings) {
    const bn = matchBuilding(l.title || "");
    const profile = bn ? BUILDINGS[bn] : null;
    const inv = await fetchInventory(l.listing_id, token);
    const heights = allScaleHeights(inv);
    const mult = WEIGHT_OVERRIDES[l.listing_id] ?? 1;
    await new Promise((r) => setTimeout(r, 220)); // ~5 QPS

    let small = null, mid = null, large = null;
    if (profile && heights.length > 0) {
      const smallH = heights[0];
      const largeH = heights[heights.length - 1];
      const midH = heights[Math.floor((heights.length - 1) / 2)];
      const sw = computeWeight(smallH, profile) * mult;
      const mw = computeWeight(midH, profile) * mult;
      const lw = computeWeight(largeH, profile) * mult;
      small = { cm: smallH, g: sw, tier: tierFor(sw) };
      mid = { cm: midH, g: mw, tier: tierFor(mw) };
      large = { cm: largeH, g: lw, tier: tierFor(lw) };
    }

    rows.push({
      id: l.listing_id,
      title: (l.title || "").slice(0, 50),
      building: bn,
      small, mid, large,
      currentProcessing: `${l.processing_min}-${l.processing_max}d`,
      worstTier: large?.tier || "?",
      spread: !!(small && large && small.tier !== large.tier),
    });
  }

  // Sort: spread listings first (most interesting), then by worst tier severity
  const tierRank: Record<string, number> = { "1-3d": 0, "3-5d": 1, "7-14d": 2, "?": 3 };
  rows.sort((a, b) => {
    if (a.spread !== b.spread) return a.spread ? -1 : 1;
    return tierRank[a.worstTier] - tierRank[b.worstTier];
  });

  console.log("");
  console.log("PROCESSING-TIME GRID — smallest / mid / largest scale per listing");
  console.log("Tier: 1-3d ≤150g | 3-5d 150-500g | 7-14d >500g");
  console.log("⚡ = spread (small and large fall in different tiers → per-variation could help)");
  console.log("");
  console.log("    Cur     | Smallest          | Middle            | Largest           | Title");
  console.log("    --------+-------------------+-------------------+-------------------+----------------------------------------");

  for (const r of rows) {
    const flag = r.spread ? "⚡" : "  ";
    const fmt = (s: { cm: number; g: number; tier: string } | null) =>
      s ? `${(s.cm + "cm").padStart(7)} ${(Math.round(s.g) + "g").padStart(5)} ${s.tier.padEnd(5)}` : "      —            ";
    console.log(
      `${flag}  ${r.currentProcessing.padStart(6)}  | ${fmt(r.small)} | ${fmt(r.mid)} | ${fmt(r.large)} | ${r.title}`
    );
  }

  const spread = rows.filter((r) => r.spread);
  const matched = rows.filter((r) => r.building);
  const unmatched = rows.filter((r) => !r.building);

  console.log("");
  console.log(`Total active: ${rows.length}`);
  console.log(`Matched profile: ${matched.length} | Unmatched (no profile, default 3-5d): ${unmatched.length}`);
  console.log(`Spread listings (per-variation could help): ${spread.length}`);
  console.log("");
  console.log("If we set listing-level by LARGEST scale weight (worst case):");
  console.log(`  1-3d : ${rows.filter((r) => r.worstTier === "1-3d").length}`);
  console.log(`  3-5d : ${rows.filter((r) => r.worstTier === "3-5d").length + unmatched.length} (incl. ${unmatched.length} unmatched)`);
  console.log(`  7-14d: ${rows.filter((r) => r.worstTier === "7-14d").length}`);

  if (unmatched.length > 0) {
    console.log("\nUnmatched (will default to 3-5d):");
    for (const r of unmatched) console.log(`  ${r.id}  ${r.title}`);
  }
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
