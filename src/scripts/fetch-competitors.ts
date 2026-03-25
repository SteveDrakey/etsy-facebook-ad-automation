/**
 * Fetches competitor pricing for 3D printed building models on Etsy.
 * Saves to data/competitors.json
 *
 * Usage: npx tsx src/scripts/fetch-competitors.ts
 */
import "dotenv/config";
import { writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = join(__dirname, "../../data/competitors.json");

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const MY_SHOP = 56796619;

const searches = [
  "burj khalifa 3d printed model",
  "empire state building 3d model",
  "taipei 101 model",
  "chrysler building model",
  "the shard london model",
  "petronas towers model",
  "3d printed skyscraper model",
  "3d printed tower model",
  "3d printed building replica",
  "miniature skyscraper model",
  "architectural scale model",
  "3d printed landmark",
  "shanghai tower model",
  "one world trade center model",
  "flatiron building model",
  "big ben model 3d printed",
  "famous building model",
  "iconic building replica",
];

interface CompListing {
  title: string;
  price: number;
  currency: string;
  tags: string[];
  shopId: number;
  listingId: number;
  url: string;
}

async function search(query: string): Promise<CompListing[]> {
  const url = `https://api.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(query)}&limit=15&sort_on=score`;
  const res = await fetch(url, { headers: { "x-api-key": API_KEY } });
  if (!res.ok) return [];
  const data = (await res.json()) as any;
  return data.results
    .filter((l: any) => l.shop_id !== MY_SHOP)
    .filter((l: any) => {
      const t = l.title.toLowerCase();
      // Filter to physical 3D printed models only
      return !t.includes("stl") && !t.includes("file") && !t.includes("wall art") &&
        !t.includes("canvas") && !t.includes("poster") && !t.includes("svg") &&
        !t.includes("digital") && !t.includes("printable") && !t.includes("laser");
    })
    .map((l: any) => ({
      title: l.title,
      price: l.price.amount / l.price.divisor,
      currency: l.price.currency_code,
      tags: l.tags,
      shopId: l.shop_id,
      listingId: l.listing_id,
      url: l.url,
    }));
}

async function main() {
  const allResults: CompListing[] = [];
  const seen = new Set<number>();

  for (const q of searches) {
    process.stdout.write(`Searching: ${q}...`);
    const results = await search(q);
    let added = 0;
    for (const r of results) {
      if (seen.has(r.listingId)) continue;
      seen.add(r.listingId);
      allResults.push(r);
      added++;
    }
    console.log(` ${added} new (${results.length} total)`);
    await new Promise((r) => setTimeout(r, 220));
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(allResults, null, 2) + "\n");
  console.log(`\nSaved ${allResults.length} competitor listings to data/competitors.json`);

  // Summary by price range (convert to GBP approx)
  const gbpRates: Record<string, number> = {
    GBP: 1, USD: 0.79, EUR: 0.86, CAD: 0.58, AUD: 0.52,
    CHF: 0.90, TRY: 0.024, INR: 0.0094, IDR: 0.000050,
  };

  const gbpPrices = allResults
    .map((r) => ({ ...r, gbp: r.price * (gbpRates[r.currency] || 0) }))
    .filter((r) => r.gbp > 0)
    .sort((a, b) => a.gbp - b.gbp);

  console.log(`\nCompetitor prices (converted to ~GBP):`);
  console.log(`  Lowest:  £${gbpPrices[0]?.gbp.toFixed(0)} - ${gbpPrices[0]?.title.slice(0, 50)}`);
  console.log(`  Median:  £${gbpPrices[Math.floor(gbpPrices.length / 2)]?.gbp.toFixed(0)}`);
  console.log(`  Highest: £${gbpPrices[gbpPrices.length - 1]?.gbp.toFixed(0)} - ${gbpPrices[gbpPrices.length - 1]?.title.slice(0, 50)}`);

  // Show all with GBP price
  console.log(`\n${"Price".padStart(8)} ${"Currency".padEnd(5)} Title`);
  console.log("-".repeat(80));
  for (const r of gbpPrices) {
    console.log(`~£${r.gbp.toFixed(0).padStart(5)} ${r.currency.padEnd(5)} ${r.title.slice(0, 65)}`);
  }
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
