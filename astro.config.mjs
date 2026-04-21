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
    // webAnalytics est désactivé car non activé côté Vercel dashboard
    // (génère sinon un 404 sur /_vercel/insights/script.js).
    // Repasser à `enabled: true` après activation dans Vercel → Project → Analytics.
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
    remotePatterns: [
      { protocol: 'https', hostname: 'static.wixstatic.com' },
      { protocol: 'https', hostname: 'images.unsplash.com' },
    ],
  },
});
