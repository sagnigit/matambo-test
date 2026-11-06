'use strict';
// Lance, surveille et arrête les programmes de Matambo sur la machine de l'hôte : le site, le worker, le faux agrégateur.
const { spawn, spawnSync } = require('child_process');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const NOMS = {
  site: 'Le site',
  worker: 'Le worker (messages, factures, paiements)',
  agregateur: 'Le faux agrégateur de paiement (facultatif)',
};

class Processus extends EventEmitter {
  constructor(getConfig) {
    super();
    this.getConfig = getConfig;
    this.enfants = {};
    this.logs = { site: [], worker: [], agregateur: [] };
  }

  pythonDe(cfg) {
    if (cfg.python && cfg.python !== 'python') return cfg.python;
    const venv = path.join(cfg.dossierMatambo, '.venv', 'Scripts', 'python.exe');
    return fs.existsSync(venv) ? venv : 'python';
  }

  commande(nom, cfg) {
    const py = this.pythonDe(cfg);
    if (nom === 'site') {
      const a = ['-m', 'uvicorn', 'config.asgi:application', '--lifespan', 'off', '--host', '127.0.0.1', '--port', String(cfg.portSite),
        '--proxy-headers', '--forwarded-allow-ips', '127.0.0.1'];
      if (cfg.rechargementAuto) a.push('--reload');
      return [py, a];
    }
    if (nom === 'worker') return [py, ['manage.py', 'db_worker']];
    if (nom === 'agregateur') return [py, [path.join('outils', 'faux_agregateur', 'serveur.py')]];
    throw new Error('Programme inconnu : ' + nom);
  }

  env(cfg) {
    // Les hôtes du tunnel sont acceptés par Django ; une adresse fixe s'ajoute si elle est réglée.
    const hotes = ['localhost', '127.0.0.1', '.trycloudflare.com'];
    const origines = ['https://*.trycloudflare.com'];
    if (cfg.urlFixe) {
      try { const u = new URL(cfg.urlFixe); hotes.push(u.hostname); origines.push(u.origin); } catch (e) { /* ignorée */ }
    }
    const e = { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1', ALLOWED_HOSTS: hotes.join(','), CSRF_TRUSTED_ORIGINS: origines.join(',') };
    if (cfg.fournisseurPaiement) e.PAIEMENT_FOURNISSEUR = cfg.fournisseurPaiement;
    return e;
  }

  etat() {
    const o = {};
    Object.keys(NOMS).forEach((n) => { o[n] = { nom: NOMS[n], actif: !!this.enfants[n], pid: this.enfants[n]?.pid || null }; });
    return o;
  }

  log(nom, texte) {
    String(texte).split(/\r?\n/).filter(Boolean).forEach((ligne) => {
      const l = this.logs[nom];
      l.push(ligne);
      if (l.length > 300) l.shift();
      this.emit('log', nom, ligne);
    });
  }

  demarrer(nom) {
    if (this.enfants[nom]) return;
    const cfg = this.getConfig();
    if (!fs.existsSync(path.join(cfg.dossierMatambo, 'manage.py'))) {
      throw new Error(`Dossier Matambo introuvable : ${cfg.dossierMatambo} (réglez-le dans « Réglages »).`);
    }
    const [exe, args] = this.commande(nom, cfg);
    const enfant = spawn(exe, args, { cwd: cfg.dossierMatambo, env: this.env(cfg), windowsHide: true });
    this.enfants[nom] = enfant;
    this.log(nom, `▶ ${exe} ${args.join(' ')}`);
    enfant.stdout.on('data', (d) => this.log(nom, d));
    enfant.stderr.on('data', (d) => this.log(nom, d));
    enfant.on('error', (e) => { this.log(nom, `✖ ${e.message}`); delete this.enfants[nom]; this.emit('change'); });
    enfant.on('exit', (code) => {
      if (this.enfants[nom] === enfant) delete this.enfants[nom];
      this.log(nom, `■ arrêté (code ${code})`);
      this.emit('change');
    });
    this.emit('change');
  }

  arreter(nom) {
    const e = this.enfants[nom];
    if (!e) return;
    tuer(e);
  }

  arreterTout() { Object.keys(this.enfants).forEach((n) => this.arreter(n)); }
}

// Sous Windows, un programme peut avoir lancé des sous-programmes (uvicorn --reload) : on arrête tout l'arbre.
function tuer(enfant) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(enfant.pid), '/T', '/F'], { windowsHide: true });
  else enfant.kill('SIGTERM');
}

module.exports = { Processus, tuer, NOMS };
