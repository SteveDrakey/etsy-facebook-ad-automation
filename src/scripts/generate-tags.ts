/**
 * Generates optimal Etsy tags for each listing.
 *
 * Strategy (based on how Etsy search actually works in 2026):
 *
 * - Tag 1: PRIMARY KEYWORD — matches title for reinforcement (strongest signal)
 * - Tags 2-5: BUILDING-SPECIFIC — alt names, nicknames NOT in the title
 * - Tags 6-9: LOCATION / SOUVENIR — city, country, "X souvenir" (proven search terms)
 * - Tags 10-11: BUYER INTENT — "gift for architect", "travel souvenir" (real Etsy market pages)
 * - Tags 12-13: PRODUCT SYNONYMS — words NOT in title (replica, miniature, figurine, statue)
 *
 * Rules:
 * - 13 tags max, 20 chars each
 * - Multi-word phrases > single words (get both exact + broad matching)
 * - Don't repeat words already in the title (except the primary keyword in 1 tag)
 * - Don't repeat the same root word across multiple tags
 * - Etsy cross-matches words between tags, so one "dubai souvenir" tag covers "dubai" searches too
 *
 * Usage: npx tsx src/scripts/generate-tags.ts
 *        npx tsx src/scripts/generate-tags.ts --diff
 */
import { readFile, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INVENTORY_PATH = join(__dirname, "../../data/inventory.json");
const OUTPUT_PATH = join(__dirname, "../../data/tags-recommended.json");
const showDiff = process.argv.includes("--diff");

// ─── Per-building tag data ──────────────────────────────────
// Each field contains tags that ADD value beyond the title.
// "primary" = the one tag that reinforces the title (appears in both).
// Everything else should be words/phrases NOT in the title.

interface TagSet {
  /** One tag that matches the title's primary phrase */
  primary: string;
  /** Alt names, nicknames, related buildings NOT in title */
  buildingTags: string[];
  /** City, country, souvenir terms — proven Etsy searches */
  locationTags: string[];
  /** Buyer intent — real Etsy market pages */
  intentTags: string[];
  /** Product synonyms NOT in title */
  synonymTags: string[];
}

const TAGS: Record<string, TagSet> = {
  "Burj Khalifa": {
    primary: "burj khalifa model",
    buildingTags: ["tallest building", "dubai landmark", "dubai tower"],
    locationTags: ["dubai souvenir", "uae gift", "dubai skyline"],
    intentTags: ["gift for architect", "travel souvenir", "bookshelf decor"],
    synonymTags: ["building replica", "miniature tower", "iconic building", "tower figurine"],
  },
  "Merdeka 118": {
    primary: "merdeka 118 model",
    buildingTags: ["tallest in asean", "malaysia tower", "kl landmark"],
    locationTags: ["kuala lumpur gift", "malaysia souvenir", "kl skyline"],
    intentTags: ["gift for architect", "travel souvenir", "bookshelf decor"],
    synonymTags: ["building replica", "miniature tower", "supertall model", "tower figurine"],
  },
  "Shanghai Tower": {
    primary: "shanghai tower model",
    buildingTags: ["twisted tower", "tallest in china", "spiralling tower"],
    locationTags: ["shanghai gift", "china souvenir", "shanghai skyline"],
    intentTags: ["architecture gift", "travel souvenir", "bookshelf decor"],
    synonymTags: ["building replica", "tower figurine", "landmark miniature", "famous building"],
  },
  "Jeddah Tower": {
    primary: "jeddah tower model",
    buildingTags: ["kingdom tower", "tallest planned", "saudi tower"],
    locationTags: ["saudi arabia gift", "jeddah souvenir", "saudi landmark"],
    intentTags: ["architecture gift", "travel souvenir", "gift for architect"],
    synonymTags: ["tower replica", "supertall model", "famous building", "iconic building"],
  },
  "Lotte World Tower": {
    primary: "lotte tower model",
    buildingTags: ["lotte world tower", "seoul landmark", "tallest in korea"],
    locationTags: ["south korea gift", "seoul souvenir", "korea skyline"],
    intentTags: ["architecture gift", "travel souvenir", "bookshelf decor"],
    synonymTags: ["tower replica", "miniature tower", "famous building", "iconic building"],
  },
  "One World Trade Center": {
    primary: "one world trade",
    buildingTags: ["freedom tower", "wtc model", "1 wtc replica"],
    locationTags: ["nyc souvenir", "new york gift", "manhattan model"],
    intentTags: ["travel souvenir", "memorial model", "gift for architect"],
    synonymTags: ["tower replica", "landmark miniature", "famous building", "iconic building"],
  },
  "Taipei 101": {
    primary: "taipei 101 model",
    buildingTags: ["bamboo tower", "taiwan landmark", "taipei tower"],
    locationTags: ["taiwan souvenir", "taipei gift", "taiwan skyline"],
    intentTags: ["gift for architect", "travel souvenir", "bookshelf decor"],
    synonymTags: ["tower replica", "iconic building", "famous building", "pagoda tower"],
  },
  "China Zun": {
    primary: "china zun model",
    buildingTags: ["citic tower", "zun vessel shape", "beijing tower"],
    locationTags: ["beijing gift", "china souvenir", "beijing landmark"],
    intentTags: ["architecture gift", "travel souvenir", "gift for architect"],
    synonymTags: ["tower replica", "famous building", "building figurine", "landmark model"],
  },
  "Goldin Finance 117": {
    primary: "goldin finance 117",
    buildingTags: ["tianjin tower", "supertall tower", "china skyscraper"],
    locationTags: ["tianjin gift", "china souvenir", "tianjin landmark"],
    intentTags: ["architecture gift", "architect desk decor", "gift for architect"],
    synonymTags: ["tower replica", "building figurine", "landmark model", "famous building"],
  },
  "Princess Tower": {
    primary: "princess tower model",
    buildingTags: ["dubai marina tower", "tallest residential", "marina skyline"],
    locationTags: ["dubai souvenir", "uae gift", "dubai marina"],
    intentTags: ["travel souvenir", "architecture gift", "bookshelf decor"],
    synonymTags: ["tower replica", "miniature tower", "building figurine", "iconic building"],
  },
  "Gevora Hotel": {
    primary: "gevora hotel model",
    buildingTags: ["tallest hotel", "dubai hotel tower", "gevora dubai"],
    locationTags: ["dubai souvenir", "uae gift", "dubai skyline"],
    intentTags: ["travel souvenir", "architecture gift", "bookshelf decor"],
    synonymTags: ["tower replica", "building figurine", "hotel miniature", "famous building"],
  },
  "Q1 Tower": {
    primary: "q1 tower model",
    buildingTags: ["gold coast tower", "tallest in aussie", "surfers paradise"],
    locationTags: ["australia souvenir", "gold coast gift", "aussie landmark"],
    intentTags: ["travel souvenir", "architecture gift", "bookshelf decor"],
    synonymTags: ["tower replica", "miniature tower", "famous building", "iconic building"],
  },
  "Jin Mao Tower": {
    primary: "jin mao tower model",
    buildingTags: ["art deco tower", "pagoda tower", "shanghai landmark"],
    locationTags: ["shanghai gift", "china souvenir", "shanghai skyline"],
    intentTags: ["architecture gift", "gift for architect", "bookshelf decor"],
    synonymTags: ["tower replica", "landmark miniature", "famous building", "building figurine"],
  },
  "The Shard": {
    primary: "shard london model",
    buildingTags: ["the shard", "london shard", "glass pyramid"],
    locationTags: ["london souvenir", "uk gift", "london skyline"],
    intentTags: ["travel souvenir", "architect desk decor", "bookshelf decor"],
    synonymTags: ["tower replica", "iconic building", "famous building", "landmark miniature"],
  },
  "Empire State Building": {
    primary: "empire state model",
    buildingTags: ["art deco tower", "nyc icon", "king kong building"],
    locationTags: ["new york souvenir", "nyc gift", "manhattan model"],
    intentTags: ["travel souvenir", "gift for architect", "bookshelf decor"],
    synonymTags: ["building replica", "landmark miniature", "famous building", "iconic building"],
  },
  "Chrysler Building": {
    primary: "chrysler building",
    buildingTags: ["art deco spire", "nyc icon", "manhattan landmark"],
    locationTags: ["new york souvenir", "nyc gift", "manhattan model"],
    intentTags: ["gift for architect", "architect desk decor", "bookshelf decor"],
    synonymTags: ["tower replica", "landmark miniature", "famous building", "iconic building"],
  },
  "Shanghai World Financial Center": {
    primary: "bottle opener tower",
    buildingTags: ["swfc model", "shanghai swfc", "aperture tower"],
    locationTags: ["shanghai gift", "china souvenir", "shanghai skyline"],
    intentTags: ["architecture gift", "travel souvenir", "bookshelf decor"],
    synonymTags: ["tower replica", "building figurine", "famous building", "landmark miniature"],
  },
  "Hancock Tower": {
    primary: "hancock tower model",
    buildingTags: ["john hancock ctr", "x braced tower", "chicago landmark"],
    locationTags: ["chicago gift", "chicago skyline", "chicago souvenir"],
    intentTags: ["architecture gift", "gift for architect", "bookshelf decor"],
    synonymTags: ["tower replica", "famous building", "landmark miniature", "iconic building"],
  },
  "432 Park Avenue": {
    primary: "432 park avenue",
    buildingTags: ["billionaires row", "supertall nyc", "slimmest tower"],
    locationTags: ["new york souvenir", "nyc gift", "manhattan model"],
    intentTags: ["architecture gift", "architect desk decor", "bookshelf decor"],
    synonymTags: ["tower replica", "miniature tower", "famous building", "iconic building"],
  },
  "Oriental Pearl Tower": {
    primary: "oriental pearl tower",
    buildingTags: ["tv tower model", "space age tower", "pearl tower"],
    locationTags: ["shanghai gift", "china souvenir", "shanghai icon"],
    intentTags: ["travel souvenir", "architecture gift", "bookshelf decor"],
    synonymTags: ["tower replica", "landmark miniature", "famous building", "iconic building"],
  },
  "Petronas Twin Towers": {
    primary: "petronas towers",
    buildingTags: ["twin towers kl", "islamic design", "kl landmark"],
    locationTags: ["malaysia souvenir", "kuala lumpur gift", "kl skyline"],
    intentTags: ["travel souvenir", "gift for architect", "bookshelf decor"],
    synonymTags: ["tower pair replica", "landmark miniature", "famous building", "iconic building"],
  },
  "Willis Tower": {
    primary: "willis tower model",
    buildingTags: ["sears tower", "chicago icon", "bundled tube"],
    locationTags: ["chicago gift", "chicago skyline", "chicago souvenir"],
    intentTags: ["architecture gift", "travel souvenir", "bookshelf decor"],
    synonymTags: ["tower replica", "famous building", "landmark miniature", "iconic building"],
  },
  "Ryugyong Hotel": {
    primary: "ryugyong hotel",
    buildingTags: ["pyongyang pyramid", "brutalist tower", "north korea tower"],
    locationTags: ["north korea model", "pyongyang landmark", "dprk souvenir"],
    intentTags: ["architecture gift", "unusual building", "curiosity model"],
    synonymTags: ["tower replica", "pyramid building", "famous building", "iconic building"],
  },
  "The Gherkin": {
    primary: "gherkin london",
    buildingTags: ["30 st mary axe", "bullet building", "london gherkin"],
    locationTags: ["london souvenir", "uk gift", "london skyline"],
    intentTags: ["travel souvenir", "architect desk decor", "bookshelf decor"],
    synonymTags: ["tower replica", "iconic building", "famous building", "landmark miniature"],
  },
  "Walkie Talkie": {
    primary: "walkie talkie model",
    buildingTags: ["20 fenchurch st", "concave tower", "london walkie"],
    locationTags: ["london souvenir", "uk gift", "city of london"],
    intentTags: ["travel souvenir", "architecture gift", "bookshelf decor"],
    synonymTags: ["tower replica", "iconic building", "famous building", "landmark miniature"],
  },
  "Flatiron Building": {
    primary: "flatiron building",
    buildingTags: ["wedge building", "historic nyc", "triangular tower"],
    locationTags: ["new york souvenir", "nyc gift", "manhattan model"],
    intentTags: ["travel souvenir", "gift for architect", "bookshelf decor"],
    synonymTags: ["building replica", "landmark miniature", "famous building", "iconic building"],
  },
  "Leadenhall Building": {
    primary: "cheesegrater model",
    buildingTags: ["leadenhall tower", "city of london", "london cheesegrater"],
    locationTags: ["london souvenir", "uk gift", "london skyline"],
    intentTags: ["architecture gift", "architect desk decor", "bookshelf decor"],
    synonymTags: ["tower replica", "iconic building", "famous building", "landmark miniature"],
  },
  "World Trade Center Twins": {
    primary: "twin towers model",
    buildingTags: ["world trade ctr", "wtc replica", "twin towers nyc"],
    locationTags: ["new york souvenir", "nyc gift", "nyc memorial"],
    intentTags: ["memorial model", "travel souvenir", "gift for architect"],
    synonymTags: ["tower pair replica", "landmark miniature", "iconic building", "famous building"],
  },
  "St Peters Basilica": {
    primary: "st peters basilica",
    buildingTags: ["vatican model", "basilica replica", "papal basilica"],
    locationTags: ["rome souvenir", "italy gift", "vatican gift"],
    intentTags: ["travel souvenir", "catholic gift", "bookshelf decor"],
    synonymTags: ["church miniature", "landmark model", "sacred building", "famous building"],
  },
  "Lotus Temple": {
    primary: "lotus temple model",
    buildingTags: ["bahai temple", "petal building", "delhi landmark"],
    locationTags: ["india souvenir", "delhi gift", "india landmark"],
    intentTags: ["travel souvenir", "cultural gift", "bookshelf decor"],
    synonymTags: ["temple miniature", "landmark model", "sacred building", "famous building"],
  },
  "Wrigley Field": {
    primary: "wrigley field model",
    buildingTags: ["cubs stadium", "baseball stadium", "cubs ballpark"],
    locationTags: ["chicago gift", "chicago souvenir", "cubs fan gift"],
    intentTags: ["baseball fan gift", "sports memorabilia", "bookshelf decor"],
    synonymTags: ["stadium replica", "ballpark model", "sports model", "famous building"],
  },
  "San Francisco": {
    primary: "san francisco model",
    buildingTags: ["sf skyline", "sf city block", "bay area model"],
    locationTags: ["california gift", "sf souvenir", "san fran gift"],
    intentTags: ["travel souvenir", "architecture gift", "bookshelf decor"],
    synonymTags: ["city model", "cityscape replica", "urban miniature", "famous building"],
  },
  "Canary Wharf": {
    primary: "canary wharf model",
    buildingTags: ["docklands model", "financial district", "wharf skyline"],
    locationTags: ["london souvenir", "london gift", "uk gift"],
    intentTags: ["architecture gift", "travel souvenir", "bookshelf decor"],
    synonymTags: ["city map model", "cityscape replica", "famous building", "landmark miniature"],
  },
  "Shanghai Skyline Bundle": {
    primary: "shanghai skyline",
    buildingTags: ["shanghai set", "city landmark set", "pudong skyline"],
    locationTags: ["shanghai gift", "china souvenir", "shanghai model"],
    intentTags: ["architecture gift", "travel souvenir", "bookshelf decor"],
    synonymTags: ["skyline collection", "building set", "city model set", "famous building"],
  },
  "London Skyline Bundle": {
    primary: "london skyline set",
    buildingTags: ["london landmarks", "uk skyline", "london icons"],
    locationTags: ["london souvenir", "london gift", "uk gift"],
    intentTags: ["architecture gift", "travel souvenir", "bookshelf decor"],
    synonymTags: ["skyline collection", "building set", "city model set", "famous building"],
  },
  "Festive Collection": {
    primary: "christmas skyscraper",
    buildingTags: ["xmas building", "festive tower", "santa hat tower"],
    locationTags: ["christmas decor", "xmas desk decor", "holiday desk decor"],
    intentTags: ["unique xmas gift", "stocking filler", "christmas display"],
    synonymTags: ["holiday model", "festive display", "xmas ornament", "christmas ornament"],
  },
  "NYC Times Square": {
    primary: "times square model",
    buildingTags: ["nyc skyline", "manhattan skyline", "broadway model"],
    locationTags: ["new york souvenir", "nyc gift", "manhattan gift"],
    intentTags: ["travel souvenir", "architecture gift", "bookshelf decor"],
    synonymTags: ["cityscape replica", "city model", "urban miniature", "famous building"],
  },
  "Miniature Shanghai": {
    primary: "miniature shanghai",
    buildingTags: ["shanghai cityscape", "pudong skyline", "lujiazui model"],
    locationTags: ["shanghai gift", "china souvenir", "shanghai model"],
    intentTags: ["travel souvenir", "architecture gift", "bookshelf decor"],
    synonymTags: ["city model", "cityscape replica", "urban miniature", "famous building"],
  },
};

// ─── Listing parsing & matching ─────────────────────────────

interface Listing {
  listing_id: number;
  title: string;
  tags: string[];
}

function matchTagSet(title: string): TagSet | null {
  const t = title.toLowerCase();

  // Colour/shiny variants use the same base building tags
  // but we strip "colour"/"shiny" references since those aren't useful as search terms
  if (t.includes("festive") || t.includes("christmas")) return TAGS["Festive Collection"];
  if (t.includes("times square")) return TAGS["NYC Times Square"];
  if (t.includes("miniature shanghai")) return TAGS["Miniature Shanghai"];
  if (t.includes("shanghai skyline")) return TAGS["Shanghai Skyline Bundle"];
  if (t.includes("london skyline")) return TAGS["London Skyline Bundle"];
  if (t.includes("san francisco")) return TAGS["San Francisco"];
  if (t.includes("canary wharf")) return TAGS["Canary Wharf"];

  // Match by building name (longest match first to avoid partial hits)
  const keys = Object.keys(TAGS).sort((a, b) => b.length - a.length);
  for (const key of keys) {
    if (t.includes(key.toLowerCase())) return TAGS[key];
  }

  // Fuzzy
  if (t.includes("twin tower") || (t.includes("world trade") && t.includes("pair"))) return TAGS["World Trade Center Twins"];
  if (t.includes("st. peter") || t.includes("st peter")) return TAGS["St Peters Basilica"];
  if (t.includes("gherkin")) return TAGS["The Gherkin"];
  if (t.includes("walkie talkie")) return TAGS["Walkie Talkie"];
  if (t.includes("leadenhall") || t.includes("cheesegrater")) return TAGS["Leadenhall Building"];
  if (t.includes("china zun") || t.includes("citic")) return TAGS["China Zun"];
  if (t.includes("oriental pearl")) return TAGS["Oriental Pearl Tower"];
  if (t.includes("petronas")) return TAGS["Petronas Twin Towers"];
  if (t.includes("ryugyong")) return TAGS["Ryugyong Hotel"];

  return null;
}

function extractTitleWords(title: string): Set<string> {
  return new Set(
    title.toLowerCase()
      .replace(/[–—\-|:]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

function generateTags(listing: Listing): string[] {
  const tagSet = matchTagSet(listing.title);
  if (!tagSet) return listing.tags; // Can't match — keep current

  const titleWords = extractTitleWords(listing.title);
  const tags: string[] = [];
  const usedWords = new Set<string>(); // track root words to avoid repetition across tags

  function addTag(tag: string): boolean {
    const t = tag.toLowerCase().trim();
    if (t.length === 0 || t.length > 20) return false;
    if (tags.includes(t)) return false;

    // Only block exact duplicate tags, not shared words
    // Etsy cross-matches words between tags, so "dubai souvenir" + "dubai skyline" is fine
    tags.push(t);
    return true;
  }

  // 1. Primary keyword (reinforces title)
  addTag(tagSet.primary);

  // 2. Building-specific (alt names, nicknames NOT in title)
  for (const t of tagSet.buildingTags) {
    if (tags.length >= 13) break;
    addTag(t);
  }

  // 3. Location / souvenir
  for (const t of tagSet.locationTags) {
    if (tags.length >= 13) break;
    addTag(t);
  }

  // 4. Buyer intent
  for (const t of tagSet.intentTags) {
    if (tags.length >= 13) break;
    addTag(t);
  }

  // 5. Product synonyms
  for (const t of tagSet.synonymTags) {
    if (tags.length >= 13) break;
    addTag(t);
  }

  // Add colour-specific tag if it's a colour variant
  const titleLower = listing.title.toLowerCase();
  if (titleLower.includes("colour") || titleLower.includes("color") || titleLower.includes("shiny")) {
    if (tags.length < 13) addTag("full colour print");
  }

  return tags.slice(0, 13);
}

// ─── Main ───────────────────────────────────────────────────

async function main() {
  const listings: Listing[] = JSON.parse(await readFile(INVENTORY_PATH, "utf-8"));
  const results: Array<{
    listing_id: number;
    title: string;
    currentTags: string[];
    recommendedTags: string[];
  }> = [];

  let unmatchedCount = 0;

  for (const l of listings) {
    const recommended = generateTags(l);
    const isUnmatched = recommended === l.tags;
    if (isUnmatched) unmatchedCount++;

    results.push({
      listing_id: l.listing_id,
      title: l.title,
      currentTags: l.tags || [],
      recommendedTags: recommended,
    });
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(results, null, 2) + "\n");

  for (const r of results) {
    const currentSet = new Set(r.currentTags.map((t) => t.toLowerCase()));
    const recSet = new Set(r.recommendedTags);

    const newTags = r.recommendedTags.filter((t) => !currentSet.has(t));
    const droppedTags = r.currentTags.filter((t) => !recSet.has(t.toLowerCase()));
    const keptTags = r.recommendedTags.filter((t) => currentSet.has(t));
    const unchanged = r.recommendedTags === r.currentTags;

    console.log(r.title.slice(0, 70));

    if (unchanged) {
      console.log("  (no tag data — unmatched listing)");
    } else if (showDiff) {
      console.log(`  Current: ${r.currentTags.length}/13 | Recommended: ${r.recommendedTags.length}/13`);
      if (keptTags.length > 0) console.log(`  KEEP:  ${keptTags.join(", ")}`);
      if (newTags.length > 0) console.log(`  + ADD: ${newTags.join(", ")}`);
      if (droppedTags.length > 0) console.log(`  - DROP: ${droppedTags.join(", ")}`);
    } else {
      console.log(`  ${r.recommendedTags.join(", ")}`);
    }

    // Flag current issues
    if (r.currentTags.length < 13 && r.currentTags.length > 0) {
      console.log(`  ⚠ Only ${r.currentTags.length}/13 tags used`);
    }
    const singleWords = r.currentTags.filter((t) => !t.includes(" ") && t.length > 0);
    if (singleWords.length > 3) {
      console.log(`  ⚠ ${singleWords.length} single-word tags: ${singleWords.slice(0, 5).join(", ")}...`);
    }
    console.log();
  }

  console.log(`Saved to ${OUTPUT_PATH}`);
  console.log(`\nMatched: ${results.length - unmatchedCount} of ${results.length} listings`);
  if (unmatchedCount > 0) console.log(`Unmatched: ${unmatchedCount} (kept current tags)`);

  const underTagged = results.filter((r) => r.currentTags.length < 13 && r.currentTags.length > 0);
  console.log(`Currently under-tagged: ${underTagged.length} listings`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
