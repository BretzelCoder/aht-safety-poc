// Version de Node annoncée (spec 003, S1 et S3) : toutes les mentions doivent dire la même version majeure.
// Fonction pure : elle lit des textes (package.json, package-lock.json, README, CLAUDE.md, workflow) et rend
// la liste des endroits qui diffèrent de la version annoncée par `engines` de package.json.

const majeure = texte => {
  const m = /(\d+)/.exec(String(texte ?? ''));
  return m ? Number(m[1]) : null;
};

/** Numéro de ligne (à partir de 1) d'une position dans un texte. */
const ligneDe = (texte, position) => texte.slice(0, position).split('\n').length;

/**
 * `engines.node` de package.json donne la version annoncée. Sont comparés avec elle :
 *  - la même entrée à la racine de package-lock.json (elle répète `engines`) ;
 *  - chaque « Node.js N » ou « Node N » du README et de CLAUDE.md ;
 *  - `node-version:` du workflow, qui ne doit pas non plus utiliser de matrice.
 */
export function verifierVersionNode({ pkg, lock, readme, claude, workflow }) {
  const erreurs = [];
  const err = (fichier, ligne, message) => erreurs.push({ fichier, ligne, message });

  let annoncee = null;
  try { annoncee = majeure(JSON.parse(pkg).engines?.node); } catch { /* signalé ci-dessous */ }
  if (annoncee === null) {
    err('package.json', null, 'engines.node is missing or unreadable: the announced Node version cannot be read');
    return erreurs;
  }

  try {
    const v = majeure(JSON.parse(lock).packages?.['']?.engines?.node);
    if (v !== annoncee) err('package-lock.json', null, `the root entry says Node ${v ?? 'nothing'} but package.json announces ${annoncee}`);
  } catch {
    err('package-lock.json', null, 'unreadable: the root entry cannot be compared with package.json');
  }

  for (const [fichier, texte] of [['README.md', readme], ['CLAUDE.md', claude]]) {
    for (const m of texte.matchAll(/\bNode(?:\.js)?\s+(\d+)\b/g)) {
      if (Number(m[1]) !== annoncee) err(fichier, ligneDe(texte, m.index), `says Node ${m[1]} but package.json announces ${annoncee}`);
    }
  }

  const reVersion = /\bnode-version:\s*['"]?(\d+)/g;
  let vue = false;
  for (const m of workflow.matchAll(reVersion)) {
    vue = true;
    if (Number(m[1]) !== annoncee) err('.github/workflows/checks.yml', ligneDe(workflow, m.index), `runs Node ${m[1]} but package.json announces ${annoncee}`);
  }
  if (!vue) err('.github/workflows/checks.yml', null, `no numeric node-version: the workflow must run Node ${annoncee} explicitly`);
  const matrice = /\bmatrix\b/.exec(workflow.replace(/^\s*#.*$/gm, ''));
  if (matrice) err('.github/workflows/checks.yml', ligneDe(workflow, matrice.index), 'uses a matrix: the workflow must run one job on one Node version');

  return erreurs;
}
