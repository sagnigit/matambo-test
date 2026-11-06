'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Seul pont entre l'interface et le programme : une liste fermée d'actions.
const appeler = async (canal, ...a) => {
  const r = await ipcRenderer.invoke(canal, ...a);
  if (!r.ok) throw new Error(r.erreur);
  return r.v;
};

contextBridge.exposeInMainWorld('api', {
  mode: { lire: () => appeler('mode:lire'), fixer: (m) => appeler('mode:fixer', m) },
  hote: {
    etat: () => appeler('hote:etat'),
    programme: (nom, marche) => appeler('hote:programme', nom, marche),
    partage: (marche) => appeler('hote:partage', marche),
    toutDemarrer: () => appeler('hote:tout-demarrer'),
    toutArreter: () => appeler('hote:tout-arreter'),
    telechargerCloudflared: () => appeler('hote:telecharger-cloudflared'),
    reglages: (p) => appeler('hote:reglages', p),
    cleCreer: (etiquette) => appeler('hote:cle-creer', etiquette),
    cleTelephone: () => appeler('hote:cle-telephone'),
    cleRevoquer: (id) => appeler('hote:cle-revoquer', id),
    demande: (id, action) => appeler('hote:demande', id, action),
    choisirDossier: () => appeler('hote:choisir-dossier'),
    surEtat: (f) => ipcRenderer.on('hote:etat', (_e, s) => f(s)),
    surLog: (f) => ipcRenderer.on('hote:log', (_e, src, l) => f(src, l)),
  },
  testeur: {
    etat: () => appeler('testeur:etat'),
    demander: (cle, nom) => appeler('testeur:demander', cle, nom),
    verifier: () => appeler('testeur:verifier'),
    oublier: () => appeler('testeur:oublier'),
  },
  maj: { etat: () => appeler('maj:etat'), verifier: () => appeler('maj:verifier'), installer: () => appeler('maj:installer'), surEtat: (f) => ipcRenderer.on('maj:etat', (_e, s) => f(s)) },
  qr: (t) => appeler('qr', t),
  ouvrir: (u) => appeler('ouvrir', u),
  copier: (t) => appeler('copier', t),
});
