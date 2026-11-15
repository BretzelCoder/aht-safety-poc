// Fichiers de la page (spec 003) : le lecteur de la page complète, puis la carte, les en-têtes, les empreintes.
// Contrôles statiques : ils lisent des fichiers sans ouvrir de page.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { verifierRequetes } from './helpers/chargements.mjs';
import { verifierCarte, verifierPageComplete, MARQUEURS_PAGE, verifierConcerns, lireCarteReadme, CONCERNS } from './helpers/carte.mjs';
import { fichiersDeLaBase, extraireBase } from '../scripts/lire-base.mjs';
import { empreinteDe, ecrireEmpreinte, lireEmpreinte, lireManifeste, ecrireManifeste, verifierEmpreintes } from '../scripts/empreintes.mjs';
import { readPage, reconstituerPage, lireTexte } from '../scripts/read-page.mjs';

const racine = fileURLToPath(new URL('..', import.meta.url));

test.describe('T-05 reader of the whole page (spec 003, S7, AC-7, AC-18)', () => {
  const entree = [
    '<html>', '<head>', '<link rel="stylesheet" href="css/a.css">',
    '<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">', '</head>', '<body>',
    '<script src="js/un.js"></script>', '<script src="js/deux.js"></script>',
    '<script src="https://gc.zgo.at/count.js"></script>', '<script>const inline = 1;</script>', '</body>', '</html>',
  ].join('\n');
  const fichiers = { 'css/a.css': 'body { margin: 0 }\n.b { color: red }\n', 'js/un.js': 'const un = 1;\nconst un2 = 2;\n', 'js/deux.js': 'const deux = 2;\n' };
  const lire = chemin => { if (!(chemin in fichiers)) throw new Error('absent ' + chemin); return fichiers[chemin]; };

  test('inlines each own script and style sheet in the order of the tags, and nothing else', () => {
    const { html, fichiers: liste } = reconstituerPage(entree, lire);
    expect(liste).toEqual(['css/a.css', 'js/un.js', 'js/deux.js']);
    expect(html).toContain('<style>\nbody { margin: 0 }\n.b { color: red }\n</style>');
    expect(html.indexOf('const un = 1;')).toBeLessThan(html.indexOf('const deux = 2;'));
    expect(html).not.toContain('src="js/un.js"');
    // Google Fonts, GoatCounter et le script en ligne restent tels quels
    expect(html).toContain('<link href="https://fonts.googleapis.com/css2?family=X" rel="stylesheet">');
    expect(html).toContain('<script src="https://gc.zgo.at/count.js"></script>');
    expect(html).toContain('<script>const inline = 1;</script>');
  });

  test('line endings are read as LF', () => {
    const { html } = reconstituerPage(entree, p => lire(p).replace(/\n/g, '\r\n'));
    expect(html).not.toContain('\r');
  });

  test('a line of the rebuilt page is mapped back to its file and line', () => {
    const { html, origine } = reconstituerPage(entree, lire);
    const lignes = html.split('\n');
    const de = texte => lignes.findIndex(l => l === texte) + 1;
    expect(origine(de('const un2 = 2;'))).toEqual({ fichier: 'js/un.js', ligne: 2 });
    expect(origine(de('const deux = 2;'))).toEqual({ fichier: 'js/deux.js', ligne: 1 });
    expect(origine(de('.b { color: red }'))).toEqual({ fichier: 'css/a.css', ligne: 2 });
    // une ligne de l'entrée située après les fichiers retrouve son numéro dans index.html
    expect(origine(de('<script>const inline = 1;</script>'))).toEqual({ fichier: 'index.html', ligne: entree.split('\n').indexOf('<script>const inline = 1;</script>') + 1 });
    expect(origine(de('<body>'))).toEqual({ fichier: 'index.html', ligne: 6 });
  });

  test('a tag that names a file that does not exist is reported with its name', () => {
    expect(() => reconstituerPage(entree.replace('js/deux.js', 'js/absent.js'), lire)).toThrow('absent');
    expect(() => readPage(racine + 'inexistant/')).toThrow(/own file of the page not found: index\.html/);
  });

  test('on the real page the reader gives back every own file in the order of the tags', () => {
    const { html, fichiers: liste } = readPage(racine);
    const brut = lireTexte(racine + 'index.html');
    if (liste.length === 0) expect(html, 'single-file page: the reader changes nothing').toBe(brut);
    else for (const f of liste) expect(html, `${f} is inlined`).toContain(lireTexte(racine + f).replace(/\n$/, '').split('\n')[0]);
  });
});

// T-10 : la page de référence d'une révision git, d'un seul fichier ou de plusieurs (spec 003, section 4 et AC-6).
test.describe('T-10 reference page of a git revision (spec 003, AC-6)', () => {
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.org', '-c', 'core.autocrlf=false', ...args], { cwd }).toString();
  const nouveauDepot = fichiers => {
    const dossier = mkdtempSync(join(tmpdir(), 'aht-depot-'));
    git(dossier, 'init', '-q');
    for (const [chemin, texte] of Object.entries(fichiers)) {
      mkdirSync(dirname(join(dossier, chemin)), { recursive: true });
      writeFileSync(join(dossier, chemin), texte);
    }
    git(dossier, 'add', '-A');
    git(dossier, 'commit', '-q', '-m', 'x');
    return dossier;
  };

  test('a single-file base gives index.html alone', () => {
    const depot = nouveauDepot({ 'index.html': '<html></html>', 'README.md': 'x' });
    expect(fichiersDeLaBase('HEAD', depot)).toEqual(['index.html']);
    const sortie = mkdtempSync(join(tmpdir(), 'aht-sortie-'));
    expect(extraireBase('HEAD', depot, sortie)).toEqual(['index.html']);
    expect(readFileSync(join(sortie, 'index.html'), 'utf8')).toBe('<html></html>');
  });

  test('a base with css/ and js/ gives all of them with their folders, and ignores unrelated files', () => {
    const depot = nouveauDepot({
      'index.html': '<html></html>', 'css/style.css': 'a{}', 'js/m1.js': 'const a = 1;', 'js/sous/b.js': 'const b = 2;',
      'README.md': 'x', 'tests/t.mjs': 'x', 'docs/js/notes.md': 'x',
    });
    expect(fichiersDeLaBase('HEAD', depot)).toEqual(['css/style.css', 'index.html', 'js/m1.js', 'js/sous/b.js']);
    const sortie = mkdtempSync(join(tmpdir(), 'aht-sortie-'));
    extraireBase('HEAD', depot, sortie);
    expect(readFileSync(join(sortie, 'js/sous/b.js'), 'utf8')).toBe('const b = 2;');
    expect(existsSync(join(sortie, 'README.md')), 'an unrelated file is not copied').toBe(false);
  });

  test('a revision without index.html is refused', () => {
    const depot = nouveauDepot({ 'README.md': 'x' });
    expect(() => extraireBase('HEAD', depot, mkdtempSync(join(tmpdir(), 'aht-sortie-')))).toThrow('no index.html');
  });
});

// T-13 : empreintes de version des fichiers (spec 003, S13 et AC-15, moitié statique).
test.describe('T-13 release stamps (spec 003, S13, AC-15)', () => {
  const js = "'use strict';\nconst a = 1;\n";
  const css = 'body { margin: 0 }\n';

  test('the stamp is the same with CRLF or LF, and does not depend on its own line', () => {
    const e = empreinteDe(js, 'js/a.js');
    expect(e).toMatch(/^[0-9a-f]{8}$/);
    expect(empreinteDe(js.replace(/\n/g, '\r\n'), 'js/a.js')).toBe(e);
    const avec = ecrireEmpreinte(js, 'js/a.js', e);
    expect(avec).toContain("AHT.inscrire('js/a.js', '" + e + "');");
    expect(empreinteDe(avec, 'js/a.js')).toBe(e);
    expect(lireEmpreinte(avec, 'js/a.js')).toBe(e);
    expect(empreinteDe(js + 'const b = 2;\n', 'js/a.js'), 'any other change moves the stamp').not.toBe(e);
  });

  test('writing a stamp is idempotent, replaces the old one and keeps the line endings of the file', () => {
    const e = empreinteDe(js, 'js/a.js');
    const une = ecrireEmpreinte(js, 'js/a.js', e);
    expect(ecrireEmpreinte(une, 'js/a.js', e)).toBe(une);
    expect(ecrireEmpreinte(une, 'js/a.js', '00000000').match(/AHT\.inscrire/g)).toHaveLength(1);
    const crlf = ecrireEmpreinte(js.replace(/\n/g, '\r\n'), 'js/a.js', e);
    expect(crlf).toContain('\r\n');
    expect(crlf.replace(/\r\n/g, '')).not.toContain('\n');
    expect(empreinteDe(crlf, 'js/a.js')).toBe(e);
  });

  test('a style sheet carries its stamp as a custom property of :root', () => {
    const e = empreinteDe(css, 'css/s.css');
    const avec = ecrireEmpreinte(css, 'css/s.css', e);
    expect(avec).toContain(`:root { --aht-stamp: '${e}'; }`);
    expect(lireEmpreinte(avec, 'css/s.css')).toBe(e);
    expect(empreinteDe(avec, 'css/s.css')).toBe(e);
  });

  const html = ["<script>", "window.AHT = {", "  attendu: {", "    'css/s.css': '11111111',", "    'js/a.js': '22222222',", "  },", "  vu: {},", "};", "</script>"].join('\n');

  test('the manifest of index.html is read and rewritten', () => {
    expect([...lireManifeste(html)]).toEqual([['css/s.css', '11111111'], ['js/a.js', '22222222']]);
    const neuf = ecrireManifeste(html, new Map([['js/a.js', 'aaaaaaaa'], ['js/b.js', 'bbbbbbbb']]));
    expect([...lireManifeste(neuf)]).toEqual([['js/a.js', 'aaaaaaaa'], ['js/b.js', 'bbbbbbbb']]);
    expect(neuf).toContain('  vu: {},');
    expect(lireManifeste('<html></html>')).toBeNull();
  });

  const sain = () => {
    const fichiers = [
      { chemin: 'js/a.js', texte: ecrireEmpreinte(js, 'js/a.js', empreinteDe(js, 'js/a.js')) },
      { chemin: 'css/s.css', texte: ecrireEmpreinte(css, 'css/s.css', empreinteDe(css, 'css/s.css')) },
    ];
    return { fichiers, manifeste: new Map(fichiers.map(f => [f.chemin, lireEmpreinte(f.texte, f.chemin)])) };
  };

  test('files and manifest that agree give no error', () => {
    const { fichiers, manifeste } = sain();
    expect(verifierEmpreintes(fichiers, manifeste)).toEqual([]);
  });

  test('a file edited without rewriting its stamp is reported by name', () => {
    const { fichiers, manifeste } = sain();
    fichiers[0].texte = fichiers[0].texte.replace('const a = 1;', 'const a = 2;');
    const erreurs = verifierEmpreintes(fichiers, manifeste);
    expect(erreurs.map(e => e.fichier)).toEqual(['js/a.js']);
    expect(erreurs[0].message).toContain('stale');
  });

  test('a manifest line that differs, a missing entry, an unknown entry and a file with no stamp are reported', () => {
    const { fichiers, manifeste } = sain();
    manifeste.set('js/a.js', 'ffffffff');
    expect(verifierEmpreintes(fichiers, manifeste).map(e => e.message).join('|')).toContain('the manifest says ffffffff for js/a.js');
    const sansEntree = new Map(manifeste); sansEntree.delete('css/s.css');
    expect(verifierEmpreintes(fichiers, sansEntree).map(e => e.message).join('|')).toContain('does not list css/s.css');
    const inconnue = new Map(manifeste); inconnue.set('js/zzz.js', '12345678');
    expect(verifierEmpreintes(fichiers, inconnue).map(e => e.message).join('|')).toContain('js/zzz.js, which no tag');
    const nu = [{ chemin: 'js/a.js', texte: js }];
    expect(verifierEmpreintes(nu, new Map([['js/a.js', '22222222']])).map(e => e.message).join('|')).toContain('no stamp line');
    expect(verifierEmpreintes(fichiers, null)[0].message).toContain('no manifest');
  });

  test('the command line rewrites the stamps of a folder, then --check passes; --check fails on a stale stamp', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'aht-stamps-'));
    mkdirSync(join(dossier, 'js')); mkdirSync(join(dossier, 'css'));
    writeFileSync(join(dossier, 'js/a.js'), js);
    writeFileSync(join(dossier, 'css/s.css'), css);
    writeFileSync(join(dossier, 'index.html'), ['<html><head><link rel="stylesheet" href="css/s.css"></head><body>', '<script>', 'window.AHT = {', '  attendu: {', '  },', '};', '</script>', '<script src="js/a.js"></script>', '</body></html>'].join('\n'));
    const cli = fileURLToPath(new URL('../scripts/stamps.mjs', import.meta.url));
    const lancer = (...args) => spawnSync(process.execPath, [cli, '--racine', dossier, ...args], { encoding: 'utf8' });
    expect(lancer('--check').status, 'nothing stamped yet').toBe(1);
    expect(lancer().status).toBe(0);
    const apres = lancer('--check');
    expect(apres.status, apres.stdout).toBe(0);
    writeFileSync(join(dossier, 'js/a.js'), readFileSync(join(dossier, 'js/a.js'), 'utf8').replace('const a = 1;', 'const a = 3;'));
    const perime = lancer('--check');
    expect(perime.status).toBe(1);
    expect(perime.stdout).toContain('js/a.js');
    expect(lancer().status).toBe(0);
    expect(lancer('--check').status).toBe(0);
  });
});

// T-15 (avec T-28) : ce que la page demande depuis le disque (spec 003, AC-16).
test.describe('T-28 requests of the page (spec 003, AC-16)', () => {
  const attendus = ['index.html', 'css/style.css', 'js/a.js'];
  const base = 'file:///C:/depot/';
  const ok = [base + 'index.html?lang=fr', base + 'css/style.css', base + 'js/a.js'];

  test('exactly the entry file and its own files, once each, give no error', () => {
    expect(verifierRequetes(ok, attendus)).toEqual([]);
    expect(verifierRequetes([...ok, 'https://fonts.googleapis.com/css2'], attendus), 'network requests are not file requests').toEqual([]);
  });

  test('a file the page is not supposed to request is reported', () => {
    const erreurs = verifierRequetes([...ok, base + 'js/intrus.js'], attendus);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toContain('intrus.js');
  });

  test('an own file that is never requested is reported', () => {
    const erreurs = verifierRequetes(ok.slice(0, 2), attendus);
    expect(erreurs.map(e => e.fichier)).toEqual(['js/a.js']);
    expect(erreurs[0].message).toContain('never requested');
  });

  test('a file requested twice is reported', () => {
    const erreurs = verifierRequetes([...ok, base + 'js/a.js'], attendus);
    expect(erreurs.map(e => e.fichier)).toEqual(['js/a.js']);
    expect(erreurs[0].message).toContain('2 times');
  });
});

// T-26 : la carte des fichiers de la page (spec 003, S10 et AC-12).
test.describe('T-26 the map of the page files (spec 003, S10, AC-12)', () => {
  const etiquettes = ['css/style.css', 'js/a.js', 'js/b.js'];
  const readme = '| File | Concern | What |\n|---|---|---|\n| `index.html` | entry | x |\n| `css/style.css` | style | x |\n| `js/a.js` | base | x |\n| `js/b.js` | module-1 | x |\n';
  const claude = 'Stack: `css/style.css`, `js/a.js`, `js/b.js`.';
  const sain = () => ({ etiquettes, repertoire: [...etiquettes], readme, claude, suivis: [...etiquettes], textes: { 'js/a.js': 'a\nb\n', 'js/b.js': 'a\r\nb\r\n' } });

  test('tags, directory, README, CLAUDE.md and git agreeing give no error', () => {
    expect(verifierCarte(sain())).toEqual([]);
  });

  test('a file missing from the README map, and a README row without a file, are reported', () => {
    const e1 = verifierCarte({ ...sain(), readme: readme.replace('| `js/b.js` | module-1 | x |\n', '') });
    expect(e1.map(e => e.fichier + ' ' + e.message).join('|')).toContain('no row for js/b.js');
    const e2 = verifierCarte({ ...sain(), readme: readme + '| `js/fantome.js` | base | x |\n' });
    expect(e2.map(e => e.message).join('|')).toContain('names js/fantome.js');
  });

  test('a file missing from CLAUDE.md, and a path in CLAUDE.md that no tag loads, are reported', () => {
    const e1 = verifierCarte({ ...sain(), claude: 'Stack: `css/style.css`, `js/a.js`.' });
    expect(e1.map(e => e.fichier + ' ' + e.message).join('|')).toContain('CLAUDE.md the Stack part does not name js/b.js');
    const e2 = verifierCarte({ ...sain(), claude: claude + ' Also `js/fantome.js`.' });
    expect(e2.map(e => e.message).join('|')).toContain('names js/fantome.js');
  });

  test('a file in js/ that no tag loads, and a tag that names no file, are reported', () => {
    const e1 = verifierCarte({ ...sain(), repertoire: [...etiquettes, 'js/orphelin.js'] });
    expect(e1.map(e => e.fichier + ' ' + e.message).join('|')).toContain('js/orphelin.js exists in js/ or css/ but no tag of index.html loads it');
    const e2 = verifierCarte({ ...sain(), repertoire: ['css/style.css', 'js/a.js'] });
    expect(e2.map(e => e.fichier + ' ' + e.message).join('|')).toContain('js/b.js is named by a tag but does not exist');
  });

  test('a tag in another case than the file is reported as such (GitHub Pages is case-sensitive)', () => {
    const e = verifierCarte({ ...sain(), repertoire: ['css/style.css', 'js/a.js', 'js/B.js'] });
    expect(e.map(x => x.message).join('|')).toContain('another case');
  });

  test('an untracked file is reported, and outside a git checkout the check is skipped', () => {
    const e = verifierCarte({ ...sain(), suivis: ['css/style.css', 'js/a.js'] });
    expect(e.map(x => x.fichier + ' ' + x.message).join('|')).toContain('js/b.js is not tracked by git');
    expect(verifierCarte({ ...sain(), suivis: null })).toEqual([]);
  });

  test('a file that mixes CRLF and LF is reported', () => {
    const e = verifierCarte({ ...sain(), textes: { 'js/a.js': 'a\r\nb\nc\r\n' } });
    expect(e.map(x => x.fichier + ' ' + x.message).join('|')).toContain('js/a.js mixes CRLF and LF');
  });

  test('on the real repository the map is true', () => {
    const { fichiers } = readPage(racine);
    const repertoire = ['js', 'css'].flatMap(d => readdirSync(racine + d).map(f => `${d}/${f}`));
    let suivis = null;
    try { suivis = execFileSync('git', ['ls-files', 'js', 'css'], { cwd: racine }).toString().split('\n').filter(Boolean); } catch { /* hors d'un dépôt git */ }
    const textes = Object.fromEntries(fichiers.map(f => [f, readFileSync(racine + f, 'utf8')]));
    const erreurs = verifierCarte({
      etiquettes: fichiers, repertoire, suivis, textes,
      readme: readFileSync(racine + 'README.md', 'utf8').replace(/\r\n/g, '\n'), claude: readFileSync(racine + 'CLAUDE.md', 'utf8').replace(/\r\n/g, '\n'),
    });
    expect(erreurs, erreurs.map(e => `${e.fichier}: ${e.message}`).join('\n')).toEqual([]);
    expect(fichiers.length, '22 scripts and one style sheet').toBe(23);
  });

  test('the rebuilt page holds the code of every module, and the entry file alone does not', () => {
    expect(verifierPageComplete(readPage(racine).html)).toEqual([]);
    const seul = verifierPageComplete(readFileSync(racine + 'index.html', 'utf8'));
    expect(seul.length, 'a reader that returned only index.html would lose them').toBe(MARQUEURS_PAGE.length);
    expect(seul[0].message).toContain('does not give the whole code');
  });
});

// T-27 : un seul concern par fichier, et les empreintes des vrais fichiers (spec 003, S8, S13, AC-10, AC-15).
test.describe('T-27 one concern per file, and the stamps of the real files (spec 003, AC-10, AC-15)', () => {
  const entete = c => `/* aht-safety-poc : x\n   @concern ${c}\n*/\n'use strict';\n`;
  const sain = () => ({
    fichiers: [
      { chemin: 'js/a.js', texte: entete('module-2') + '/* ====\n   MODULE 2 — EmbeddedCommsBus\n   ==== */\nconst x = 1;\n' },
      { chemin: 'js/b.js', texte: entete('i18n') + '/* ====\n   I18N — langues\n   ==== */\n' },
    ],
    carte: new Map([['js/a.js', 'module-2'], ['js/b.js', 'i18n']]),
  });

  test('files that declare one concern each, and carry their own banners, give no error', () => {
    const { fichiers, carte } = sain();
    expect(verifierConcerns(fichiers, carte)).toEqual([]);
  });

  test('a module-3 banner pasted into a module-2 file is reported', () => {
    const { fichiers, carte } = sain();
    fichiers[0].texte += '/* ====\n   MODULE 3 — AutonomyAndSafetyCore\n   ==== */\nfunction supervise() {}\n';
    const e = verifierConcerns(fichiers, carte);
    expect(e.map(x => x.fichier), e.map(x => x.message).join('\n')).toEqual(['js/a.js']);
    expect(e[0].message).toContain('module-3');
  });

  test('a second @concern marker pasted into a file is reported', () => {
    const { fichiers, carte } = sain();
    fichiers[1].texte += '/* @concern module-1 */\n';
    expect(verifierConcerns(fichiers, carte).map(x => x.message).join('|')).toContain('second `@concern module-1`');
  });

  test('a file without header, an unknown concern, and a README column that disagrees are reported', () => {
    const { fichiers, carte } = sain();
    fichiers.push({ chemin: 'js/c.js', texte: 'const c = 1;\n' });
    expect(verifierConcerns(fichiers, carte).map(x => x.fichier + ' ' + x.message).join('|')).toContain('js/c.js has no `@concern` marker');
    const inconnu = [{ chemin: 'js/d.js', texte: entete('module-9') }];
    expect(verifierConcerns(inconnu, new Map()).map(x => x.message).join('|')).toContain('"module-9", which is not one of');
    expect(verifierConcerns(fichiers.slice(0, 2), new Map([['js/a.js', 'module-3'], ['js/b.js', 'i18n']])).map(x => x.message).join('|')).toContain('the README map says "module-3"');
  });

  test('on the real repository every file declares one concern, the same as the README map', () => {
    const { fichiers } = readPage(racine);
    const carte = lireCarteReadme(readFileSync(racine + 'README.md', 'utf8').replace(/\r\n/g, '\n'));
    const textes = fichiers.map(chemin => ({ chemin, texte: lireTexte(racine + chemin) }));
    const erreurs = verifierConcerns(textes, carte);
    expect(erreurs, erreurs.map(e => `${e.fichier}: ${e.message}`).join('\n')).toEqual([]);
    expect(new Set(textes.map(f => /@concern\s+(\S+)/.exec(f.texte)[1])), 'the ten kinds of concern are all used').toEqual(new Set(CONCERNS));
  });

  test('on the real repository every stamp is the hash of its file and the manifest says the same', () => {
    const { fichiers } = readPage(racine);
    const propres = fichiers.map(chemin => ({ chemin, texte: readFileSync(racine + chemin, 'utf8') }));
    const manifeste = lireManifeste(readFileSync(racine + 'index.html', 'utf8'));
    const erreurs = verifierEmpreintes(propres, manifeste);
    expect(erreurs, erreurs.map(e => `${e.fichier}: ${e.message}`).join('\n')).toEqual([]);
    expect(manifeste.size).toBe(23);
  });

  test('a real file edited without running scripts/stamps.mjs is reported, and so is a changed manifest line', () => {
    const chemin = 'js/m2-comms-bus.js';
    const { fichiers } = readPage(racine);
    const propres = fichiers.map(c => ({ chemin: c, texte: readFileSync(racine + c, 'utf8') }));
    const manifeste = lireManifeste(readFileSync(racine + 'index.html', 'utf8'));
    const modifie = propres.map(f => f.chemin === chemin ? { ...f, texte: f.texte.replace('function canResponse', 'function canResponseX') } : f);
    expect(modifie.find(f => f.chemin === chemin).texte, 'the breakage is applied').not.toBe(propres.find(f => f.chemin === chemin).texte);
    expect(verifierEmpreintes(modifie, manifeste).map(e => e.fichier + ' ' + e.message).join('|')).toContain(`${chemin} its stamp`);
    const autre = new Map(manifeste); autre.set('js/base.js', '00000000');
    expect(verifierEmpreintes(propres, autre).map(e => e.message).join('|')).toContain('the manifest says 00000000 for js/base.js');
  });
});
