// Version de Node annoncée (spec 003, S1 à S3, AC-1 à AC-3) : une seule version dans les cinq endroits.
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { verifierVersionNode } from './helpers/versions.mjs';

const decrire = erreurs => erreurs.map(e => `${e.fichier}:${e.ligne} ${e.message}`).join('\n');

// Cinq endroits qui disent tous 24 : le cas sain, sur lequel chaque test casse un seul endroit.
const sain = () => ({
  pkg: JSON.stringify({ engines: { node: '>=24' } }),
  lock: JSON.stringify({ packages: { '': { engines: { node: '>=24' } }, 'node_modules/x': { engines: { node: '>=20' } } } }),
  readme: 'Needs Node.js 24 or later.\nThe checks run on Node 24 on GitHub.\n',
  claude: 'Install once (Node.js 24 or later).\n- `Checks` run green on Node 24.\n',
  workflow: 'jobs:\n  checks:\n    name: Checks (Node 24)\n    steps:\n      - uses: actions/setup-node@v7\n        with:\n          node-version: 24\n',
});

test.describe('T-01 Node version check (spec 003, S3)', () => {
  test('five places that all say 24 give no error', () => {
    expect(verifierVersionNode(sain())).toEqual([]);
  });

  test('package.json without engines is reported, since nothing can be compared', () => {
    const erreurs = verifierVersionNode({ ...sain(), pkg: '{}' });
    expect(erreurs.map(e => e.fichier)).toEqual(['package.json']);
  });

  test('the lock file saying 22 at its root is reported', () => {
    const lock = JSON.stringify({ packages: { '': { engines: { node: '>=22' } } } });
    const erreurs = verifierVersionNode({ ...sain(), lock });
    expect(erreurs.map(e => e.fichier), decrire(erreurs)).toEqual(['package-lock.json']);
    expect(erreurs[0].message).toContain('22');
  });

  test('the README saying 22 is reported with its line', () => {
    const erreurs = verifierVersionNode({ ...sain(), readme: 'Needs Node.js 24 or later.\nThe checks run on Node 22 on GitHub.\n' });
    expect(erreurs.map(e => e.fichier), decrire(erreurs)).toEqual(['README.md']);
    expect(erreurs[0].ligne).toBe(2);
  });

  test('CLAUDE.md saying 22 is reported, whichever of its mentions', () => {
    const erreurs = verifierVersionNode({ ...sain(), claude: 'Install once (Node.js 22 or later).\n- green on Node 24.\n' });
    expect(erreurs.map(e => e.fichier), decrire(erreurs)).toEqual(['CLAUDE.md']);
    expect(erreurs[0].ligne).toBe(1);
  });

  test('the workflow running 22 is reported', () => {
    const erreurs = verifierVersionNode({ ...sain(), workflow: sain().workflow.replace('node-version: 24', 'node-version: 22') });
    expect(erreurs.map(e => e.fichier), decrire(erreurs)).toEqual(['.github/workflows/checks.yml']);
    expect(erreurs[0].message).toContain('22');
  });

  test('a workflow with a matrix [22, 24] is reported', () => {
    const workflow = 'jobs:\n  checks:\n    name: Checks (Node ${{ matrix.node }})\n    strategy:\n      matrix:\n        node: [22, 24]\n    steps:\n      - uses: actions/setup-node@v7\n        with:\n          node-version: ${{ matrix.node }}\n';
    const erreurs = verifierVersionNode({ ...sain(), workflow });
    const textes = decrire(erreurs);
    expect(textes).toContain('matrix');
    expect(textes).toContain('node-version');
  });

  test('a comment that mentions a matrix is not a matrix', () => {
    const workflow = '# one job, no matrix\n' + sain().workflow;
    expect(verifierVersionNode({ ...sain(), workflow })).toEqual([]);
  });
});

// T-02 : les cinq endroits réels du dépôt. Un écart (par exemple un README resté à 22) fait échouer `npm test`.
test.describe('T-02 the real files (spec 003, AC-1, AC-2, AC-3)', () => {
  const lire = chemin => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

  test('package.json, the lock file, the README, CLAUDE.md and the workflow all say Node 24', () => {
    const erreurs = verifierVersionNode({
      pkg: lire('../package.json'), lock: lire('../package-lock.json'), readme: lire('../README.md'),
      claude: lire('../CLAUDE.md'), workflow: lire('../.github/workflows/checks.yml'),
    });
    expect(erreurs, decrire(erreurs)).toEqual([]);
    expect(JSON.parse(lire('../package.json')).engines.node).toBe('>=24');
  });

  test('the workflow runs one job, with no matrix', () => {
    const workflow = lire('../.github/workflows/checks.yml');
    expect(workflow.match(/^\s+runs-on:/gm)).toHaveLength(1);
    expect(workflow).not.toMatch(/^\s*strategy:/m);
  });
});
