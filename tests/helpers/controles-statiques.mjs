// Contrôles statiques : fonctions pures sur du texte, sans navigateur (spec 001, plan section 3).
// Chaque fonction rend la liste des erreurs trouvées ; une liste vide veut dire « conforme ».
import vm from 'node:vm';

/** Nombre de retours à la ligne avant la position donnée : sert à situer un script dans le fichier. */
function lignesAvant(texte, position) {
  let n = 0;
  for (let i = 0; i < position; i++) if (texte.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * S3 : compile chaque script en ligne (sans l'exécuter) et rend les erreurs de syntaxe,
 * avec le numéro de ligne dans le fichier HTML.
 * Les scripts chargés depuis un fichier (attribut src) et les blocs non JavaScript sont ignorés.
 */
export function verifierSyntaxe(html, fichier = 'index.html') {
  const erreurs = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attributs = m[1];
    if (/\bsrc\s*=/.test(attributs)) continue;
    const type = /\btype\s*=\s*["']?([^"'\s>]+)/i.exec(attributs);
    if (type && !/^(text|application)\/javascript$/i.test(type[1])) continue;
    const debut = m.index + m[0].indexOf('>') + 1; // début du contenu, juste après la balise ouvrante
    try {
      new vm.Script(m[2], { filename: fichier, lineOffset: lignesAvant(html, debut) });
    } catch (e) {
      const ligne = /^.*?:(\d+)\n/.exec(String(e.stack));
      erreurs.push({ fichier, ligne: ligne ? Number(ligne[1]) : null, message: e.message });
    }
  }
  return erreurs;
}
