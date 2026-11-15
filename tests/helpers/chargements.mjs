// Ce que la page charge depuis le disque ou le dépôt (spec 003, AC-9 et AC-16).
// Fonction pure : les adresses `file:` demandées par la page, et la liste des fichiers qu'elle a le droit de demander.

/**
 * `requetes` : les adresses demandées (seules les `file:` comptent) ; `attendus` : `index.html` plus les fichiers
 * propres de la page (chemins relatifs, dans l'ordre des balises). Rend les écarts : un fichier non prévu, un fichier
 * prévu jamais demandé, un fichier demandé plusieurs fois.
 */
export function verifierRequetes(requetes, attendus) {
  const erreurs = [];
  const err = (fichier, message) => erreurs.push({ fichier, ligne: null, message });
  const demandes = new Map(attendus.map(a => [a, 0]));
  for (const adresse of requetes.filter(u => u.startsWith('file:'))) {
    const chemin = decodeURIComponent(new URL(adresse).pathname);
    const prevu = attendus.find(a => chemin.endsWith('/' + a));
    if (!prevu) err(chemin.split('/').slice(-2).join('/'), 'was requested by the page but is not one of its own files');
    else demandes.set(prevu, demandes.get(prevu) + 1);
  }
  for (const [fichier, n] of demandes) {
    if (n === 0) err(fichier, 'is listed by the page but was never requested');
    else if (n > 1) err(fichier, `was requested ${n} times`);
  }
  return erreurs;
}
