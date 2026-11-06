'use strict';
// Mises à jour de l'application par GitHub Releases (electron-updater).
// États : repos | verification | telechargement | prete | a-jour | erreur | indisponible (application non installée)
const { EventEmitter } = require('events');

class Maj extends EventEmitter {
  constructor({ app, chargerUpdater }) {
    super();
    this.app = app;
    this.s = { etat: 'repos', version: app.getVersion(), nouvelle: '', progres: 0, erreur: '' };
    this.updater = null;
    if (!app.isPackaged) { this.s.etat = 'indisponible'; return; } // en développement : pas de mise à jour
    try {
      this.updater = chargerUpdater();
      this.updater.autoDownload = true;
      this.updater.autoInstallOnAppQuit = true;
      this.updater.on('checking-for-update', () => this.maj({ etat: 'verification', erreur: '' }));
      this.updater.on('update-available', (i) => this.maj({ etat: 'telechargement', nouvelle: i.version, progres: 0 }));
      this.updater.on('update-not-available', () => this.maj({ etat: 'a-jour' }));
      this.updater.on('download-progress', (p) => this.maj({ etat: 'telechargement', progres: Math.round(p.percent || 0) }));
      this.updater.on('update-downloaded', (i) => this.maj({ etat: 'prete', nouvelle: i.version, progres: 100 }));
      this.updater.on('error', (e) => this.maj({ etat: 'erreur', erreur: 'Impossible de vérifier les mises à jour (' + String((e && e.message) || e).split('\n')[0].slice(0, 140) + ').' }));
    } catch (e) { this.s.etat = 'indisponible'; }
  }
  maj(p) { this.s = { ...this.s, ...p }; this.emit('change', this.etat()); }
  etat() { return { ...this.s }; }
  verifier() {
    if (!this.updater) return this.etat();
    if (['verification', 'telechargement', 'prete'].includes(this.s.etat)) return this.etat();
    this.updater.checkForUpdates().catch(() => {}); // l'événement « error » renseigne l'état
    return this.etat();
  }
  installer() { if (this.updater && this.s.etat === 'prete') this.updater.quitAndInstall(false, true); }
}

module.exports = { Maj };
