import bizSdk from "facebook-nodejs-business-sdk";
import { config, AD_BUDGET_PENCE, AD_DURATION_DAYS } from "../config.js";

const {
  FacebookAdsApi,
  Page,
  AdAccount,
  Campaign,
  AdSet,
  AdCreative,
  Ad,
} = bizSdk;

let initialized = false;

function init() {
  if (initialized) return;
  FacebookAdsApi.init(config.facebook.pageAccessToken());
  initialized = true;
}

/** Checked Graph API GET — throws on HTTP errors and API error responses */
async function fbGraphGet(path: string): Promise<any> {
  const token = config.facebook.pageAccessToken();
  const separator = path.includes("?") ? "&" : "?";
  const url = `https://graph.facebook.com/v25.0/${path}${separator}access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Facebook Graph API ${res.status}: ${body}`);
  }
  const data = await res.json();
  if ((data as any).error) {
    throw new Error(`Facebook Graph API error: ${(data as any).error.message}`);
  }
  return data;
}

// ─── Page Posting ────────────────────────────────────────────

export interface PhotoPostResult {
  id: string;
  post_id: string;
}

/**
 * Post a single photo to the Facebook Page.
 * Uses the image URL directly (Etsy URLs are public).
 */
export async function postPhotoToPage(
  imageUrl: string,
  caption: string
): Promise<PhotoPostResult> {
  init();
  const pageId = config.facebook.pageId();
  const page = new Page(pageId);
  const result = await page.createPhoto([], {
    url: imageUrl,
    message: caption,
    published: true,
  });
  return result._data as PhotoPostResult;
}

/**
 * Post multiple photos as a single Page post.
 * First uploads each photo as unpublished, then creates a feed post
 * attaching all of them.
 */
export async function postMultiplePhotos(
  imageUrls: string[],
  message: string
): Promise<{ id: string }> {
  init();
  const pageId = config.facebook.pageId();
  const page = new Page(pageId);

  // Upload each photo as unpublished
  const photoIds: string[] = [];
  for (const url of imageUrls) {
    const result = await page.createPhoto([], {
      url,
      published: false,
    });
    photoIds.push(result._data.id);
  }

  // Create a feed post with all photos attached
  const attachedMedia = photoIds.map((id) => ({ media_fbid: id }));
  const post = await page.createFeed([], {
    message,
    attached_media: attachedMedia,
    published: true,
  });

  return { id: post._data.id };
}

// ─── Ads / Promotion ─────────────────────────────────────────

export interface PromoteResult {
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
}

/**
 * Get or create the single persistent campaign.
 * One campaign lives forever, ad sets rotate under it.
 */
async function getOrCreateCampaign(): Promise<string> {
  const accountId = config.facebook.adAccountId();

  // Check for existing campaign
  const searchData = await fbGraphGet(
    `${accountId}/campaigns?fields=id,name,status&filtering=[{"field":"name","operator":"CONTAIN","value":"Drakey3DPrints Ads"}]`
  );
  const existing = searchData.data?.find(
    (c: any) => c.name === "Drakey3DPrints Ads" && c.status !== "DELETED"
  );

  if (existing) return existing.id;

  // Create new persistent campaign
  const account = new AdAccount(accountId);
  const campaign = await account.createCampaign([], {
    [Campaign.Fields.name]: "Drakey3DPrints Ads",
    [Campaign.Fields.objective]: "OUTCOME_TRAFFIC",
    [Campaign.Fields.status]: "ACTIVE",
    special_ad_categories: [],
    is_adset_budget_sharing_enabled: false,
  });
  if (!campaign?._data?.id) {
    throw new Error(`Failed to create campaign: ${JSON.stringify(campaign?._data)}`);
  }
  console.log(`    Created campaign: ${campaign._data.id}`);
  return campaign._data.id;
}

/**
 * Promote an existing page post as a Facebook ad.
 * Uses one persistent campaign, creates ad set + ad under it.
 */
export async function promotePost(
  postId: string,
  etsyUrl: string,
  adCopy: string,
  budgetPence = AD_BUDGET_PENCE,
  durationDays = AD_DURATION_DAYS,
  fallbackImageUrl?: string
): Promise<PromoteResult> {
  init();
  const accountId = config.facebook.adAccountId();
  const pageId = config.facebook.pageId();
  const account = new AdAccount(accountId);

  const now = new Date();
  const end = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const dateSuffix = now.toISOString().slice(0, 10);

  // 1. Get or create persistent campaign
  const campaignId = await getOrCreateCampaign();
  console.log(`    Using campaign: ${campaignId}`);

  // 2. Create Ad Set with lifetime budget
  const adSet = await account.createAdSet([], {
    [AdSet.Fields.name]: `${dateSuffix} - £${(budgetPence / 100).toFixed(2)} - ${durationDays}d`,
    [AdSet.Fields.campaign_id]: campaignId,
    [AdSet.Fields.lifetime_budget]: String(budgetPence),
    [AdSet.Fields.start_time]: now.toISOString(),
    [AdSet.Fields.end_time]: end.toISOString(),
    [AdSet.Fields.optimization_goal]: "LINK_CLICKS",
    [AdSet.Fields.billing_event]: "IMPRESSIONS",
    [AdSet.Fields.status]: "ACTIVE",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    // Core markets: English-speaking + EU + Japan
    [AdSet.Fields.targeting]: {
      age_min: 18,
      geo_locations: {
        countries: [
          "GB", "US", "CA", "AU",
          "DE", "FR", "IT", "ES", "NL", "BE", "AT",
          "SE", "NO", "DK", "FI", "CH",
          "IE", "PL", "PT",
          "JP",
        ],
      },
    },
  });
  if (!adSet?._data?.id) {
    throw new Error(`Failed to create ad set: ${JSON.stringify(adSet?._data)}`);
  }
  const adSetId = adSet._data.id;
  console.log(`    Created ad set: ${adSetId}`);

  // 3. Get the post's image, then create ad creative with short ad copy + SHOP_NOW
  const postData = await fbGraphGet(`${postId}?fields=full_picture`);
  let imageUrl: string | undefined = postData.full_picture;

  if (!imageUrl && fallbackImageUrl) {
    console.log(`    Post ${postId} has no full_picture, using fallback image`);
    imageUrl = fallbackImageUrl;
  }

  if (!imageUrl) {
    throw new Error(
      `Cannot create ad: no image available. Post ${postId} has no full_picture and no fallback was provided.`
    );
  }

  console.log(`    Using image: ${imageUrl.substring(0, 80)}...`);

  const creative = await account.createAdCreative([], {
    [AdCreative.Fields.name]: `${dateSuffix} - Shop Ad`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        picture: imageUrl,
        link: etsyUrl,
        message: adCopy, // Short ad copy, no raw URL - Shop Now button handles it
        name: "Shop on Etsy",
        call_to_action: { type: "SHOP_NOW", value: { link: etsyUrl } },
      },
    },
  });
  if (!creative?._data?.id) {
    throw new Error(`Failed to create ad creative: ${JSON.stringify(creative?._data)}`);
  }
  const creativeId = creative._data.id;
  console.log(`    Created creative: ${creativeId}`);

  // 4. Create Ad (ACTIVE - campaign is persistent, ad set has the budget/schedule)
  const ad = await account.createAd([], {
    [Ad.Fields.name]: `${dateSuffix} - Shop Ad`,
    [Ad.Fields.adset_id]: adSetId,
    [Ad.Fields.creative]: { creative_id: creativeId },
    [Ad.Fields.status]: "ACTIVE",
  });
  if (!ad?._data?.id) {
    throw new Error(`Failed to create ad: ${JSON.stringify(ad?._data)}`);
  }
  const adId = ad._data.id;
  console.log(`    Created ad: ${adId}`);

  return { campaignId, adSetId, creativeId, adId };
}

// ─── Page Reading ─────────────────────────────────────────────

export interface PagePost {
  id: string;
  message: string;
  created_time: string;
  full_picture?: string;
}

/** Fetch recent published posts from the page (uses Graph API directly) */
export async function getPagePosts(limit = 25): Promise<PagePost[]> {
  const pageId = config.facebook.pageId();
  const data = await fbGraphGet(
    `${pageId}/published_posts?fields=id,message,created_time,full_picture&limit=${limit}`
  );
  return data.data as PagePost[];
}

// ─── Test helpers ─────────────────────────────────────────────

/** Quick test: fetch page name to verify token works */
export async function getPageName(): Promise<string> {
  init();
  const pageId = config.facebook.pageId();
  const page = new Page(pageId);
  const result = await page.get([Page.Fields.name]);
  return result._data.name;
}

/** Quick test: verify ad account access */
export async function getAdAccountName(): Promise<string> {
  init();
  const accountId = config.facebook.adAccountId();
  const account = new AdAccount(accountId);
  const result = await account.get([AdAccount.Fields.name]);
  return result._data.name;
}
