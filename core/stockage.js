'use strict';
// Stockage JSON très simple (un fichier par sujet), écriture atomique : on écrit un fichier temporaire puis on le renomme.
const fs = require('fs');
const path = require('path');

class Stockage {
  constructor(dossier) {
    this.dossier = dossier;
    fs.mkdirSync(dossier, { recursive: true });
  }
  chemin(nom) { return path.join(this.dossier, nom + '.json'); }
  lire(nom, defaut) {
    try {
      return { ...defaut, ...JSON.parse(fs.readFileSync(this.chemin(nom), 'utf8')) };
    } catch (e) {
      return JSON.parse(JSON.stringify(defaut));
    }
  }
  ecrire(nom, valeur) {
    const cible = this.chemin(nom);
    const tmp = cible + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(valeur, null, 2), 'utf8');
    fs.renameSync(tmp, cible);
  }
}

module.exports = { Stockage };
