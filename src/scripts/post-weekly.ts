/**
 * Post the best Etsy listing to the Facebook Page.
 * AI picks the listing based on what's already been posted.
 *
 * Usage:
 *   npx tsx src/scripts/post-weekly.ts            # post for real
 *   npx tsx src/scripts/post-weekly.ts --dry-run   # preview only
 */
import { getActiveListings, getImageUrls } from "../etsy/client.js";
import {
  postPhotoToPage,
  postMultiplePhotos,
  commentOnPost,
  getPagePosts,
} from "../facebook/client.js";
import { pickBestListing, generatePostCaption } from "../ai/copy-generator.js";
import {
  loadState,
  saveState,
  getPostedListingIds,
  markAsPosted,
} from "../state/store.js";
import { MAX_PHOTOS_PER_POST } from "../config.js";

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

  // 4. Get images
  const imageUrls = (await getImageUrls(chosen)).slice(0, MAX_PHOTOS_PER_POST);
  console.log(`Images: ${imageUrls.length}`);

  // 5. Generate caption (tone from fixed reference, not live posts)
  console.log("\nGenerating caption...");
  const caption = await generatePostCaption(chosen);
  console.log(`\n--- Caption ---\n${caption}\n---\n`);

  if (dryRun) {
    console.log("[DRY RUN] Would post this to Facebook. Skipping.");
    return;
  }

  // 6. Post to Facebook
  let postId: string;
  if (imageUrls.length === 1) {
    const result = await postPhotoToPage(imageUrls[0], caption);
    postId = result.post_id || result.id;
    console.log(`Posted single photo. Post ID: ${postId}`);
  } else {
    const result = await postMultiplePhotos(imageUrls, caption);
    postId = result.id;
    console.log(`Posted ${imageUrls.length} photos. Post ID: ${postId}`);
  }

  // 7. Add Etsy link as first comment (keeps it out of the post for better reach)
  const commentId = await commentOnPost(postId, `Grab yours here 👇\n${chosen.url}`);
  console.log(`Added link comment: ${commentId}`);

  // 8. Save state
  markAsPosted(state, chosen.listing_id, postId, chosen.url);
  await saveState(state);
  console.log("State saved.");

  console.log(`\nDone! "${chosen.title}" posted to Facebook.`);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
