// Fichiers de la page (spec 003) : le lecteur de la page complète, puis la carte, les en-têtes, les empreintes.
// Contrôles statiques : ils lisent des fichiers sans ouvrir de page.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
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
