// Contrôles statiques (spec 001) : lecture de index.html, du README et des specs comme du texte.
// Chaque contrôle est une fonction pure, testée sur le vrai fichier et sur une copie volontairement cassée.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifierSyntaxe, verifierAvertissement, verifierAnalytics } from './helpers/controles-statiques.mjs';

const lire = chemin => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const html = lire('../index.html');
const readme = lire('../README.md');

const decrire = erreurs => erreurs.map(e => `${e.fichier}:${e.ligne} ${e.message}`).join('\n');

test.describe('T-04 script syntax (S3)', () => {
  test('index.html has no syntax error', () => {
    const erreurs = verifierSyntaxe(html, 'index.html');
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('a syntax error is reported with the right line of index.html', () => {
    const lignes = html.split('\n');
    const cible = lignes.findIndex(l => l.startsWith('const clamp = ')); // ligne de la page, indice 0
    lignes.splice(cible + 1, 0, 'const cassé = ;');
    const erreurs = verifierSyntaxe(lignes.join('\n'), 'index.html');
    expect(erreurs, 'the broken copy should be reported').toHaveLength(1);
    expect(erreurs[0].fichier).toBe('index.html');
    expect(erreurs[0].ligne, 'the message should point to the injected line').toBe(cible + 2);
  });

  test('every inline script is checked, not only the first', () => {
    const deuxScripts = '<html><script>const a = 1;</script>\n<script>\nconst b = ;\n</script></html>';
    const erreurs = verifierSyntaxe(deuxScripts, 'copie.html');
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].ligne).toBe(3);
  });

  test('scripts loaded from a file are ignored', () => {
    expect(verifierSyntaxe('<script src="x.js"></script>', 'copie.html')).toEqual([]);
  });
});

test.describe('T-05 disclaimer (S9)', () => {
  test('README and index.html header keep the disclaimer', () => {
    const erreurs = verifierAvertissement(readme, html);
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('removing "not a safety tool" from the README is reported', () => {
    const erreurs = verifierAvertissement(readme.replace(/not a safety tool/gi, 'a tool'), html);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toBe('README.md');
    expect(erreurs[0].message).toContain('not a safety tool');
  });

  test('removing "not affiliated" from the README is reported', () => {
    const erreurs = verifierAvertissement(readme.replace(/not affiliated/gi, 'friendly with'), html);
    expect(erreurs.map(e => e.fichier)).toEqual(['README.md']);
    expect(erreurs[0].message).toContain('not affiliated');
  });

  test('removing the disclaimer from the header comment of index.html is reported', () => {
    const erreurs = verifierAvertissement(readme, html.replace('not a safety tool, not affiliated', 'a great tool'));
    expect(erreurs.map(e => e.fichier)).toEqual(['index.html', 'index.html']);
  });

  test('a disclaimer outside the header comment does not count for index.html', () => {
    const sansEntete = html.replace(/<!--[\s\S]*?-->/, '<!-- licence MIT -->') + '\n<p>not a safety tool, not affiliated</p>';
    expect(verifierAvertissement(readme, sansEntete).length).toBeGreaterThan(0);
  });
});

test.describe('T-05 analytics guard and event prefix (S10, static half)', () => {
  test('the analytics code is guarded by the host and every event is prefixed', () => {
    const erreurs = verifierAnalytics(html, 'index.html');
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('removing the host guard is reported', () => {
    const casse = html.replace('if (location.hostname === GC_HOST) {', 'if (true) {');
    const erreurs = verifierAnalytics(casse, 'index.html');
    expect(erreurs.length).toBeGreaterThan(0);
    expect(erreurs.map(e => e.message).join(' ')).toContain('guard');
  });

  test('another host in GC_HOST is reported', () => {
    const casse = html.replace("GC_HOST = 'bretzelcoder.github.io'", "GC_HOST = 'exemple.org'");
    expect(verifierAnalytics(casse, 'index.html').length).toBeGreaterThan(0);
  });

  test('an event without the aht-safety-poc/ prefix is reported with its line', () => {
    const casse = html.replace("track('aht-safety-poc/guide'", "track('guide'");
    const erreurs = verifierAnalytics(casse, 'index.html');
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('prefix');
    expect(casse.split('\n')[erreurs[0].ligne - 1]).toContain("track('guide'");
  });

  test('an event whose name is not a literal is reported', () => {
    const casse = html.replace("track('aht-safety-poc/guide'", "track(nom");
    expect(verifierAnalytics(casse, 'index.html')).toHaveLength(1);
  });
});