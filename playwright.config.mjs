// Configuration des vérifications automatiques (spec 001).
// Un seul navigateur (Chromium) et une seule taille d'écran : voir la section « Hors périmètre » de la spec.
import { defineConfig } from '@playwright/test';

// Contrôles qui lisent des fichiers sans ouvrir de page : ils passent en premier, rapides, et leurs
// messages (ligne d'une erreur de syntaxe, clé manquante…) sont donc toujours dans le rapport.
const SANS_NAVIGATEUR = ['**/statique.spec.mjs', '**/liens.spec.mjs'];

export default defineConfig({
  testDir: 'tests',
  testMatch: '**/*.spec.mjs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Si le site est cassé, presque tous les tests échouent : on s'arrête après 10 échecs pour que le rouge arrive vite.
  maxFailures: 10,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    viewport: { width: 1600, height: 900 },
    // La page est toujours ouverte depuis le disque (file://), jamais via un serveur.
  },
  projects: [
    { name: 'static', testMatch: SANS_NAVIGATEUR },
    { name: 'chromium', testIgnore: SANS_NAVIGATEUR, use: { browserName: 'chromium' } },
  ],
});
