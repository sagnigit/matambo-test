'use strict';
// Côté testeur : saisir la clé + son nom, attendre la validation de l'hôte, puis obtenir les liens de chaque partie du site.
const path = require('path');
const { decoder, lienTelephone } = require('./cle');
const parcours = require('./parcours.json');

class Testeur {
  constructor(stockage) {
    this.stockage = stockage;
    this.s = stockage.lire('testeur', { url: '', secret: '', etiquette: '', nom: '', id: '', attente: '', statut: '', jeton: '' });
  }
  sauver() { this.stockage.ecrire('testeur', this.s); }

  async appeler(chemin, init) {
    let r;
    try { r = await fetch(this.s.url + chemin, { ...init, signal: AbortSignal.timeout(15000) }); }
    catch (e) { throw new Error("L'hôte est injoignable. Son tunnel est peut-être arrêté, ou la clé n'est plus à jour : demandez-lui de vérifier."); }
    let o = {};
    try { o = await r.json(); } catch (e) { /* page non JSON */ }
    if (!r.ok) throw new Error(o.erreur || `Réponse inattendue (${r.status}). La clé n'est peut-être plus à jour.`);
    return o;
  }

  async demander(cleTexte, nom) {
    const c = decoder(cleTexte);
    this.s = { ...this.s, url: c.url, secret: c.secret, etiquette: c.etiquette, nom: String(nom || '').trim(), id: '', attente: '', statut: '', jeton: '' };
    const o = await this.appeler('/__matambo/demande', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: c.secret, nom: this.s.nom }),
    });
    this.s.id = o.id; this.s.attente = o.attente; this.s.statut = 'attente';
    this.sauver();
    return this.etat();
  }

  async verifier() {
    if (!this.s.id) return this.etat();
    const o = await this.appeler(`/__matambo/statut?id=${encodeURIComponent(this.s.id)}&attente=${encodeURIComponent(this.s.attente)}`);
    this.s.statut = o.statut;
    this.s.jeton = o.jeton || '';
    this.sauver();
    return this.etat();
  }

  oublier() {
    this.s = { url: '', secret: '', etiquette: '', nom: '', id: '', attente: '', statut: '', jeton: '' };
    this.sauver();
    return this.etat();
  }

  etat() {
    const { url, nom, statut, jeton, etiquette, secret } = this.s;
    const e = { url, nom, statut, etiquette, liens: null, boutons: null, lienTel: null };
    if (statut === 'accepte' && jeton) {
      const vers = (chemin) => `${url}/__matambo/entrer?t=${encodeURIComponent(jeton)}&to=${encodeURIComponent(chemin)}`;
      e.boutons = { client: vers('/'), gestion: vers('/gestion/') };
      e.lienTel = lienTelephone(url, secret); // QR code : le téléphone se connecte chez l'hôte, qui valide
      e.liens = parcours.sections.map((sec) => ({
        titre: sec.titre, note: sec.note,
        liens: sec.liens.map((l) => ({
          libelle: l.libelle, chemin: l.chemin,
          direct: `${url}/__matambo/entrer?t=${encodeURIComponent(jeton)}&to=${encodeURIComponent(l.chemin)}`, // ouvre et se connecte
          simple: url + l.chemin,                                                                              // à taper une fois connecté
        })),
      }));
    }
    return e;
  }
}

module.exports = { Testeur };
