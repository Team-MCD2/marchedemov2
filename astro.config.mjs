// @ts-check
import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel/serverless';

// https://astro.build/config
export default defineConfig({
  site: 'https://marchedemo.vercel.app',
  output: 'hybrid',
  adapter: vercel({
    // ─── Vercel Web Analytics ─────────────────────────────────────────────
    // DÉSACTIVÉ par défaut. Activation en 2 étapes (ordre important) :
    //   1. Vercel Dashboard → ce projet → onglet "Analytics" → Enable.
    //   2. Passer ci-dessous à `enabled: true` puis redéployer.
    // L'inverse génère un 404 permanent sur /_vercel/insights/script.js
    // pour chaque visiteur (et casse aucun rendu, mais pollue la console).
    // Le script est sans cookie ni PII → conforme RGPD sans bandeau.
    webAnalytics: { enabled: false },
    imageService: true,
  }),
  integrations: [
    tailwind({ applyBaseStyles: false }),
    react(),
    sitemap({
      filter: (page) => !page.includes('/admin'),
    }),
  ],
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
  image: {
    // Hostnames acceptés par <Image> et <Picture>. Tout `<img>` raw n'est
    // pas concerné — uniquement les composants Astro Image.
    // Audit DB+catalogue (avr. 2026) : openfoodfacts (349), auchan (8),
    // grandfrais (1) sont les origines actives à autoriser.
    remotePatterns: [
      { protocol: 'https', hostname: 'static.wixstatic.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: 'images.openfoodfacts.org' },
      { protocol: 'https', hostname: 'cdn.auchan.fr' },
      { protocol: 'https', hostname: 'www.grandfrais.com' },
    ],
  },
});
