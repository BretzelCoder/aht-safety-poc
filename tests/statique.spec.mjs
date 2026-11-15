// Contrôles statiques (spec 001) : lecture de index.html, du README et des specs comme du texte.
// Chaque contrôle est une fonction pure, testée sur le vrai fichier et sur une copie volontairement cassée.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  verifierSyntaxe, verifierAvertissement, verifierAnalytics,
  verifierStatuts, estContexteMain, lireSpecs, brancheCourante, verifierSansConstructeur,
} from './helpers/controles-statiques.mjs';

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

  // Revue de la spec 001, écart 5 : l'idée « modèle pédagogique » de la spec (S9) doit aussi être gardée.
  test('removing "educational model" from the README is reported', () => {
    const erreurs = verifierAvertissement(readme.replace(/educational model/gi, 'model'), html);
    expect(erreurs.map(e => e.fichier)).toEqual(['README.md']);
    expect(erreurs[0].message).toContain('educational model');
  });

  test('removing "educational" from the header comment of index.html is reported', () => {
    const erreurs = verifierAvertissement(readme, html.replace('educational safety simulator', 'safety simulator'));
    expect(erreurs.map(e => e.fichier)).toEqual(['index.html']);
    expect(erreurs[0].message).toContain('educational');
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

test.describe('T-06 spec status (S8)', () => {
  const spec = (statut, dossier = '001-exemple') => ({
    chemin: `specs/${dossier}/spec.md`,
    texte: `# Spec\n\n> Status: ${statut}\n> Created: 2026-11-15 · Approved: —\n`,
  });

  test('the real specs pass in the current context', () => {
    const contexte = { main: estContexteMain(process.env, brancheCourante()) };
    const { erreurs, liste } = verifierStatuts(lireSpecs(fileURLToPath(new URL('..', import.meta.url))), contexte);
    console.log(`spec statuses (${contexte.main ? 'main context' : 'not a main context'}):\n  ${liste.join('\n  ')}`);
    expect(erreurs, decrire(erreurs)).toEqual([]);
    expect(liste.length, 'at least spec 001 should be listed').toBeGreaterThan(0);
  });

  test('a DRAFT spec fails in a main context and names the file', () => {
    const { erreurs } = verifierStatuts([spec('DRAFT')], { main: true });
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toBe('specs/001-exemple/spec.md');
    expect(erreurs[0].message).toContain('DRAFT');
  });

  test('an IN REVIEW spec fails in a main context', () => {
    const { erreurs } = verifierStatuts([spec('IN REVIEW')], { main: true });
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('IN REVIEW');
  });

  test('the other statuses pass in a main context', () => {
    const autres = ['APPROVED', 'DELIVERED', 'CLOSED', 'ON HOLD', 'ABANDONED'];
    const { erreurs } = verifierStatuts(autres.map((s, i) => spec(s, `00${i + 1}-x`)), { main: true });
    expect(erreurs).toEqual([]);
  });

  test('the template is ignored even when DRAFT', () => {
    const { erreurs, liste } = verifierStatuts([spec('DRAFT', '000-template')], { main: true });
    expect(erreurs).toEqual([]);
    expect(liste).toEqual([]);
  });

  test('outside a main context a DRAFT spec only produces a listing', () => {
    const { erreurs, liste } = verifierStatuts([spec('DRAFT'), spec('IN REVIEW', '002-y')], { main: false });
    expect(erreurs).toEqual([]);
    expect(liste).toEqual(['specs/001-exemple/spec.md: DRAFT', 'specs/002-y/spec.md: IN REVIEW']);
  });

  test('a spec without a readable status fails in a main context', () => {
    const { erreurs } = verifierStatuts([{ chemin: 'specs/003-z/spec.md', texte: '# Spec sans statut\n' }], { main: true });
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('status');
  });

  test('the main context is detected from the CI variables, then from the local branch', () => {
    expect(estContexteMain({ GITHUB_BASE_REF: 'main', GITHUB_REF: 'refs/pull/4/merge' }, null), 'pull request into main').toBe(true);
    expect(estContexteMain({ GITHUB_BASE_REF: 'dev', GITHUB_REF: 'refs/pull/4/merge' }, null), 'pull request into another branch').toBe(false);
    expect(estContexteMain({ GITHUB_REF: 'refs/heads/main' }, null), 'push to main').toBe(true);
    expect(estContexteMain({ GITHUB_REF: 'refs/heads/001-checks' }, 'main'), 'push to a feature branch in CI').toBe(false);
    expect(estContexteMain({}, 'main'), 'local, on main').toBe(true);
    expect(estContexteMain({}, '001-automated-checks'), 'local, on a feature branch').toBe(false);
    expect(estContexteMain({}, null), 'local, branch unknown').toBe(false);
  });
});

test.describe('T-02 no manufacturer name (spec 002, AC-18)', () => {
  test('the shipped page and the README name no manufacturer as owner of the architecture', () => {
    const erreurs = verifierSansConstructeur(readme, html);
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('the name in the README or in the page is reported with its file and line', () => {
    const lignes = html.split('\n'); lignes[9] += ' Liebherr';
    const e1 = verifierSansConstructeur(readme, lignes.join('\n'));
    expect(e1).toHaveLength(1);
    expect(e1[0].fichier).toBe('index.html');
    expect(e1[0].ligne).toBe(10);
    const e2 = verifierSansConstructeur('# aht\n\nBuilt like LIEBHERR trucks.\n', html);
    expect(e2.map(e => `${e.fichier}:${e.ligne}`), 'case does not matter').toEqual(['README.md:3']);
  });
});
