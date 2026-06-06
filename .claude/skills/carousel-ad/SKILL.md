---
name: carousel-ad
description: Design and launch a new Facebook carousel showcase ad mirroring the proven Showcase 20 structure. Use when the user wants another ad set, a fresh creative round, or to feature newly listed models.
argument-hint: <optional theme or listing IDs>
allowed-tools: Bash(npx tsx:*) Bash(git:*) Read Grep Glob Write Edit
---

# New Facebook Carousel Showcase Ad

Mirror the structure of the proven Showcase 20 ad sets: 1 campaign · 1 ad set · 2 ads · 10 carousel cards per ad · OUTCOME_TRAFFIC · LANDING_PAGE_VIEWS · LOWEST_COST_WITHOUT_CAP · advantage_audience on · all 4 publisher platforms.

## Step 1: Check what's already been run

```bash
cat data/carousel-ads-log.json | jq '.[].adSetName'
```

That file is the authoritative history of every carousel campaign created via script. Avoid re-using listing IDs that were in a recent campaign — variety drives clicks.

## Step 2: Decide listings (20 total, 10 per carousel)

Run `npx tsx src/scripts/weight-grid.ts` for current shop inventory at a glance, or pull `data/inventory.json` if you only need titles/IDs. Cross-reference against `carousel-ads-log.json` so you pick listings that haven't been carouseled recently.

Two carousels work best when each has a coherent theme — past splits:
- v1: Supertalls + Icons / London + Variety
- v2: Full-Colour Editions / Landmarks & Variety

Hand-curate the 20 with short headlines (≤24 chars) and descriptions (≤40 chars).

## Step 3: Confirm targeting matches the live state

The live ad set targeting on Facebook may have been hand-edited after the script's last run. Before mirroring, fetch the live targeting from the most recent ACTIVE Showcase campaign:

```ts
const r = await fetch(`https://graph.facebook.com/v25.0/${campaignId}/adsets?fields=targeting&access_token=${TOKEN}`);
```

Last verified targeting (2026-06-06): EU27 + UK + US + CA + AU + NZ + JP + CH + NO + IS + LI (37 countries). Always re-check — the user may have iterated since.

## Step 4: Build the new script

Copy `src/scripts/create-carousel-showcase-v2.ts` as the template — it has the latest patterns (targeting, ACTIVE launch, ad-log append). Rename to `create-carousel-showcase-v3.ts` (or whatever the next number is).

Change only:
- `CAROUSEL_C` / `CAROUSEL_D` arrays → your new listings + headlines
- `MAIN_MESSAGE` → new copy (FB messages are immutable post-creation, so get this right)
- Names: campaign, adset, ads, creatives → bump the version
- Status: ACTIVE vs PAUSED based on user preference

Keep everything else (TARGETING block, daily_budget, OUTCOME_TRAFFIC, helper functions, log append) verbatim.

## Step 5: Dry-run, then apply

```bash
npx tsx src/scripts/create-carousel-showcase-v3.ts          # dry run
npx tsx src/scripts/create-carousel-showcase-v3.ts --apply  # push live
```

The script validates every listing ID against `data/inventory.json` before hitting Facebook, and rate-limits Etsy image fetches at 250ms.

On successful apply, an entry is appended to `data/carousel-ads-log.json` with the full campaign / ad set / ad / creative IDs + targeting + listings. Commit this file so the history stays git-tracked.

## Step 6: Verify on Facebook

```ts
fetch(`https://graph.facebook.com/v25.0/${campaignId}?fields=name,status,effective_status&access_token=${TOKEN}`)
```

`effective_status: ACTIVE` means it's delivering. `IN_REVIEW` means waiting on FB approval (normal for first few hours). `DISAPPROVED` needs manual fix in Ads Manager.

## Reminders

- FB messages and creative copy are immutable post-creation. To change copy on an existing ad, use the `src/scripts/update-carousel-copy.ts` pattern (build new creatives, PATCH existing ads).
- Ad account: `act_56973929` · Page: `545877971951824`.
- Excluded markets in original ad: Singapore / Thailand / Taiwan (compliance declarations). They're absent from the curated 37-country list — keep them out.
- The script implements its own `fbPost()` helper rather than using the Facebook SDK. Don't add the SDK just for one more script.
