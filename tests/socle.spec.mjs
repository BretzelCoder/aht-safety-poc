// T-01 : le socle d'outillage fonctionne et trouve la page.
import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));

test('index.html exists and is readable', () => {
  const chemin = racine + 'index.html';
  expect(existsSync(chemin), 'index.html should exist at the repository root').toBe(true);
  const texte = readFileSync(chemin, 'utf8');
  expect(texte.length, 'index.html should not be empty').toBeGreaterThan(1000);
  expect(texte, 'index.html should be an HTML document').toContain('<!DOCTYPE html>');
});
