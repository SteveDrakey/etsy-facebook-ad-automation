/**
 * Post specific Etsy listings to Facebook by listing ID.
 * Usage: npx tsx src/scripts/post-specific.ts 1888876448 4296407975
 *        npx tsx src/scripts/post-specific.ts --dry-run 1888876448 4296407975
 */
import { getActiveListings } from "../etsy/client.js";
import { shareLink } from "../facebook/client.js";
import { generatePostCaption } from "../ai/copy-generator.js";
import { loadState, saveState, markAsPosted } from "../state/store.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const listingIds = args.filter((a) => a !== "--dry-run").map(Number);

if (listingIds.length === 0) {
  console.error("Usage: npx tsx src/scripts/post-specific.ts [--dry-run] <listingId1> <listingId2> ...");
  process.exit(1);
}

async function main() {
  console.log(dryRun ? "[DRY RUN] Preview mode\n" : "Posting to Facebook...\n");

  const [state, etsyResult] = await Promise.all([
    loadState(),
    getActiveListings(),
  ]);

  console.log(`Etsy listings loaded: ${etsyResult.total} (source: ${etsyResult.source})\n`);

  for (const id of listingIds) {
    const listing = etsyResult.listings.find((l) => l.listing_id === id);
    if (!listing) {
      console.error(`Listing ${id} not found — skipping.`);
      continue;
    }

    console.log(`--- Posting: "${listing.title}" ---`);
    console.log(`Price: £${(listing.price.amount / listing.price.divisor).toFixed(2)}`);
    console.log(`URL: ${listing.url}`);

    console.log("\nGenerating caption...");
    const caption = await generatePostCaption(listing);
    console.log(`\n${caption}\n`);

    if (dryRun) {
      console.log("[DRY RUN] Would share this link to Facebook. Skipping.\n");
      continue;
    }

    console.log(`Sharing link: ${listing.url}`);
    const result = await shareLink(listing.url, caption);
    const postId = result.id;
    console.log(`Shared! Post ID: ${postId}`);

    markAsPosted(state, listing.listing_id, postId, listing.url);
    await saveState(state);
    console.log("State saved.\n");
  }

  console.log("Done!");
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
