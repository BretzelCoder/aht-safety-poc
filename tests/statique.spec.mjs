// Contrôles statiques (spec 001) : lecture de index.html, du README et des specs comme du texte.
// Chaque contrôle est une fonction pure, testée sur le vrai fichier et sur une copie volontairement cassée.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifierSyntaxe } from './helpers/controles-statiques.mjs';

const lire = chemin => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const html = lire('../index.html');

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
