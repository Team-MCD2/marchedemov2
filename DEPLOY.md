# Marché de Mo' V2 — Vercel deploy checklist

Single source of truth for going from local → production. Follow top-to-bottom
on the **first** deploy, then come back to the relevant section for updates.

---

## 1. Required environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for every
environment that should serve traffic (`Production`, optionally `Preview`).

| Name | Required for | Notes |
|---|---|---|
| `SUPABASE_URL` | Public site + admin | `https://<project>.supabase.co` |
| `SUPABASE_ANON_KEY` | Public site (RLS) | "Publishable" / `sb_publishable_...` |
| `SUPABASE_SERVICE_ROLE_KEY` | `/admin` writes only | **Secret** — bypasses RLS, never expose client-side |
| `ADMIN_PASSWORD` | `/admin` login | Strong random string |
| `ADMIN_COOKIE_SECRET` | `/admin` session | 32+ random chars (`openssl rand -hex 32`) |
| `PUBLIC_SITE_URL` | Canonicals + sitemap | `https://<final-domain>` (no trailing slash) |
| `CONTACT_TO_EMAIL` | Form stubs (logging only today) | `contact@marchedemo.com` |

The values you currently have in `.env.local` are valid for production — just
copy them across.

### Optional (no-op until wired)

The following keys appear in `.env.example` but are **not consumed** by any
shipping code path yet (the four form endpoints in `src/pages/api/` only log
to the console). Set them now if you want them in place for when the email
integrations are wired:

- `BREVO_API_KEY`, `BREVO_LIST_ID` — newsletter
- `RESEND_API_KEY` — contact / candidature / fidelity transactional emails

---

## 2. Update the canonical site URL

Once the production domain is final, change `astro.config.mjs:10`:

```js
site: 'https://<final-domain>',
```

This drives `<link rel="canonical">`, OG URLs, and the generated
`sitemap-index.xml`. Also update `PUBLIC_SITE_URL` to match.

---

## 3. First deploy

1. Push `main` to the connected Git repo.
2. Vercel auto-detects Astro. The `prebuild` script fetches TikTok
   thumbnails; the `postbuild` script (`scripts/fix-vercel-runtime.mjs`)
   patches the serverless function runtime to `nodejs22.x`.
3. Build target: ~170 s for 121 pages on the current catalogue.

---

## 4. Post-deploy smoke tests

After the first successful deploy, hit these URLs and confirm:

- `/` — featured products show real photos (not the "Photo à venir"
  placeholder).
- `/rayons/saveurs-afrique/feculents-farines` — Attiéké and Mil cards have
  product photos; Manioc and Riz cards show OFF fallback images.
- `/rayons/balkans-turques/patisseries/baklava` — full product grid renders.
- `/admin` — redirects to `/admin/login`. Logging in with `ADMIN_PASSWORD`
  reaches the dashboard.
- `/sitemap-index.xml` — exists and references the rayons.
- `/robots.txt` — references the sitemap and disallows `/admin` + `/api`.

---

## 5. Optional — turn on Vercel Web Analytics

The site is **fully wired** for Vercel Web Analytics, currently switched off.
The integration is via `@astrojs/vercel`'s `webAnalytics` flag — no extra
script tags or cookies, no consent banner needed (RGPD-friendly).

To turn it on (free up to 2 500 events/month on Hobby) :

1. Vercel dashboard → this project → **Analytics** tab → **Enable**.
2. Flip `webAnalytics: { enabled: true }` in `astro.config.mjs` (the
   toggle is in the `vercel({ … })` adapter block, with an inline guide).
3. Push / re-deploy.

**Order matters.** If you flip the code flag *before* enabling on the
dashboard, every page request will try to load `/_vercel/insights/script.js`
and get a 404 (the page still renders fine, but the console fills up).

---

## 5b. Lighthouse baseline (avr. 2026)

Baselined locally against `npm run build` + `npx serve` (mobile profile,
simulated 4G + 4× CPU throttle). Re-run on your production URL after the
first deploy for representative numbers.

| Category | Home | Rayon (baklava) |
|---|---|---|
| Performance | 37 | 31 |
| Accessibility | 90 → **96+** | 93 → **96+** |
| Best Practices | 100 | 100 |
| SEO | 100 | 100 |

A11y issues fixed in this pass:

- `inert` added to duplicate carousel slots (`PromoCarousel`, `ActuCarousel`)
  so keyboard users don't tab into invisible clones.
- `inert` added to `ChatMo` modal when closed (matches existing `aria-hidden`).
- Promo old-price strikethrough bumped from `text-neutral-400` → `text-neutral-500`
  (contrast 5.74:1, WCAG AA).
- Footer eyebrow on dark bg bumped from `text-vert-light` → `text-vert-400`
  (contrast 7.5:1, WCAG AAA).
- `PromoHero` carousel dots: hit target enlarged from 8×8 to 24×24 via a
  transparent button + visible `::before` dot (WCAG 2.5.8).

Performance score (37 / 31) is an artefact of the local static server: no
Brotli, no HTTP/2, no edge caching. On Vercel, the same build typically
scores 80-95 thanks to:

- Brotli compression on HTML / JS / CSS (≈80% smaller),
- HTTP/2 multiplexing,
- `Cache-Control: public, max-age=31536000, immutable` on hashed `_astro/*`,
- Edge image optimization for any `<Image>` component (cf. `astro.config.mjs`
  `image.remotePatterns`).

Re-run Lighthouse against `https://<final-domain>` after first deploy and
keep an eye on LCP / TBT — if they degrade past 2.5s / 200ms in real
conditions, profile with `npm run build && npx -y lighthouse@latest <URL>`.

---

## 6. Re-running data sync after edits

Whenever the local catalogue changes (new products, image swaps, taxonomy
moves), apply to Supabase before deploying:

```bash
node scripts/categorize-products.mjs
node --env-file=.env.local scripts/apply-catalogue-supabase.mjs --dry-run
node --env-file=.env.local scripts/apply-catalogue-supabase.mjs
```

The script is idempotent — only changed columns are written.
