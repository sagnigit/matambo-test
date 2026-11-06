'use strict';
// Tunnel Cloudflare (cloudflared). Deux façons :
//  - « rapide » : gratuit, sans compte, adresse https://xxxx.trycloudflare.com NOUVELLE à chaque démarrage
//    (les clés doivent alors être redonnées) ;
//  - « fixe » : un tunnel nommé créé dans votre compte Cloudflare (jeton + adresse) : l'adresse ne change plus.
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const { tuer } = require('./processus');

const URL_TELECHARGEMENT = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe';

class Tunnel extends EventEmitter {
  constructor({ getConfig, dossierDonnees }) {
    super();
    this.getConfig = getConfig;
    this.dossierBin = path.join(dossierDonnees, 'bin');
    this.enfant = null;
    this.etat = { etat: 'arrete', url: null, erreur: null };
    this.logs = [];
  }

  changer(patch) { this.etat = { ...this.etat, ...patch }; this.emit('change'); }
  log(t) { String(t).split(/\r?\n/).filter(Boolean).forEach((l) => { this.logs.push(l); if (this.logs.length > 300) this.logs.shift(); this.emit('log', l); }); }

  trouverExe() {
    const cfg = this.getConfig();
    const candidats = [cfg.cloudflaredPath, path.join(this.dossierBin, 'cloudflared.exe')].filter(Boolean);
    for (const c of candidats) if (fs.existsSync(c)) return c;
    const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['cloudflared'], { encoding: 'utf8', windowsHide: true });
    if (r.status === 0) return r.stdout.split(/\r?\n/)[0].trim();
    return null;
  }

  async telecharger() {
    fs.mkdirSync(this.dossierBin, { recursive: true });
    const cible = path.join(this.dossierBin, 'cloudflared.exe');
    this.log('Téléchargement de cloudflared depuis github.com/cloudflare/cloudflared …');
    const r = await fetch(URL_TELECHARGEMENT, { redirect: 'follow' });
    if (!r.ok) throw new Error('Téléchargement impossible (code ' + r.status + ').');
    fs.writeFileSync(cible + '.tmp', Buffer.from(await r.arrayBuffer()));
    fs.renameSync(cible + '.tmp', cible);
    this.log('cloudflared installé : ' + cible);
    this.emit('change');
    return cible;
  }

  demarrer(portPasserelle) {
    if (this.enfant) return;
    const exe = this.trouverExe();
    if (!exe) { this.changer({ etat: 'arrete', erreur: "cloudflared est introuvable : utilisez « Installer cloudflared » dans l'onglet Tunnel." }); return; }
    const cfg = this.getConfig();
    const fixe = cfg.jetonTunnel && cfg.urlFixe;
    const args = fixe
      ? ['tunnel', '--no-autoupdate', 'run', '--token', cfg.jetonTunnel]
      : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${portPasserelle}`];
    this.changer({ etat: 'demarrage', url: fixe ? cfg.urlFixe.replace(/\/+$/, '') : null, erreur: null });
    const e = spawn(exe, args, { windowsHide: true });
    this.enfant = e;
    const lire = (d) => {
      const t = String(d);
      this.log(t.replace(cfg.jetonTunnel || '\u0000', '***'));
      if (!fixe) {
        const m = t.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
        if (m && !this.etat.url) this.changer({ etat: 'actif', url: m[0] });
      } else if (/Registered tunnel connection|Connection .* registered/i.test(t) && this.etat.etat !== 'actif') {
        this.changer({ etat: 'actif' });
      }
    };
    e.stdout.on('data', lire);
    e.stderr.on('data', lire);
    e.on('error', (err) => { this.enfant = null; this.changer({ etat: 'arrete', url: null, erreur: err.message }); });
    e.on('exit', (code) => {
      if (this.enfant === e) this.enfant = null;
      this.changer({ etat: 'arrete', url: null, erreur: code ? `cloudflared s'est arrêté (code ${code}).` : null });
    });
  }

  arreter() { if (this.enfant) tuer(this.enfant); }
}

module.exports = { Tunnel };
