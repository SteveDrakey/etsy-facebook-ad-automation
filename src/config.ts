import "dotenv/config";

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const config = {
  etsy: {
    apiKey: () => required("ETSY_API_KEY"),
    sharedSecret: () => required("ETSY_SHARED_SECRET"),
    shopName: () => optional("ETSY_SHOP_NAME", "Drakey3DPrints"),
    baseUrl: "https://api.etsy.com/v3/application",
  },
  facebook: {
    pageId: () => required("FB_PAGE_ID"),
    pageAccessToken: () => required("FB_PAGE_ACCESS_TOKEN"),
    adAccountId: () => required("FB_AD_ACCOUNT_ID"),
  },
  anthropic: {
    apiKey: () => required("ANTHROPIC_API_KEY"),
  },
} as const;

/** Monthly ad budget in pence (£50 total) */
export const MONTHLY_AD_BUDGET_PENCE = 5000;

/** Number of ads per month */
export const ADS_PER_MONTH = 1;

/** Budget per ad in pence (£25 single campaign) */
export const AD_BUDGET_PENCE = 2500;

/** Duration each ad runs (shorter = higher daily spend = better algorithm learning) */
export const AD_DURATION_DAYS = 7;

/** Max photos per Facebook post */
export const MAX_PHOTOS_PER_POST = 4;
