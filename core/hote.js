'use strict';
// Côté hôte : assemble le site, le tunnel, la passerelle et les clés. Un seul objet que l'interface interroge.
const path = require('path');
const { EventEmitter } = require('events');
const { Passerelle } = require('./passerelle');
const { Processus } = require('./processus');
const { Tunnel } = require('./tunnel');
const { encoder, lienTelephone } = require('./cle');

const CONFIG_DEFAUT = {
  dossierMatambo: path.resolve(__dirname, '..', '..', 'Matambo'), // le dossier voisin « Matambo »
  python: 'python',
  portSite: 8000,
  portPasserelle: 8088,
  maxTelephones: 3, // téléphones permis par clé (0 = sans limite)
  rechargementAuto: false,
  fournisseurPaiement: '',
  cloudflaredPath: '',
  urlFixe: '',
  jetonTunnel: '',
};

class Hote extends EventEmitter {
  constructor({ stockage, dossierDonnees }) {
    super();
    this.stockage = stockage;
    this.cfg = stockage.lire('config', CONFIG_DEFAUT);
    const getConfig = () => this.cfg;
    this.processus = new Processus(getConfig);
    this.tunnel = new Tunnel({ getConfig, dossierDonnees });
    this.passerelle = new Passerelle({ stockage, ciblePort: this.cfg.portSite, maxTelephones: () => this.cfg.maxTelephones });
    this.ecoute = false;
    this.erreur = null;
    const notifier = () => this.emit('change');
    [this.processus, this.tunnel, this.passerelle].forEach((x) => x.on('change', notifier));
    this.processus.on('log', (src, l) => this.emit('log', src, l));
    this.tunnel.on('log', (l) => this.emit('log', 'tunnel', l));
    this.passerelle.on('demande', (d) => this.emit('demande', d));
  }

  async lancerPasserelle() {
    if (this.ecoute) return;
    this.passerelle.ciblePort = this.cfg.portSite;
    await this.passerelle.ecouter(this.cfg.portPasserelle);
    this.ecoute = true;
    this.emit('change');
  }

  async demarrerPartage() {
    await this.lancerPasserelle();
    this.tunnel.demarrer(this.cfg.portPasserelle);
  }

  // Clé réservée aux téléphones de l'hôte lui-même : créée au premier besoin.
  cleTelephoneHote() {
    const d = this.passerelle.donnees;
    return (d.cles.find((x) => !x.revoquee && x.etiquette === 'Mes téléphones') || this.passerelle.creerCle('Mes téléphones')).id;
  }

  reglages(patch) {
    const p = { ...patch };
    if (p.jetonTunnel === '********') delete p.jetonTunnel; // valeur masquée renvoyée telle quelle : on garde l'ancienne
    this.cfg = { ...this.cfg, ...p };
    this.stockage.ecrire('config', this.cfg);
    this.passerelle.ciblePort = this.cfg.portSite;
    this.emit('change');
  }

  etat() {
    const url = this.tunnel.etat.url;
    const d = this.passerelle.donnees;
    return {
      config: { ...this.cfg, jetonTunnel: this.cfg.jetonTunnel ? '********' : '' },
      programmes: this.processus.etat(),
      tunnel: { ...this.tunnel.etat, exe: !!this.tunnel.trouverExe() },
      passerelle: { ecoute: this.ecoute, port: this.cfg.portPasserelle },
      cles: d.cles.map((c) => ({
        id: c.id, etiquette: c.etiquette, creeLe: c.creeLe, revoquee: c.revoquee,
        cle: url && !c.revoquee ? encoder({ url, secret: c.secret, etiquette: c.etiquette }) : null,
        nbAcces: d.demandes.filter((x) => x.cleId === c.id && x.statut === 'accepte').length,
        nbTelephones: this.passerelle.nbTelephones(c.id),
        lienTel: url && !c.revoquee ? lienTelephone(url, c.secret) : null,
      })),
      demandes: d.demandes.map((x) => ({ id: x.id, nom: x.nom, type: x.type || 'ordinateur', statut: x.statut, creeLe: x.creeLe, decideLe: x.decideLe || null, cle: (d.cles.find((c) => c.id === x.cleId) || {}).etiquette || '' })).reverse(),
      urlSite: `http://localhost:${this.cfg.portSite}`,
      logs: { ...this.processus.logs, tunnel: this.tunnel.logs },
    };
  }

  async arreterTout() {
    this.tunnel.arreter();
    this.processus.arreterTout();
    await this.passerelle.fermer();
    this.ecoute = false;
  }
}

module.exports = { Hote, CONFIG_DEFAUT };
