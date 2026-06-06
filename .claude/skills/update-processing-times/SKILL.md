---
name: update-processing-times
description: Update dispatch / processing times on Etsy listings, and review which would benefit from per-variation tiering. Use when the user wants to push delivery times up or down, retier the shop, or review processing across the catalogue.
allowed-tools: Bash(npx tsx:*) Read Grep
---

# Update Processing / Delivery Times

## ⚠️ READ THIS FIRST — Etsy API gotcha

**PATCH `/shops/{id}/listings/{id}` with `processing_min` / `processing_max` returns 200 OK but Etsy silently ignores the value.** The response body even echoes back the unchanged values, so the script reports "✅ updated" but nothing on Etsy actually changes. This was diagnosed on 2026-06-06 with WTC Twins (listing 4426197221): sent 10/15, response and subsequent fetch both still showed 5/10.

**Cause**: Etsy moved most listings to a per-variation `readiness_state_id` model (each offering has its own ID; the listing-level `processing_min/max` is now derived/read-only). `readiness_state_on_property: [514]` on the inventory response means processing varies by Scale.

**No public v3 endpoint** for managing readiness states exists yet (probed `readiness-states`, `readiness_states`, `shipping-readiness`, `processing-profiles` — all 404).

**So the only way to actually change times right now is Shop Manager UI, per variation.** Always tell the user this before running the script with `--apply` — the script gives you the *intended* tiering as a worksheet but won't push.

## Step 1: Review current state

The diagnostic grid shows smallest / mid / largest scale weight per listing with a ⚡ marker on listings whose weight crosses tier boundaries (i.e. per-variation would actually help):

```bash
npx tsx src/scripts/weight-grid.ts
```

Use this output as the source-of-truth worksheet when editing per-variation values in Shop Manager.

## Step 2: Confirm the tier mapping

Current tiers in `src/scripts/update-processing-times.ts`:

```
weight <= 150g  → 1-5 days
weight <= 500g  → 5-10 days
weight >  500g  → 10-15 days
```

Weight formula: `39g × (largestHeightCm/30)^2.5 × widthFactor² × (1.5 if multicolour)`.

If the user wants different tiers, edit the `TIER_SMALL` / `TIER_MEDIUM` / `TIER_LARGE` constants in `update-processing-times.ts`. Don't change the weight formula without re-fitting from `src/scripts/grid.ts`.

## Step 3: Dry-run to see proposed changes

```bash
npx tsx src/scripts/update-processing-times.ts
```

Output flags every listing with current → proposed values plus the computed weight. Listings without a building profile or parseable scale variations are **skipped** (not over-promised); add the profile to the `BUILDINGS` dict if you want them included.

## Step 4: Apply per-variation in Shop Manager

Until the readiness-state API is exposed, walk the dry-run output and update each listing's per-variation processing in Shop Manager. For listings where every variant is genuinely slow (e.g. WTC Twins — finer detail, every print takes time), use listing-level processing instead of per-variation.

If/when the v3 endpoint becomes available, wire it into `patchProcessing()` in `update-processing-times.ts` and `--apply` will work end-to-end.

## Reminders

- `WEIGHT_OVERRIDES` in `update-processing-times.ts` carries per-listing multipliers (e.g. WTC Twins ×1.2 for extra detail). Add to this dict rather than editing per-listing tier code.
- New buildings need a profile in the `BUILDINGS` dict (mirror of `src/scripts/price-calc.ts`) — see commit `dd7a3b2` for the Ping An / ICC / Two IFC / HSBC / Chambord additions as templates.
- The `recommend-processing-times.ts` script is the *older* read-only sibling that uses the inventory cache instead of live API. Prefer `weight-grid.ts` (live) for fresh data.
