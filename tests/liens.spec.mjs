// T-16 : vérification des liens (S11). Sans réseau : un petit serveur local joue les cas.
import { test, expect } from '@playwright/test';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { extraireLiens, verifierLiens, formaterAvertissement } from '../scripts/check-links.mjs';

const script = fileURLToPath(new URL('../scripts/check-links.mjs', import.meta.url));

let serveur, base;
test.beforeAll(async () => {
  serveur = http.createServer((req, res) => {
    if (req.url === '/ok') { res.writeHead(200); res.end('ok'); }
    else if (req.url === '/mort') { res.writeHead(404); res.end('absent'); }
    else if (req.url === '/refuse') { res.writeHead(403); res.end('non'); }
    else if (req.url === '/redirige') { res.writeHead(301, { location: '/ok' }); res.end(); }
    else if (req.url === '/lent') { /* ne répond jamais */ }
    else { res.writeHead(500); res.end(); }
  });
  await new Promise(fin => serveur.listen(0, '127.0.0.1', fin));
  base = `http://127.0.0.1:${serveur.address().port}`;
});
test.afterAll(() => { serveur.closeAllConnections?.(); serveur.close(); });

test.describe('T-16 link extraction', () => {
  test('finds markdown links, bare URLs and anchors, once each, without trailing punctuation', () => {
    const readme = 'See [ISO](https://www.iso.org/standard/1.html) and https://example.org/a. Also <https://example.org/b>, and [local](docs/x.md).\nRepeat: https://example.org/a';
    const html = `<a href="https://example.org/c">c</a> <a class="x" href='https://example.org/d'>d</a> <a href="#local">l</a>`;
    expect(extraireLiens(readme, html)).toEqual([
      'https://www.iso.org/standard/1.html', 'https://example.org/a', 'https://example.org/b',
      'https://example.org/c', 'https://example.org/d',
    ]);
  });

  test('page resources are not links to check: fonts, preconnect, analytics script and endpoint', () => {
    const html = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">
      <script>s.src = 'https://gc.zgo.at/count.js'; const GC_ENDPOINT = 'https://bretzel.goatcounter.com/count';</script>`;
    expect(extraireLiens('', html)).toEqual([]);
  });

  test('the real README and index.html contain external links', () => {
    const racine = fileURLToPath(new URL('..', import.meta.url));
    const liens = extraireLiens(readFileSync(`${racine}README.md`, 'utf8'), readFileSync(`${racine}index.html`, 'utf8'));
    expect(liens.length, 'the README and the guide cite sources').toBeGreaterThan(5);
    expect(liens.some(u => u.includes('iso.org')), 'the ISO sources are checked').toBe(true);
  });
});

test.describe('T-16 link checking', () => {
  test('a working link and a redirect to a working link pass', async () => {
    const r = await verifierLiens([`${base}/ok`, `${base}/redirige`], { delai: 3000 });
    expect(r.map(x => x.ok)).toEqual([true, true]);
  });

  test('a dead link is reported with its status and its address', async () => {
    const [r] = await verifierLiens([`${base}/mort`], { delai: 3000 });
    expect(r.ok).toBe(false);
    expect(r.statut).toBe(404);
    expect(r.raison).toContain('404');
  });

  test('a refusal to automated checks is reported as such', async () => {
    const [r] = await verifierLiens([`${base}/refuse`], { delai: 3000 });
    expect(r.ok).toBe(false);
    expect(r.raison).toContain('may block automated checks');
  });

  test('a link that never answers is a timeout, not a hang', async () => {
    const debut = Date.now();
    const [r] = await verifierLiens([`${base}/lent`], { delai: 300 });
    expect(r.ok).toBe(false);
    expect(r.raison).toContain('no answer within');
    expect(Date.now() - debut, 'the check gives up at the timeout').toBeLessThan(3000);
  });

  test('a refused connection is a network error, not an exception', async () => {
    const [r] = await verifierLiens(['http://127.0.0.1:1/'], { delai: 3000 });
    expect(r.ok).toBe(false);
    expect(r.raison).toContain('network error');
  });

  test('warnings are GitHub annotations in CI and plain lines locally', () => {
    const r = { url: 'https://exemple.org/x', raison: 'answered 404' };
    expect(formaterAvertissement(r, true)).toBe('::warning title=Dead link::https://exemple.org/x answered 404');
    expect(formaterAvertissement(r, false)).toBe('WARNING dead link: https://exemple.org/x answered 404');
  });
});

test.describe('T-16 command line (AC-13)', () => {
  // Lancement asynchrone : un lancement synchrone bloquerait le serveur de test, qui tourne dans ce même processus.
  const lancer = (args, env) => new Promise(fin => {
    let out = '';
    const p = spawn('node', [script, ...args, '--timeout', '3000'], { env: { ...process.env, ...env } });
    p.stdout.on('data', d => { out += d; });
    p.on('close', code => fin({ code, out }));
  });

  test('a dead link produces a warning naming it, and the exit code stays 0', async () => {
    const sortie = await lancer(['--only', `${base}/ok`, `${base}/mort`], { GITHUB_ACTIONS: '' });
    expect(sortie.code, 'a dead link never fails the run').toBe(0);
    expect(sortie.out).toContain(`WARNING dead link: ${base}/mort answered 404`);
    expect(sortie.out).toContain(`ok   200  ${base}/ok`);
    expect(sortie.out).toContain('2 links checked, 1 warning.');
  });

  test('in CI the warning is a GitHub annotation, still with exit code 0', async () => {
    const sortie = await lancer(['--only', `${base}/mort`], { GITHUB_ACTIONS: 'true' });
    expect(sortie.code).toBe(0);
    expect(sortie.out).toContain(`::warning title=Dead link::${base}/mort answered 404`);
  });
});
