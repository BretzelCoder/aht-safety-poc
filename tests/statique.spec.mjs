// Contrôles statiques (spec 001) : lecture de index.html, du README et des specs comme du texte.
// Chaque contrôle est une fonction pure, testée sur le vrai fichier et sur une copie volontairement cassée.
import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { readPage } from '../scripts/read-page.mjs';
import {
  verifierSyntaxe, verifierAvertissement, verifierAnalytics,
  verifierStatuts, estContexteMain, lireSpecs, brancheCourante, verifierSansConstructeur, verifierLatenceSansChiffre,
  verifierCrochet, verifierEpinglage, verifierCsp, verifierEchappement,
} from './helpers/controles-statiques.mjs';

const lire = chemin => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
// La page complète : index.html avec ses fichiers propres (spec 003), lue par scripts/read-page.mjs.
const html = readPage(fileURLToPath(new URL('..', import.meta.url))).html;
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

  // Amendement du 2026-11-15 : ni distribution Linux ni outil de construction nommés (le schéma dit « distribution Linux »).
  for (const mot of ['Yocto', 'Debian']) {
    test(`${mot} written in the page or in the README is reported with its file and line`, () => {
      const lignes = html.split('\n'); lignes[11] += ` ${mot}`;
      const e1 = verifierSansConstructeur(readme, lignes.join('\n'));
      expect(e1.map(e => `${e.fichier}:${e.ligne}`)).toEqual(['index.html:12']);
      expect(e1[0].message).toContain(mot);
      const e2 = verifierSansConstructeur(`# aht\n\nBased on ${mot.toUpperCase()}.\n`, html);
      expect(e2.map(e => `${e.fichier}:${e.ligne}`), 'case does not matter').toEqual(['README.md:3']);
    });
  }
});

test.describe('T-17 no latency written in the new HTML (spec 002, AC-15)', () => {
  test('the autonomy card, the levels pane and their static texts carry no written latency', () => {
    const erreurs = verifierLatenceSansChiffre(html);
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('a latency written in the kernel select of the card is reported with its line', () => {
    const copie = html.replace('<option value="GP"></option>', '<option value="GP">General-purpose kernel · 250 ms</option>');
    expect(copie, 'the breakage was applied').not.toBe(html);
    const erreurs = verifierLatenceSansChiffre(copie);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('250 ms');
    expect(erreurs[0].ligne).toBe(copie.split('\n').findIndex(l => l.includes('General-purpose kernel · 250 ms')) + 1);
  });

  test('a latency written in the pane is reported', () => {
    const copie = html.replace('<div class="blk l2" id="blkL2"></div>', '<div class="blk l2" id="blkL2">brake latency 0,8 ms</div>');
    expect(copie).not.toBe(html);
    const erreurs = verifierLatenceSansChiffre(copie);
    expect(erreurs.map(e => e.message).join('|')).toContain('0,8 ms');
  });

  test('a latency written in a static text of the card is reported', () => {
    const copie = html.replace("'ui.l1Help': 'Illustrative latencies.'", "'ui.l1Help': 'Illustrative latencies, 50 ms.'");
    expect(copie).not.toBe(html);
    const erreurs = verifierLatenceSansChiffre(copie);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('ui.l1Help');
  });

  test('a missing block is reported, not silently accepted', () => {
    const erreurs = verifierLatenceSansChiffre(html.replace('id="cardL1"', 'id="carte"'));
    expect(erreurs.map(e => e.message).join('|')).toContain('was not found');
  });
});

test.describe('spec 004 S1/S2 - Content Security Policy of the page', () => {
  // Lecture BRUTE de index.html : verifierCsp ramène lui-même CRLF à LF dans chaque script avant de hacher,
  // comme le navigateur ; on lui passe donc le fichier tel qu'il est sur le disque (CRLF d'une copie Windows compris).
  const brut = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

  test('the policy exists, allows only the known origins and the exact hash of every inline script', () => {
    const erreurs = verifierCsp(brut);
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('a policy missing the hash of one inline script is reported', () => {
    const casse = brut.replace(/'sha256-[A-Za-z0-9+/=]+' 'sha256-[A-Za-z0-9+/=]+'/, "'");
    const erreur = verifierCsp(casse);
    expect(erreur.map(e => e.message).join(' ')).toContain('not allowed by its own hash');
  });

  test('a stale hash pin is reported', () => {
    const casse = brut.replace('https://gc.zgo.at', "'sha256-ZmF1c3NlIGVtcHJlaW50ZT0' https://gc.zgo.at");
    const erreur = verifierCsp(casse).filter(e => e.message.includes('stale pin'));
    expect(erreur).toHaveLength(1);
  });

  test('an origin outside the allowlist is reported', () => {
    const casse = brut.replace('https://gc.zgo.at', 'https://example.org/lib.js');
    const erreur = verifierCsp(casse);
    expect(erreur.map(e => e.message).join(' ')).toContain('https://example.org/lib.js');
  });

  test('a missing directive is reported', () => {
    const casse = brut.replace(/base-uri 'none';\s*/, '');
    expect(verifierCsp(casse).map(e => e.message).join(' ')).toContain('base-uri');
  });

  test("'unsafe-inline' in script-src is reported, although style-src may carry it", () => {
    const casse = brut.replace("script-src 'self'", "script-src 'unsafe-inline' 'self'");
    const messages = verifierCsp(casse).map(e => e.message);
    expect(messages.join(' ')).toContain('script-src allows "\'unsafe-inline\'"');
    expect(messages.filter(m => m.includes('style-src'))).toEqual([]);
  });

  test('data: outside img-src and a hash outside script-src are reported', () => {
    const casse = brut.replace("font-src https://fonts.gstatic.com", "font-src data: 'sha256-AAAA' https://fonts.gstatic.com");
    const messages = verifierCsp(casse).map(e => e.message).join(' ');
    expect(messages).toContain('font-src allows "data:"');
    expect(messages).toContain('font-src allows "\'sha256-AAAA\'"');
  });

  test('a directive the policy is not expected to carry is reported', () => {
    const casse = brut.replace("form-action 'none'", "form-action 'none'; object-src *");
    expect(verifierCsp(casse).map(e => e.message).join(' ')).toContain('object-src is not one the policy is expected to carry');
  });

  test('an inline script with attributes, which the hash check would miss, is reported', () => {
    const casse = brut.replace('</head>', '<script type="module">alert(1)</script>\n</head>');
    expect(verifierCsp(casse).map(e => e.message).join(' ')).toContain('carries attributes');
  });

  test('the hash holds on a CRLF checkout and on an LF one (the browser normalises before comparing)', () => {
    const lf = brut.replace(/\r\n/g, '\n');
    const crlf = lf.replace(/\n/g, '\r\n');
    expect(verifierCsp(lf)).toEqual([]);
    expect(verifierCsp(crlf)).toEqual([]);
  });

  test('a page without the meta tag is reported', () => {
    const casse = brut.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, '');
    expect(verifierCsp(casse).map(e => e.message).join(' ')).toContain('no Content-Security-Policy');
  });
});

test.describe('spec 004 S4-S6 - the test-only hook never exists on the published site', () => {
  const hook = lire('../js/test-hook.js');

  test('the hook is created behind the published-site guard', () => {
    const erreurs = verifierCrochet(hook);
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('creating the hook without the guard is reported', () => {
    const casse = hook.replace('if (location.hostname !== GC_HOST) {', '');
    const erreurs = verifierCrochet(casse);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('published-site guard');
    expect(erreurs[0].fichier).toBe('js/test-hook.js');
  });

  test('a guard that lets the published site through is reported', () => {
    const casse = hook.replace('location.hostname !== GC_HOST', 'true');
    expect(verifierCrochet(casse)).toHaveLength(1);
  });

  test('a guard that only survives in a comment is reported', () => {
    const casse = hook.replace('if (location.hostname !== GC_HOST) {', '// if (location.hostname !== GC_HOST) {');
    expect(verifierCrochet(casse)).toHaveLength(1);
  });

  test('a guard whose block does not contain the assignment is reported', () => {
    const casse = hook.replace('if (location.hostname !== GC_HOST) {', 'if (location.hostname !== GC_HOST) {}\n');
    expect(verifierCrochet(casse)).toHaveLength(1);
  });

  test('an assignment that exists only in a comment counts as a missing hook', () => {
    const casse = hook.replace('window.__sim =', '// window.__sim =');
    expect(verifierCrochet(casse).map(e => e.message).join(' ')).toContain('is missing');
  });
});

test.describe('spec 004 S7 - workflow actions pinned by commit SHA', () => {
  const workflow = lire('../.github/workflows/checks.yml');

  test('every uses: in the workflow is pinned to a full commit SHA', () => {
    const erreurs = verifierEpinglage(workflow);
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('a movable tag in uses: is reported with the pin', () => {
    const casse = workflow.replace(/actions\/checkout@[0-9a-f]{40}/, 'actions/checkout@v7');
    const erreurs = verifierEpinglage(casse);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('actions/checkout@v7');
  });

  test('a SHA that is too short is still reported', () => {
    const casse = workflow.replace(/(actions\/cache@)[0-9a-f]{40}/, '$1deadbeef');
    expect(verifierEpinglage(casse)).toHaveLength(1);
  });
});

test.describe('spec 005 S3 - dynamic text enters the markup through html`…` only', () => {
  const racine = '../';
  const fichiersJs = readdirSync(fileURLToPath(new URL('../js', import.meta.url))).filter(f => f.endsWith('.js')).map(f => `js/${f}`);
  // T-05 retire cette exception : le HUD est réécrit à cette tâche (la fixture ci-dessous prouve que le contrôle le voit d'ici là).
  const EN_ATTENTE_T05 = ['js/m4-hud.js'];

  // Les scripts en ligne de index.html, lus à leur place (le reste de la page est blanchi, les lignes restent justes).
  const scriptsEnLigne = () => {
    const brut = lire('../index.html');
    return brut.replace(/<script>([\s\S]*?)<\/script>|[\s\S]/g, (m, contenu) => contenu !== undefined ? `${' '.repeat(8)}${contenu}${' '.repeat(9)}` : (m === '\n' ? '\n' : ' '));
  };

  test('every file of js/ and every inline script of index.html follows the rule', () => {
    const erreurs = [
      ...fichiersJs.filter(f => !EN_ATTENTE_T05.includes(f)).flatMap(f => verifierEchappement(lire(racine + f), f)),
      ...verifierEchappement(scriptsEnLigne(), 'index.html'),
    ];
    expect(erreurs, decrire(erreurs)).toEqual([]);
  });

  test('the HUD as it was before spec 005 (fixture) is reported on its 12 innerHTML lines and its untagged fragments', () => {
    const erreurs = verifierEchappement(lire('./fixtures/m4-hud-avant-spec-005.txt'), 'js/m4-hud.js');
    const puits = erreurs.filter(e => e.message.startsWith('.innerHTML ='));
    expect(puits.map(e => e.ligne)).toEqual([41, 45, 57, 67, 71, 72, 74, 81, 82, 89, 91, 102]);
    expect(erreurs.filter(e => e.message.includes('is not tagged html')).length, 'row(), chip() and the other fragments').toBeGreaterThanOrEqual(5);
  });

  const un = (texte, permis = []) => verifierEchappement(texte, 'js/essai.js', permis);

  test('a clean file passes: tagged template, nested tagged fragment, textContent', () => {
    const propre = "const a = html`<b>${x}</b>`;\nel.innerHTML = html`<ul>${l.map(i => html`<li>${i}</li>`)}</ul>`;\nel.textContent = `${a} < ${b}`;\nel.insertAdjacentHTML('beforeend', html`<i>${x}</i>`);\n";
    expect(un(propre)).toEqual([]);
  });

  test('an untagged template pasted into innerHTML is reported', () => {
    const erreurs = un('el.innerHTML = `<b>${msg}</b>`;\n');
    expect(erreurs.map(e => e.message).join(' ')).toContain('.innerHTML = receives something other than');
    expect(erreurs.map(e => e.message).join(' ')).toContain('is not tagged html');
  });

  test('a raw value in an attribute of an untagged template is reported', () => {
    const erreurs = un('function f(m) { return `<div title="${m}">x</div>`; }\n');
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('is not tagged html');
    expect(erreurs[0].ligne).toBe(1);
  });

  test('a new innerHTML = variable is reported', () => {
    expect(un('const h = calc();\nel.innerHTML = h;\n').map(e => e.ligne)).toEqual([2]);
    expect(un('el.innerHTML += texte;\n')).toHaveLength(1);
  });

  test('insertAdjacentHTML, outerHTML, document.write and DOMParser with something other than html`…` are reported', () => {
    expect(un("el.insertAdjacentHTML('beforeend', texte);\n")).toHaveLength(1);
    expect(un('el.outerHTML = texte;\n')).toHaveLength(1);
    expect(un('document.write(texte);\n')).toHaveLength(1);
    expect(un('document.writeln(a, b);\n')).toHaveLength(1);
    expect(un('const f = r.createContextualFragment(texte);\n')).toHaveLength(1);
    expect(un("new DOMParser().parseFromString(texte, 'text/html');\n").length).toBeGreaterThanOrEqual(1);
  });

  test('a read of innerHTML and a comparison are not sinks', () => {
    expect(un('const s = el.innerHTML;\nif (el.innerHTML === "") x();\n')).toEqual([]);
  });

  test('raw() outside the allow-list is reported, and accepted with an entry', () => {
    expect(un("el.innerHTML = html`<p>${raw('<br>')}</p>`;\n").map(e => e.message).join(' ')).toContain('not on the allow-list');
    const entree = [{ fichier: 'js/essai.js', expression: "raw('<br>')", raison: 'test' }];
    expect(un("el.innerHTML = html`<p>${raw('<br>')}</p>`;\n", entree)).toEqual([]);
  });

  test('an allow-list entry accepts exactly its expression, and a stale entry is reported', () => {
    const entree = [{ fichier: 'js/essai.js', expression: 'pick(a, b)', raison: 'test' }];
    expect(un('n.innerHTML = pick(a, b);\n', entree)).toEqual([]);
    expect(un('n.innerHTML = pick(a, c);\n', entree).length, 'another expression is not covered, and the entry is stale').toBe(2);
    expect(un('const rien = 1;\n', entree).map(e => e.message).join(' ')).toContain('stale entry');
  });

  test('comments, strings and regular expressions that look like code do not fool the reader', () => {
    const piege = [
      "// el.innerHTML = '<b>' + x;  (un commentaire avec l'apostrophe)",
      "/* el.innerHTML = `<i>${y}</i>` */",
      "const s = \"el.innerHTML = 'a'\", r = /[&<>\"']/g, d = a / b / c;",
      "const t = `texte < 5 et ${n}`, u = html`<p>${s.replace(/`/g, '')}</p>`;",
      'el.textContent = r.test(s) ? d : t;',
    ].join('\n');
    expect(un(piege)).toEqual([]);
  });

  test('a file the reader cannot follow is reported, never silently accepted', () => {
    const erreurs = un('const s = "pas fermée;\nel.innerHTML = x;\n');
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain('could not read');
  });
});
