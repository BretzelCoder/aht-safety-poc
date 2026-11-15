// Copie téléchargée (spec 003, S5, S6, AC-8) : les fichiers que git suit pour la page, copiés dans un autre dossier,
// suffisent à faire tourner le simulateur, réseau coupé. Une copie à qui il manque un fichier suivi échoue.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { openPage, pauseAndSeed } from './helpers/page.mjs';
import { executer } from './helpers/scenario.mjs';
import { readPage } from '../scripts/read-page.mjs';

const racine = fileURLToPath(new URL('..', import.meta.url));

/** Les fichiers de la page que git suit (comme dans un téléchargement du dépôt) ; à défaut de git, ceux des balises. */
function fichiersSuivis() {
  try {
    return execFileSync('git', ['ls-files', 'index.html', 'css', 'js'], { cwd: racine }).toString().split('\n').filter(Boolean);
  } catch {
    return ['index.html', ...readPage(racine).fichiers];
  }
}

/** Copie ces fichiers dans un dossier temporaire, sauf ceux de `sauf`. */
function telecharger(sauf = []) {
  const dossier = mkdtempSync(join(tmpdir(), 'aht-copie-'));
  for (const f of fichiersSuivis()) {
    if (sauf.includes(f)) continue;
    mkdirSync(dirname(join(dossier, f)), { recursive: true });
    copyFileSync(join(racine, f), join(dossier, f));
  }
  return dossier;
}

test.describe('T-29 downloaded copy (spec 003, AC-8)', () => {
  test('the tracked files are the ones the page names: 23 own files and the entry file', () => {
    const suivis = fichiersSuivis();
    expect(suivis).toContain('index.html');
    expect(suivis.filter(f => f !== 'index.html').sort()).toEqual([...readPage(racine).fichiers].sort());
  });

  for (const lang of ['fr', 'en', 'de']) {
    test(`a copy in another folder starts without error in ${lang}, network blocked`, async ({ page }) => {
      const dossier = telecharger();
      const journal = await openPage(page, lang, { chemin: join(dossier, 'index.html') });
      await page.waitForTimeout(300);
      expect(journal.erreursPage, `page errors in ${lang}`).toEqual([]);
      const autres = journal.erreursConsole.filter(e => !journal.bloquees.includes(e.url));
      expect(autres, `console errors in ${lang} other than the blocked fonts`).toEqual([]);
      expect(await page.evaluate(() => typeof window.__sim.sim), 'the simulation runs').toBe('object');
      rmSync(dossier, { recursive: true, force: true });
    });
  }

  test('scenario A plays to its outcome from the copy: the FMS revokes the I1 token and the truck stops', async ({ page }) => {
    const dossier = telecharger();
    await openPage(page, 'fr', { chemin: join(dossier, 'index.html') });
    await pauseAndSeed(page, 1);
    const rec = await executer(page, { scenario: 'A', apresLancement: 45, pasTrace: 0.1 });
    expect(rec.lancement, 'the pickup is launched within 120 s').not.toBeNull();
    const retraits = rec.log.filter(e => e.id === 'FMS' && e.code === 'TOKEN_REVOKED');
    expect(retraits, 'the FMS revokes the I1 token once').toHaveLength(1);
    expect(retraits[0].msg.p.i).toBe('I1');
    rmSync(dossier, { recursive: true, force: true });
  });

  test('a copy that lacks one tracked file does not start, and the page names it', async ({ page }) => {
    const dossier = telecharger(['js/m2-comms-bus.js']);
    await expect(openPage(page, 'fr', { chemin: join(dossier, 'index.html') })).rejects.toThrow(/js\/m2-comms-bus\.js \(missing\)/);
    expect(await page.evaluate(() => typeof (window.__sim && window.__sim.sim)), 'the simulation never started').toBe('undefined');
    rmSync(dossier, { recursive: true, force: true });
  });
});
