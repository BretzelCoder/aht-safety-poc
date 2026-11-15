// Fichiers de la page (spec 003) : le lecteur de la page complète, puis la carte, les en-têtes, les empreintes.
// Contrôles statiques : ils lisent des fichiers sans ouvrir de page.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fichiersDeLaBase, extraireBase } from '../scripts/lire-base.mjs';
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
