---
name: backup-shop
description: Capture a full snapshot of the Etsy shop — listings, inventories, shipping profiles, sections, and full-resolution images — to data/backups/full/. Use when the user wants a backup, to commit a fresh shop state, or before a risky bulk change.
allowed-tools: Bash(npx tsx:*) Bash(git:*) Bash(ls:*) Bash(du:*) Read
---

# Full Shop Backup

Runs `src/scripts/full-backup.ts` and produces a git-trackable snapshot at `data/backups/full/{ISO-date}/`.

## What the backup contains

```
data/backups/full/{ISO-date}/
  manifest.json              counts + bytes + timestamp
  shop.json                  shop metadata
  shipping-profiles.json
  sections.json
  production-partners.json
  listings.json              all active + draft listings
  inventories.json           per-listing inventory (variations/offerings/readiness_state_id)
  images-meta.json           per-listing image metadata
  images/{listing_id}/{image_id}.jpg   full-resolution downloads
```

A typical snapshot: ~60 listings, ~430 images, ~280 MB.

## Step 1: Run the backup

Default (with images):
```bash
npx tsx src/scripts/full-backup.ts
```

Fast metadata-only (no image downloads):
```bash
npx tsx src/scripts/full-backup.ts --skip-images
```

Expect 5–10 minutes for the full version (rate-limited at ~5 QPS on Etsy + 120 ms gap on image downloads).

## Step 2: Verify

```bash
ls data/backups/full/   # see the new dated folder
cat data/backups/full/{date}/manifest.json
du -sh data/backups/full/{date}/
```

Manifest reports `images_downloaded` vs `images_failed`. If any failed, re-run — Etsy CDN is occasionally flaky.

## Step 3: Commit + push

```bash
git add data/backups/full/{date}/ .gitignore
git commit -m "Add shop backup {date} (N listings, N images, X MB)"
git push
```

`.gitignore` already has an explicit exception for `data/backups/full/**/images/**/*.jpg` so the global `*.jpg` rule doesn't block them. If you add a new backup variant under a different folder, add a matching exception.

## When NOT to use this

- For a single listing's history — there are per-listing JSON snapshots in `data/backups/*.json` from earlier ad-hoc backup runs. The full backup is for whole-shop snapshots, not single-listing diffs.
- For competitor data — `data/competitors.json` is updated by `src/scripts/fetch-competitors.ts`.

## Reminders

- Repo is public (`SteveDrakey/etsy-facebook-ad-automation`). Etsy listing images are public anyway, but if you ever add `policies.json` or anything with PII / pricing strategy notes, confirm with the user before committing.
- Each full backup is ~280 MB; the `.git` folder grows by roughly that amount per snapshot. After 5–6 snapshots, consider Git LFS or pruning old ones.
