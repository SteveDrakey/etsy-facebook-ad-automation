/**
 * Full shop backup — snapshots EVERYTHING we'd ever need to rebuild the shop:
 * listings (active + draft), inventories, shop info, shipping profiles,
 * sections, plus the full-resolution image files.
 *
 * Output (git-tracked):
 *   data/backups/full/{ISO-date}/
 *     manifest.json
 *     shop.json
 *     shipping-profiles.json
 *     sections.json
 *     production-partners.json
 *     listings.json          (array of full listing objects)
 *     inventories.json       (map: listing_id → inventory object)
 *     images/
 *       {listing_id}/
 *         {image_id}.jpg     (url_fullxfull)
 *
 * Usage: npx tsx src/scripts/full-backup.ts
 *
 * Dry-run is the default. Use --skip-images for a fast metadata-only backup.
 */
import "dotenv/config";
import { mkdir, writeFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getAccessToken } from "../etsy/auth.js";

const API_KEY = `${process.env.ETSY_API_KEY}:${process.env.ETSY_SHARED_SECRET}`;
const BASE = "https://api.etsy.com/v3/application";
const SHOP_ID = 56796619;

const __dirname = dirname(fileURLToPath(import.meta.url));
const skipImages = process.argv.includes("--skip-images");

const ts = new Date().toISOString().replace(/:/g, "-").slice(0, 19);
const BACKUP_DIR = join(__dirname, "../../data/backups/full", ts);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface AuthHeaders {
  "x-api-key": string;
  Authorization: string;
}

let authHeaders: AuthHeaders;

async function fetchJSON(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders });
  if (!res.ok) throw new Error(`GET ${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchJSONSoft(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders });
  if (!res.ok) return null;
  return res.json();
}

async function fetchAllListings(state: "active" | "draft"): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const body = await fetchJSON(
      `/shops/${SHOP_ID}/listings?state=${state}&limit=${limit}&offset=${offset}`
    );
    out.push(...body.results);
    if (out.length >= body.count || body.results.length === 0) break;
    offset += limit;
  }
  return out;
}

async function downloadImage(url: string, dest: string): Promise<number> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${url} ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  return buf.length;
}

async function main() {
  console.log(`Full backup → ${BACKUP_DIR}`);
  console.log(`Images: ${skipImages ? "SKIPPED" : "downloading"}\n`);
  await mkdir(BACKUP_DIR, { recursive: true });

  const token = await getAccessToken();
  authHeaders = { "x-api-key": API_KEY, Authorization: `Bearer ${token}` };

  // ─── Shop-level metadata ──────────────────────────────────
  console.log("Fetching shop metadata...");
  const shop = await fetchJSON(`/shops/${SHOP_ID}`);
  await writeFile(join(BACKUP_DIR, "shop.json"), JSON.stringify(shop, null, 2));

  console.log("Fetching shipping profiles...");
  const shipping = await fetchJSON(`/shops/${SHOP_ID}/shipping-profiles`);
  await writeFile(join(BACKUP_DIR, "shipping-profiles.json"), JSON.stringify(shipping, null, 2));

  console.log("Fetching shop sections...");
  const sections = await fetchJSONSoft(`/shops/${SHOP_ID}/sections`);
  if (sections) await writeFile(join(BACKUP_DIR, "sections.json"), JSON.stringify(sections, null, 2));

  console.log("Fetching production partners...");
  const partners = await fetchJSONSoft(`/shops/${SHOP_ID}/production-partners`);
  if (partners) await writeFile(join(BACKUP_DIR, "production-partners.json"), JSON.stringify(partners, null, 2));

  // ─── Listings (active + draft) ────────────────────────────
  console.log("\nFetching active listings...");
  const active = await fetchAllListings("active");
  console.log(`  ${active.length} active`);
  console.log("Fetching draft listings...");
  const drafts = await fetchAllListings("draft");
  console.log(`  ${drafts.length} draft`);

  const listings = [...active, ...drafts];
  await writeFile(join(BACKUP_DIR, "listings.json"), JSON.stringify(listings, null, 2));

  // ─── Inventories per listing ──────────────────────────────
  console.log(`\nFetching inventories for ${listings.length} listings...`);
  const inventories: Record<number, any> = {};
  let invCount = 0;
  for (const l of listings) {
    const inv = await fetchJSONSoft(`/listings/${l.listing_id}/inventory`);
    if (inv) {
      inventories[l.listing_id] = inv;
      invCount++;
    }
    await sleep(220); // ~5 QPS
  }
  await writeFile(join(BACKUP_DIR, "inventories.json"), JSON.stringify(inventories, null, 2));
  console.log(`  ${invCount} inventories captured`);

  // ─── Images metadata + downloads ──────────────────────────
  console.log(`\nFetching image metadata for ${listings.length} listings...`);
  const imagesMeta: Record<number, any[]> = {};
  for (const l of listings) {
    const body = await fetchJSONSoft(`/listings/${l.listing_id}/images`);
    if (body?.results) imagesMeta[l.listing_id] = body.results;
    await sleep(220);
  }
  await writeFile(join(BACKUP_DIR, "images-meta.json"), JSON.stringify(imagesMeta, null, 2));
  const totalImages = Object.values(imagesMeta).reduce((a, arr) => a + arr.length, 0);
  console.log(`  ${totalImages} image records across ${Object.keys(imagesMeta).length} listings`);

  // Download full-size images unless skipped
  let bytes = 0;
  let downloaded = 0;
  let failed = 0;
  if (!skipImages) {
    console.log(`\nDownloading full-resolution images (this may take a few minutes)...`);
    const imagesRoot = join(BACKUP_DIR, "images");
    await mkdir(imagesRoot, { recursive: true });

    for (const [listingIdStr, imgs] of Object.entries(imagesMeta)) {
      const listingId = parseInt(listingIdStr);
      if (imgs.length === 0) continue;
      const listingDir = join(imagesRoot, listingIdStr);
      await mkdir(listingDir, { recursive: true });

      for (const img of imgs) {
        const dest = join(listingDir, `${img.listing_image_id}.jpg`);
        try {
          const sz = await downloadImage(img.url_fullxfull, dest);
          bytes += sz;
          downloaded++;
          process.stdout.write(".");
        } catch (e: any) {
          failed++;
          console.log(`\n  ❌ ${listingId}/${img.listing_image_id}: ${e.message}`);
        }
        await sleep(120); // gentle on Etsy CDN
      }
    }
    console.log("");
  }

  // ─── Manifest ─────────────────────────────────────────────
  const manifest = {
    created_at: new Date().toISOString(),
    shop_id: SHOP_ID,
    shop_name: shop.shop_name,
    counts: {
      active_listings: active.length,
      draft_listings: drafts.length,
      total_listings: listings.length,
      inventories: invCount,
      image_records: totalImages,
      images_downloaded: downloaded,
      images_failed: failed,
    },
    bytes_downloaded: bytes,
    bytes_downloaded_mb: Math.round(bytes / 1024 / 1024 * 10) / 10,
    images_skipped: skipImages,
    etsy_api_version: "v3",
    files: [
      "shop.json",
      "shipping-profiles.json",
      "sections.json",
      "production-partners.json",
      "listings.json",
      "inventories.json",
      "images-meta.json",
      skipImages ? null : "images/{listing_id}/{image_id}.jpg",
    ].filter(Boolean),
  };
  await writeFile(join(BACKUP_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\n✅ Backup complete → ${BACKUP_DIR}`);
  console.log(`   Listings: ${listings.length} (${active.length} active, ${drafts.length} draft)`);
  console.log(`   Inventories: ${invCount}`);
  console.log(`   Images: ${downloaded}/${totalImages} (${manifest.bytes_downloaded_mb} MB)${failed ? `, ${failed} failed` : ""}`);
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
