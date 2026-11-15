// Configuration des vérifications automatiques (spec 001).
// Un seul navigateur (Chromium) et une seule taille d'écran : voir la section « Hors périmètre » de la spec.
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    viewport: { width: 1600, height: 900 },
    // La page est toujours ouverte depuis le disque (file://), jamais via un serveur.
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
