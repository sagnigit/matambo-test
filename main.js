'use strict';
// Matambo Test : application Electron. Un seul programme, deux rôles choisis au démarrage :
//  - Hôte    : lance le site sur CET ordinateur, l'expose via Cloudflare, crée des clés, valide les demandes.
//  - Testeur : saisit une clé + son nom, attend la validation, ouvre les parties du site.
const { app, BrowserWindow, ipcMain, shell, clipboard, dialog, Notification } = require('electron');
const path = require('path');
const { Stockage } = require('./core/stockage');
const { Hote } = require('./core/hote');
const { Testeur } = require('./core/testeur');
const QRCode = require('qrcode');
const { Maj } = require('./core/maj');

let fenetre = null;
let hote = null;
const dossierDonnees = app.getPath('userData');
const stockage = new Stockage(dossierDonnees);
const testeur = new Testeur(stockage);
const maj = new Maj({ app, chargerUpdater: () => require('electron-updater').autoUpdater });

const envoyer = (canal, ...a) => { if (fenetre && !fenetre.isDestroyed()) fenetre.webContents.send(canal, ...a); };
const lireMode = () => stockage.lire('mode', { mode: '' }).mode;

function obtenirHote() {
  if (hote) return hote;
  hote = new Hote({ stockage, dossierDonnees });
  let attente = null;
  hote.on('change', () => { clearTimeout(attente); attente = setTimeout(() => envoyer('hote:etat', hote.etat()), 150); });
  hote.on('log', (src, ligne) => envoyer('hote:log', src, ligne));
  hote.on('demande', (d) => {
    if (Notification.isSupported()) new Notification({ title: 'Matambo Test', body: `${d.nom} demande l'accès au site.` }).show();
    if (fenetre) { fenetre.flashFrame(true); }
  });
  return hote;
}

// Ouvre seulement des adresses web (jamais un fichier ou un programme).
const ouvrirWeb = (u) => { if (/^https?:\/\//i.test(String(u))) shell.openExternal(String(u)); };

function declarerIpc() {
  const ok = (f) => async (_e, ...a) => { try { return { ok: true, v: await f(...a) }; } catch (e) { return { ok: false, erreur: e.message }; } };

  ipcMain.handle('mode:lire', ok(() => lireMode()));
  ipcMain.handle('mode:fixer', ok((m) => { stockage.ecrire('mode', { mode: m === 'hote' || m === 'testeur' ? m : '' }); return lireMode(); }));

  ipcMain.handle('hote:etat', ok(() => obtenirHote().etat()));
  ipcMain.handle('hote:programme', ok((nom, marche) => { const h = obtenirHote(); marche ? h.processus.demarrer(nom) : h.processus.arreter(nom); }));
  ipcMain.handle('hote:partage', ok(async (marche) => { const h = obtenirHote(); if (marche) await h.demarrerPartage(); else h.tunnel.arreter(); }));
  ipcMain.handle('hote:tout-demarrer', ok(async () => { const h = obtenirHote(); h.processus.demarrer('site'); h.processus.demarrer('worker'); await h.demarrerPartage(); }));
  ipcMain.handle('hote:tout-arreter', ok(async () => { const h = obtenirHote(); await h.arreterTout(); }));
  ipcMain.handle('hote:telecharger-cloudflared', ok(() => obtenirHote().tunnel.telecharger()));
  ipcMain.handle('hote:reglages', ok((p) => obtenirHote().reglages(p || {})));
  ipcMain.handle('hote:cle-creer', ok((etiquette) => obtenirHote().passerelle.creerCle(etiquette) && null));
  ipcMain.handle('hote:cle-revoquer', ok((id) => obtenirHote().passerelle.revoquerCle(id)));
  ipcMain.handle('hote:demande', ok((id, action) => {
    const p = obtenirHote().passerelle;
    if (action === 'accepter') p.accepter(id); else if (action === 'refuser') p.refuser(id); else if (action === 'revoquer') p.revoquerAcces(id);
  }));
  ipcMain.handle('hote:choisir-dossier', ok(async () => {
    const r = await dialog.showOpenDialog(fenetre, { properties: ['openDirectory'], title: 'Dossier du projet Matambo (celui qui contient manage.py)' });
    return r.canceled ? null : r.filePaths[0];
  }));

  ipcMain.handle('testeur:etat', ok(() => testeur.etat()));
  ipcMain.handle('testeur:demander', ok((cle, nom) => testeur.demander(cle, nom)));
  ipcMain.handle('testeur:verifier', ok(() => testeur.verifier()));
  ipcMain.handle('testeur:oublier', ok(() => testeur.oublier()));

  ipcMain.handle('maj:etat', ok(() => maj.etat()));
  ipcMain.handle('maj:verifier', ok(() => maj.verifier()));
  ipcMain.handle('maj:installer', ok(() => maj.installer()));

  ipcMain.handle('hote:cle-telephone', ok(() => obtenirHote().cleTelephoneHote()));
  // QR code (image) pour une adresse web : sert à connecter un téléphone.
  ipcMain.handle('qr', ok((t) => {
    if (!/^https?:\/\//i.test(String(t))) throw new Error('Adresse invalide pour le QR code.');
    return QRCode.toDataURL(String(t), { margin: 2, width: 320, errorCorrectionLevel: 'M' });
  }));

  ipcMain.handle('ouvrir', ok((u) => ouvrirWeb(u)));
  ipcMain.handle('copier', ok((t) => clipboard.writeText(String(t))));
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1100, height: 760, minWidth: 820, minHeight: 600, backgroundColor: '#0B1F3A', title: 'Matambo Test',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  fenetre.setMenuBarVisibility(false);
  fenetre.webContents.setWindowOpenHandler(({ url }) => { ouvrirWeb(url); return { action: 'deny' }; });
  fenetre.webContents.on('will-navigate', (e) => e.preventDefault());
  fenetre.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  fenetre.on('closed', () => { fenetre = null; });
}

const seul = app.requestSingleInstanceLock();
if (!seul) app.quit();
else {
  app.whenReady().then(() => {
    declarerIpc();
    creerFenetre();
    maj.on('change', (e) => envoyer('maj:etat', e));
    if (app.isPackaged && !process.argv.includes('--essai')) setTimeout(() => maj.verifier(), 4000); // vérifie au démarrage
    if (process.argv.includes('--essai')) {
      // Essai automatique : la fenêtre s'ouvre, on vérifie qu'elle affiche vraiment quelque chose et sans erreur, puis on ferme.
      const erreurs = [];
      fenetre.webContents.on('console-message', (_e, niveau, texte) => { if (niveau >= 3) erreurs.push(texte); });
      fenetre.webContents.once('did-finish-load', () => setTimeout(async () => {
        const texte = await fenetre.webContents.executeJavaScript('document.body.innerText.trim()').catch(() => '');
        const ok = texte.length > 20 && !erreurs.length;
        console.log(ok ? 'ESSAI-OK' : 'ESSAI-ECHEC', JSON.stringify({ texte: texte.slice(0, 80), erreurs }));
        app.exit(ok ? 0 : 1);
      }, 1500));
    }
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (hote) hote.arreterTout(); });
}
