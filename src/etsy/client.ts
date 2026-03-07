import { config } from "../config.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LISTINGS_PATH = join(__dirname, "../../data/listings.json");

const BASE = config.etsy.baseUrl;

function headers(): Record<string, string> {
  return { "x-api-key": config.etsy.apiKey() };
}

async function etsyFetch<T>(path: string): Promise<T> {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Etsy API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface EtsyShop {
  shop_id: number;
  shop_name: string;
  title: string;
  url: string;
}

export interface EtsyListing {
  listing_id: number;
  title: string;
  description: string;
  url: string;
  tags: string[];
  price: { amount: number; divisor: number; currency_code: string };
  quantity?: number;
  creation_timestamp: number;
  state?: string;
  images?: string[];
}

export interface EtsyImage {
  listing_image_id: number;
  listing_id: number;
  url_fullxfull: string;
  url_570xN: string;
  url_170x135: string;
}

interface ListingsResponse {
  count: number;
  results: EtsyListing[];
}

interface ImagesResponse {
  count: number;
  results: EtsyImage[];
}

interface ShopsResponse {
  count: number;
  results: EtsyShop[];
}

// ─── API methods (used when Etsy key is active) ─────────────

/** Resolve a shop name (e.g. "Drakey3DPrints") to its numeric shop ID */
export async function getShopId(shopName: string): Promise<number> {
  const data = await etsyFetch<ShopsResponse>(
    `/shops?shop_name=${encodeURIComponent(shopName)}`
  );
  if (data.count === 0) throw new Error(`Shop not found: ${shopName}`);
  return data.results[0].shop_id;
}

/** Fetch all active listings via API, sorted by newest first */
export async function getActiveListingsFromApi(
  shopId: number,
  limit = 25,
  offset = 0
): Promise<{ listings: EtsyListing[]; total: number }> {
  const data = await etsyFetch<ListingsResponse>(
    `/shops/${shopId}/listings/active?limit=${limit}&offset=${offset}&sort_on=created&sort_order=desc`
  );
  return { listings: data.results, total: data.count };
}

/** Fetch images for a specific listing via API */
export async function getListingImages(
  listingId: number
): Promise<EtsyImage[]> {
  const data = await etsyFetch<ImagesResponse>(
    `/listings/${listingId}/images`
  );
  return data.results;
}

// ─── RSS feed fallback (no API key needed) ──────────────────

/** Fetch listings from the public Etsy shop RSS feed */
export async function getListingsFromRss(shopName: string): Promise<EtsyListing[]> {
  const url = `https://www.etsy.com/uk/shop/${encodeURIComponent(shopName)}/rss`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`RSS feed ${res.status}`);
  const xml = await res.text();

  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  return items.map((match, i) => {
    const block = match[1];
    const title = block.match(/<title>(.*?)<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>(.*?)<\/link>/)?.[1] ?? "";
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] ?? "";
    const desc = block.match(/<description>(.*?)<\/description>/s)?.[1] ?? "";

    const listingId = Number(link.match(/listing\/(\d+)\//)?.[1] ?? i + 1);

    const decoded = desc
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'");

    const imageUrl = decoded.match(/src="([^"]+)"/)?.[1] ?? "";
    const priceMatch = decoded.match(/<p class="price">([\d.]+) (\w+)<\/p>/);
    const priceAmount = priceMatch ? Math.round(parseFloat(priceMatch[1]) * 100) : 0;
    const currency = priceMatch?.[2] ?? "GBP";
    const descText = decoded
      .match(/<p class="description">([\s\S]*?)<\/p>/)?.[1]
      ?.replace(/<br\s*\/?>/g, "\n")
      ?.replace(/<[^>]+>/g, "")
      ?.trim() ?? "";

    return {
      listing_id: listingId,
      title: title.replace(/ by Drakey3DPrints$/, ""),
      description: descText,
      url: link.replace(/\?ref=rss$/, ""),
      tags: ["3d print", "skyscraper", "model", "architecture"],
      price: { amount: priceAmount, divisor: 100, currency_code: currency },
      images: imageUrl ? [imageUrl] : [],
      creation_timestamp: Math.floor(new Date(pubDate).getTime() / 1000),
    };
  });
}

/** Load listings from data/listings.json */
export async function getListingsFromFile(): Promise<EtsyListing[]> {
  const raw = await readFile(LISTINGS_PATH, "utf-8");
  return JSON.parse(raw) as EtsyListing[];
}

// ─── Unified getter (tries API → RSS → local file) ──────────

/**
 * Get active listings. Tries in order:
 * 1. Etsy API (needs approved key)
 * 2. RSS feed (always public, no key needed)
 * 3. data/listings.json (local fallback)
 */
export async function getActiveListings(): Promise<{
  listings: EtsyListing[];
  total: number;
  source: "api" | "rss" | "file";
}> {
  const shopName = config.etsy.shopName();

  // Try API first
  try {
    const shopId = await getShopId(shopName);
    const result = await getActiveListingsFromApi(shopId, 100);
    return { ...result, source: "api" };
  } catch {
    // API unavailable, try RSS
  }

  try {
    console.log("Etsy API unavailable, trying RSS feed...");
    const listings = await getListingsFromRss(shopName);
    if (listings.length > 0) {
      // Also save to listings.json so it stays fresh
      await writeFile(LISTINGS_PATH, JSON.stringify(listings, null, 2) + "\n");
      return { listings, total: listings.length, source: "rss" };
    }
  } catch {
    // RSS failed too
  }

  console.log("RSS unavailable, using local listings.json");
  const listings = await getListingsFromFile();
  return { listings, total: listings.length, source: "file" };
}

/**
 * Get image URLs for a listing. If the listing already has an `images`
 * array (from listings.json), use that. Otherwise fetch via API.
 */
export async function getImageUrls(listing: EtsyListing): Promise<string[]> {
  if (listing.images && listing.images.length > 0) {
    return listing.images;
  }
  const images = await getListingImages(listing.listing_id);
  return images.map((img) => img.url_570xN);
}

/** Download an image from a URL to a local temp file, returns the local path */
export async function downloadImage(
  imageUrl: string,
  destDir: string
): Promise<string> {
  await mkdir(destDir, { recursive: true });
  const filename = `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const destPath = join(destDir, filename);

  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
  return destPath;
}
