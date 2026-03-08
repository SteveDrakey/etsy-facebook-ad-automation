/**
 * Post the best Etsy listing to the Facebook Page.
 * AI picks the listing based on what's already been posted.
 *
 * Usage:
 *   npx tsx src/scripts/post-weekly.ts            # post for real
 *   npx tsx src/scripts/post-weekly.ts --dry-run   # preview only
 */
import { getActiveListings } from "../etsy/client.js";
import {
  shareLink,
  getPagePosts,
} from "../facebook/client.js";
import { pickBestListing, generatePostCaption } from "../ai/copy-generator.js";
import {
  loadState,
  saveState,
  getPostedListingIds,
  markAsPosted,
} from "../state/store.js";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  console.log(dryRun ? "[DRY RUN] Preview mode\n" : "Posting to Facebook...\n");

  // 1. Load state and existing data in parallel
  const [state, etsyResult, recentPosts] = await Promise.all([
    loadState(),
    getActiveListings(),
    getPagePosts(25),
  ]);

  const postedIds = getPostedListingIds(state);
  console.log(`Etsy listings: ${etsyResult.total} (source: ${etsyResult.source})`);
  console.log(`Recent FB posts: ${recentPosts.length}`);
  console.log(`Already posted (from state): ${postedIds.size}\n`);

  // 2. Filter out already-posted listings
  const available = etsyResult.listings.filter(
    (l) => !postedIds.has(l.listing_id)
  );

  if (available.length === 0) {
    console.log("No unposted listings remaining. Nothing to do.");
    return;
  }

  console.log(`Available to post: ${available.length} listings`);

  // 3. AI picks the best listing
  console.log("AI selecting best listing...");
  const pick = await pickBestListing(available, recentPosts);
  const listing = available.find((l) => l.listing_id === pick.listingId);

  if (!listing) {
    console.error(`AI picked listing ${pick.listingId} but it wasn't found. Falling back to first available.`);
    const fallback = available[0];
    console.log(`Using: "${fallback.title}"`);
    Object.assign(pick, { listingId: fallback.listing_id, reasoning: "Fallback" });
  }

  const chosen = listing || available[0];
  console.log(`\nSelected: "${chosen.title}"`);
  console.log(`Reason: ${pick.reasoning}`);
  console.log(`Price: £${(chosen.price.amount / chosen.price.divisor).toFixed(2)}`);
  console.log(`URL: ${chosen.url}`);

  // 4. Generate caption (tone from fixed reference, not live posts)
  console.log("\nGenerating caption...");
  const caption = await generatePostCaption(chosen);
  console.log(`\n--- Caption ---\n${caption}\n---\n`);

  if (dryRun) {
    console.log("[DRY RUN] Would share this link to Facebook. Skipping.");
    return;
  }

  // 5. Share the Etsy link on Facebook (generates preview card like manual sharing)
  console.log(`Sharing link: ${chosen.url}`);
  const result = await shareLink(chosen.url, caption);
  const postId = result.id;
  console.log(`Shared link. Post ID: ${postId}`);

  // 6. Save state
  markAsPosted(state, chosen.listing_id, postId, chosen.url);
  await saveState(state);
  console.log("State saved.");

  console.log(`\nDone! "${chosen.title}" posted to Facebook.`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
