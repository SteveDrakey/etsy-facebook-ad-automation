---
name: create-listing
description: Create a new draft Etsy listing for a 3D printed skyscraper/building model. Use when the user wants to add a new building to the shop.
argument-hint: <building name>
allowed-tools: Bash(npx tsx:*) Read Grep Glob WebFetch
---

# Create New Etsy Listing

Create a draft Etsy listing for: **$ARGUMENTS**

## Step 1: Research the building

Fetch the Wikipedia page for the building to get:
- **Height(s)** — some buildings have multiple proposals/versions (e.g. Grollo Tower had 678m and 560m designs). If so, create separate listings for each.
- **Location** (city, country)
- **Architect / designer**
- **Key design features** (shape, style, notable structural elements)
- **Status** (built, under construction, proposed, unbuilt)

Ask the user to confirm the height and any details you're unsure about before proceeding.

## Step 2: Write the description

Follow the shop's established tone. Read `data/tone-reference.json` for voice examples if needed.

**Tone rules:**
- Conversational British English (use "centre" not "center", "colour" not "color", contractions are fine)
- Lead with a factual sentence mentioning the real height in metres
- Mention 1-2 distinctive architectural features of the real building
- Reference display/collection — "skyline collection", "display piece", "shelf or desk"
- Keep it to 2-3 short paragraphs, no bullet lists
- Never mention price (varies by scale)
- Never make claims about print quality you can't back up — no "museum quality", "flawless", etc.
- If unbuilt/incomplete, lean into that as a feature ("brings an unbuilt design to life", "finally gives us a finished version")
- Use en-dash (–) in titles, not hyphens: "Building Name – 3D Printed Skyscraper Model"
- Use smart quotes/apostrophes in descriptions (', ', ", ")

**Title format:** `Building Name – 3D Printed Skyscraper Model`
- If multiple versions: `Building Name (Year) – 3D Printed Skyscraper Model`
- For pairs: `Building Name – 3D Printed Pair Model`

## Step 3: Calculate prices

Use the shop's actual pricing formula — do NOT copy prices from another listing or use the old grid.ts tiers:

```
price = round(6 + 5.30 × √(weight_g))

Weight model: weight_g = 39 × (heightCm / 30)^2.5 × widthFactor²
```

This single formula (R²=1.000) matches every mono-colour tower in the shop. The 6 is a base constant and 5.30 is the coefficient fitted from actual pricing data.

**Width factor guide:**
- 0.7-0.8: very slim (Shard, Burj Khalifa, Jeddah)
- 0.9: slim (Lotte, Q1, Gevora, Princess Tower)
- 1.0: standard (Merdeka, Goldin)
- 1.1-1.3: medium (OWTC, Taipei 101, Shanghai Tower, Chrysler)
- 1.4-1.5: wide (Hancock, Empire State)
- 1.8-2.0: stocky (Gherkin, Walkie Talkie, Ryugyong)
- 2.5: very wide / pairs (Petronas, WTC Twins)

If unsure about width factor, compare to a similar building in `src/scripts/price-calc.ts`.

## Step 4: Assign processing tiers

Processing time per offering is based on estimated weight — do NOT use a flat value:

```
< 200g   → 3-5 days   (1402849608497)
200-500g → 5-7 days   (1416213279846)
500g-1kg → 1 week     (1403752122613)
1-3kg    → 1-2 weeks  (1413282949624)
> 3kg    → 2-3 weeks  (1442956055906)
```

Set `readiness_state_on_property: [514]` in the inventory payload so Etsy shows per-scale processing.

## Step 5: Generate tags (max 13)

Pattern:
1. `[building] model` (e.g. "empire state model")
2. `[city] landmark` or `[city] tower`
3. `[city] gift`
4. `[city] souvenir`
5. `[country/region] gift`
6. `architecture gift`
7. `gift for architect`
8. `bookshelf decor`
9. `tower replica` or `building replica`
10. `skyscraper model`
11-13. Building-specific terms (e.g. "art deco", "supertall", "unbuilt skyscraper")

All lowercase. No tag over 20 characters.

## Step 6: Create the listing

Write a script at `src/scripts/create-<building>.ts` following the pattern in `src/scripts/create-grollo.ts`.

**Fixed metadata (same for all mono-colour tower listings):**
- `taxonomy_id: 130`
- `shipping_profile_id: 260719988841`
- `return_policy_id: 1341900298666`
- `shop_section_id: 52394682`
- `processing_min: 3, processing_max: 5`
- `who_made: "i_did"`, `when_made: "made_to_order"`
- `type: "physical"`, `is_supply: false`, `should_auto_renew: true`
- `materials: ["Plastic", "Printed"]`
- `shop_id: 56796619`

**Standard 13 colours:**
Light Grey, Silver, Grey, Bronze, Ash Gray, Blue Gray, Cyan, Jade White, Tan, Black, Blue, Transparent Blue, Transparent Ice Blue

Note: both Transparent Blue and Transparent Ice Blue are transparent filaments.

**Standard 7 scales:** 1:3000, 1:2000, 1:1200, 1:1000, 1:800, 1:600, 1:400

**Inventory payload must include:**
- `price_on_property: [514]`
- `readiness_state_on_property: [514]`
- Property 200 = Primary color, Property 514 = Scale
- Empty `value_ids: []` for new values (Etsy assigns)

**SKU:** Find the next available DRAK-NNN number by checking `data/inventory.json`.

**Always dry-run first**, show the user the full breakdown (scales, prices, processing tiers, tags, description), then apply with `--apply`.

## Step 7: Register in price-calc.ts

Add the building to the `BUILDINGS` dictionary in `src/scripts/price-calc.ts` and `src/scripts/grid.ts` so future pricing reviews include it. Also add to `src/scripts/assign-processing.ts` BUILDINGS dictionary.

## Reminders

- If the building has multiple height variants, create **separate listings** (Etsy caps at ~100 products per listing)
- Don't forget to tell the user about any empty/failed listings that need deleting from their dashboard
- The first failed attempt at creating a listing will still create the listing shell — be aware of this
