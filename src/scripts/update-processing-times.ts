/**
 * ⚠️  KNOWN ISSUE (2026-06-06): Etsy silently ignores listing-level
 * processing_min/processing_max PATCH requests on listings managed by the
 * new per-variation readiness_state_id system (most of the shop). PATCH
 * returns 200 OK with the unchanged values in the response body, so the
 * script reports "✅ updated" but nothing actually changes. The tiering
 * logic and building profiles below are still correct — to actually push
 * changes we need to wire up the readiness_state per-offering endpoint
 * (Etsy v3 hasn't published it yet) or do it in Shop Manager by hand.
 *
 * Tier processing_min/processing_max on all active building listings by
 * computed print weight at the LARGEST scale variation in each listing.
 *
 * Tiers (g = computed grams):
 *   weight <= 150g  -> 1-5 business days
 *   weight <= 500g  -> 5-10 business days
 *   weight >  500g  -> 10-15 business days
 *
 * Weight formula (mirrors price-calc.ts / recommend-processing-times.ts):
 *   weight = 39g * (heightCm/30)^2.5 * widthFactor^2 * (multiColour ? 1.5 : 1)
 *
 * Largest scale is read from the listing's inventory variation labels
 * (Etsy v3 includes=Inventory). Listings with no matched building profile
 * default to 3-5 days. Per-listing weight overrides bump the figure (e.g.
 * WTC Twin Towers is finer detail → x1.2).
 *
 * Safety:
 *   - PATCH /shops/{id}/listings/{id} only — never touches inventory
 *   - Dry-run by default; --apply to push
 *   - Excludes Spare Parts + Retro Radio
 *   - Active listings only
 *
 * Usage:
 *   npx tsx src/scripts/update-processing-times.ts                          # dry run all
 *   npx tsx src/scripts/update-processing-times.ts --apply                  # push all
 *   npx tsx src/scripts/update-processing-times.ts --id 4426197221          # dry run one
 *   npx tsx src/scripts/update-processing-times.ts --id 4426197221 --apply  # push one
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;

const apply = process.argv.includes("--apply");
const idFlag = process.argv.indexOf("--id");
const targetId = idFlag >= 0 ? parseInt(process.argv[idFlag + 1]) : null;

const EXCLUDE_IDS = new Set<number>([
  4438786249, // Spare Parts
  4503821733, // 1959 Retro Radio
]);

// ─── Building profiles (mirror of price-calc.ts / recommend-processing-times.ts) ──
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
  "Ping An Finance Center": { realHeightM: 599, widthFactor: 1.1, multiColour: false },
  "International Commerce Centre": { realHeightM: 484, widthFactor: 1.2, multiColour: false },
  "Two International Finance Centre": { realHeightM: 415, widthFactor: 1.2, multiColour: false },
  "HSBC Main Building": { realHeightM: 178.8, widthFactor: 1.6, multiColour: false },
  "Château de Chambord": { realHeightM: 56, widthFactor: 6.85, multiColour: false },
};

// Per-listing weight overrides — multiplier on computed weight
// (use for designs with extra detail / supports / fragile features that
// genuinely take longer per gram than the formula assumes)
const WEIGHT_OVERRIDES: Record<number, { mult: number; reason: string }> = {
  4426197221: { mult: 1.2, reason: "WTC Twin Towers — very detailed, slow print" },
};

function computeWeight(heightCm: number, p: Profile): number {
  const colour = p.multiColour ? MULTICOLOUR_MULT : 1.0;
  return REF_WEIGHT_G * Math.pow(heightCm / REF_HEIGHT_CM, SCALING_EXPONENT) * Math.pow(p.widthFactor, 2) * colour;
}

function matchBuilding(title: string): string | null {
  // Smart quotes (’) → straight (') so substring matches work both ways
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

function largestScaleHeightCm(inventory: any): number | null {
  let largest: number | null = null;
  const products = (inventory?.products || []).filter((p: any) => !p.is_deleted);
  for (const p of products) {
    const sv = (p.property_values || []).find(
      (pv: any) => pv.property_name === "Scale" || pv.property_name === "Size"
    );
    if (!sv) continue;
    for (const v of sv.values) {
      const h = parseScaleHeight(v);
      if (h !== null && (largest === null || h > largest)) largest = h;
    }
  }
  return largest;
}

// ─── Tiering ────────────────────────────────────────────────

interface Tier { min: number; max: number; label: string }
const TIER_SMALL: Tier = { min: 1, max: 5, label: "1-5 days" };
const TIER_MEDIUM: Tier = { min: 5, max: 10, label: "5-10 days" };
const TIER_LARGE: Tier = { min: 10, max: 15, label: "10-15 days" };

function pickTier(weightG: number): Tier {
  if (weightG <= 150) return TIER_SMALL;
  if (weightG <= 500) return TIER_MEDIUM;
  return TIER_LARGE;
}

// ─── Etsy I/O ───────────────────────────────────────────────

interface ActiveListing {
  listing_id: number;
  title: string;
  state: string;
  processing_min: number;
  processing_max: number;
  inventory?: any;
}

async function fetchActiveListings(token: string): Promise<ActiveListing[]> {
  const all: ActiveListing[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const url = `${BASE}/shops/${SHOP_ID}/listings/active?limit=${limit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: { "x-api-key": API_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Fetch active listings failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { results: any[]; count: number };
    for (const l of body.results) {
      all.push({
        listing_id: l.listing_id,
        title: l.title || "",
        state: l.state,
        processing_min: l.processing_min,
        processing_max: l.processing_max,
      });
    }
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

async function patchProcessing(listingId: number, tier: Tier, token: string): Promise<boolean> {
  const res = await fetch(`${BASE}/shops/${SHOP_ID}/listings/${listingId}`, {
    method: "PATCH",
    headers: {
      "x-api-key": API_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ processing_min: tier.min, processing_max: tier.max }),
  });
  if (!res.ok) {
    console.log(`    ERROR ${res.status}: ${await res.text()}`);
    return false;
  }
  return true;
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  console.log(`${apply ? "APPLYING" : "DRY RUN"} weight-based processing-time tiering\n`);
  console.log(`Tiers: <=150g → ${TIER_SMALL.label} | 150-500g → ${TIER_MEDIUM.label} | >500g → ${TIER_LARGE.label}`);
  console.log("Weight = 39g × (largestHeightCm/30)^2.5 × widthFactor² × (1.5 if multicolour)");
  console.log("Listings with no profile or no scale variations are SKIPPED (keep existing value)\n");

  const token = await getAccessToken();
  const all = await fetchActiveListings(token);
  console.log(`Fetched ${all.length} active listings\n`);

  const targets = targetId
    ? all.filter((l) => l.listing_id === targetId)
    : all.filter((l) => !EXCLUDE_IDS.has(l.listing_id));

  if (targets.length === 0) {
    console.log(targetId ? `Listing ${targetId} not in active set` : "No targets");
    process.exit(1);
  }

  let changed = 0;
  let noop = 0;
  let skipped = 0;
  let failed = 0;
  const byTier: Record<string, number> = { [TIER_SMALL.label]: 0, [TIER_MEDIUM.label]: 0, [TIER_LARGE.label]: 0 };

  for (const l of targets) {
    const bn = matchBuilding(l.title);
    const profile = bn ? BUILDINGS[bn] : null;
    const inv = await fetchInventory(l.listing_id, token);
    const largestCm = largestScaleHeightCm(inv);
    const titleShort = l.title.slice(0, 55);
    await new Promise((r) => setTimeout(r, 220)); // ~5 QPS for inventory fetch

    if (!profile || largestCm === null) {
      const reason = !profile ? "no building profile" : "no scale variations";
      console.log(`⊘ ${titleShort} | ${l.processing_min}-${l.processing_max}d (skipped — ${reason}, manage manually)`);
      skipped++;
      continue;
    }

    let weightG = computeWeight(largestCm, profile);
    const ov = WEIGHT_OVERRIDES[l.listing_id];
    if (ov) weightG *= ov.mult;
    const tier = pickTier(weightG);
    byTier[tier.label]++;
    const detail = `${Math.round(weightG)}g @ ${largestCm}cm${ov ? ` [×${ov.mult} ${ov.reason}]` : ""}`;

    const sameTier = l.processing_min === tier.min && l.processing_max === tier.max;
    if (sameTier) {
      console.log(`· ${titleShort} | ${l.processing_min}-${l.processing_max}d (no change) | ${detail}`);
      noop++;
      continue;
    }

    console.log(`→ ${titleShort} | ${l.processing_min}-${l.processing_max}d → ${tier.min}-${tier.max}d (${tier.label}) | ${detail}`);

    if (apply) {
      const ok = await patchProcessing(l.listing_id, tier, token);
      if (ok) { console.log(`    ✅ updated`); changed++; } else { failed++; }
      await new Promise((r) => setTimeout(r, 220)); // ~5 QPS for patch
    }
  }

  console.log(`\n— Summary —`);
  console.log(`Targets:       ${targets.length}`);
  console.log(`Tier counts:   ${TIER_SMALL.label}: ${byTier[TIER_SMALL.label]}  |  ${TIER_MEDIUM.label}: ${byTier[TIER_MEDIUM.label]}  |  ${TIER_LARGE.label}: ${byTier[TIER_LARGE.label]}`);
  console.log(`Skipped:       ${skipped} (no profile or no scale variations — keep existing value)`);
  if (apply) {
    console.log(`Changed: ${changed}, no-op: ${noop}, failed: ${failed}`);
  } else {
    console.log(`No-op (already correct): ${noop}`);
    console.log(`\nRun with --apply to push changes.`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
