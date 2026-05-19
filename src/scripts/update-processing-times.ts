/**
 * Tier processing_min/processing_max on all active building listings by print height.
 *
 * Tiers:
 *   <= 60 cm        -> 1-3 business days
 *   60 < h <= 100   -> 3-5 business days
 *   > 100 cm        -> 1-2 weeks (7-14d)
 *
 * Safety:
 *   - PATCH /shops/{id}/listings/{id} only — never touches inventory (variations/prices)
 *   - Dry-run by default; --apply to push
 *   - Excludes Spare Parts + Retro Radio
 *   - Operates only on ACTIVE listings (drafts excluded by endpoint)
 *
 * Usage:
 *   npx tsx src/scripts/update-processing-times.ts                # dry run all
 *   npx tsx src/scripts/update-processing-times.ts --apply        # push all
 *   npx tsx src/scripts/update-processing-times.ts --id 4368848995          # dry run one
 *   npx tsx src/scripts/update-processing-times.ts --id 4368848995 --apply  # push one
 */
import "dotenv/config";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;

const apply = process.argv.includes("--apply");
const idFlag = process.argv.indexOf("--id");
const targetId = idFlag >= 0 ? parseInt(process.argv[idFlag + 1]) : null;

// Non-architectural listings — never touch
const EXCLUDE_IDS = new Set<number>([
  4438786249, // Spare Parts – Custom Replacement Pieces
  4503821733, // 1959 Retro Radio
]);

interface Tier {
  min: number;
  max: number;
  label: string;
}

const TIER_SMALL: Tier = { min: 1, max: 3, label: "1-3 days" };
const TIER_MEDIUM: Tier = { min: 3, max: 5, label: "3-5 days" };
const TIER_LARGE: Tier = { min: 7, max: 14, label: "1-2 weeks" };

function pickTier(heightCm: number): Tier {
  if (heightCm <= 60) return TIER_SMALL;
  if (heightCm <= 100) return TIER_MEDIUM;
  return TIER_LARGE;
}

interface DerivedHeight {
  cm: number | null;
  source: "explicit" | "derived" | "default";
}

function deriveHeight(title: string, description: string): DerivedHeight {
  const text = `${title}\n${description}`;

  // Pass 1: explicit cm — prefer phrases that signal "tall" / "stands" / "approx" / "height"
  const phrases = [
    /(\d{1,3}(?:\.\d+)?)\s*cm\s*tall/i,
    /stands?\s*(?:at\s*)?(?:approximately\s*|approx\.?\s*|about\s*)?(\d{1,3}(?:\.\d+)?)\s*cm/i,
    /height[^.\n]*?(\d{1,3}(?:\.\d+)?)\s*cm/i,
    /approx(?:imately|\.)?\s*(\d{1,3}(?:\.\d+)?)\s*cm/i,
    /(\d{1,3}(?:\.\d+)?)\s*cm\s*(?:in\s*)?height/i,
  ];
  for (const re of phrases) {
    const m = text.match(re);
    if (m) {
      const v = parseFloat(m[1]);
      if (v > 0 && v < 500) return { cm: v, source: "explicit" };
    }
  }
  // Generic cm fallback — take the FIRST plausible one
  const generic = text.match(/(\d{1,3}(?:\.\d+)?)\s*cm\b/i);
  if (generic) {
    const v = parseFloat(generic[1]);
    if (v > 0 && v < 500) return { cm: v, source: "explicit" };
  }

  // Pass 2: derive from real height (m) / scale (1:N)
  // Look for the largest real-height mention and the smallest scale (= largest print).
  const realMatches = [...text.matchAll(/(\d{2,4})\s*m\b/gi)]
    .map((m) => parseInt(m[1]))
    .filter((v) => v >= 30 && v <= 2000); // sanity: 30m–2km
  const scaleMatches = [...text.matchAll(/1:(\d{3,5})/g)]
    .map((m) => parseInt(m[1]))
    .filter((v) => v >= 100 && v <= 10000);

  if (realMatches.length > 0 && scaleMatches.length > 0) {
    // Use the *largest* real height (the building's true height, not a substructure)
    // and the *smallest* scale value (= biggest print available)
    const realM = Math.max(...realMatches);
    const scale = Math.min(...scaleMatches);
    const cm = (realM / scale) * 100;
    if (cm > 0 && cm < 500) return { cm: Math.round(cm * 10) / 10, source: "derived" };
  }

  return { cm: null, source: "default" };
}

interface ActiveListing {
  listing_id: number;
  title: string;
  description: string;
  state: string;
  processing_min: number;
  processing_max: number;
}

async function fetchActiveListings(token: string): Promise<ActiveListing[]> {
  const all: ActiveListing[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(
      `${BASE}/shops/${SHOP_ID}/listings/active?limit=${limit}&offset=${offset}`,
      { headers: { "x-api-key": API_KEY, Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      throw new Error(`Fetch active listings failed: ${res.status} ${await res.text()}`);
    }
    const body = (await res.json()) as { results: any[]; count: number };
    for (const l of body.results) {
      all.push({
        listing_id: l.listing_id,
        title: l.title || "",
        description: l.description || "",
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

async function patchProcessing(
  listingId: number,
  tier: Tier,
  token: string
): Promise<boolean> {
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

async function main() {
  console.log(`${apply ? "APPLYING" : "DRY RUN"} processing-time tiering\n`);

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
  let failed = 0;
  const byTier: Record<string, number> = { "1-3 days": 0, "3-5 days": 0, "1-2 weeks": 0 };
  const bySource: Record<string, number> = { explicit: 0, derived: 0, default: 0 };

  for (const l of targets) {
    const h = deriveHeight(l.title, l.description);
    const tier = h.cm !== null ? pickTier(h.cm) : TIER_MEDIUM;
    bySource[h.source]++;
    byTier[tier.label]++;

    const sameTier =
      l.processing_min === tier.min && l.processing_max === tier.max;

    const heightStr =
      h.cm !== null ? `${h.cm}cm (${h.source})` : `unknown (default → ${tier.label})`;
    const titleShort = l.title.slice(0, 55);

    if (sameTier) {
      console.log(
        `· ${titleShort} | ${l.processing_min}-${l.processing_max}d (no change) | ${heightStr}`
      );
      noop++;
      continue;
    }

    console.log(
      `→ ${titleShort} | ${l.processing_min}-${l.processing_max}d → ${tier.min}-${tier.max}d (${tier.label}) | ${heightStr}`
    );

    if (!apply) continue;

    const ok = await patchProcessing(l.listing_id, tier, token);
    if (ok) {
      console.log(`    ✅ updated`);
      changed++;
    } else {
      failed++;
    }
    // 5 QPS
    await new Promise((r) => setTimeout(r, 220));
  }

  console.log(`\n— Summary —`);
  console.log(`Targets:    ${targets.length}`);
  console.log(`Tier counts:  ${TIER_SMALL.label}: ${byTier["1-3 days"]}  |  ${TIER_MEDIUM.label}: ${byTier["3-5 days"]}  |  ${TIER_LARGE.label}: ${byTier["1-2 weeks"]}`);
  console.log(`Height source: explicit ${bySource.explicit}  |  derived ${bySource.derived}  |  default ${bySource.default}`);
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
