'use strict';
// Passerelle : le seul programme que le tunnel Cloudflare expose. Elle se place devant le site Matambo.
//  - /__matambo/demande  : une personne envoie sa clé + son nom ; la demande attend la validation de l'hôte.
//  - /__matambo/statut   : la personne demande où en est sa demande (validée ? refusée ?).
//  - /__matambo/rejoindre: page pour téléphone (ouverte par un QR code) : nom, attente de validation, puis deux boutons.
//  - /__matambo/entrer   : lien de la personne validée : pose son cookie d'accès puis ouvre la page voulue.
//  - tout le reste       : transmis au site SI le cookie d'accès est valide, sinon page « accès réservé ».
// Les données (clés, demandes, accès) sont dans acces.json, sur la machine de l'hôte.
const http = require('http');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const RESERVE = '/__matambo/';
const COOKIE = 'mtb_acces';
const DUREE_ACCES_S = 7 * 24 * 3600;

const jeton = (n = 24) => crypto.randomBytes(n).toString('base64url');
const egal = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const nettoyerNom = (s) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);

function lireCookies(entete) {
  const o = {};
  String(entete || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) o[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  });
  return o;
}

function pageHtml(titre, texte) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${titre}</title>
<body style="font-family:system-ui,sans-serif;background:#0B1F3A;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:440px;padding:32px;text-align:center"><h1 style="font-size:22px">${titre}</h1><p style="color:#C8D2E3;line-height:1.5">${texte}</p></div>`;
}

// Page affichée sur le téléphone après le scan du QR code. Texte inséré seulement avec textContent (jamais en HTML).
const PAGE_TELEPHONE = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Matambo · test privé</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,sans-serif;background:#0B1F3A;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.c{width:100%;max-width:420px;background:#fff;color:#0B1F3A;border-radius:24px;padding:28px 22px;text-align:center}
.m{display:inline-flex;width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#FF9A00,#D10E12);color:#fff;font-weight:800;font-size:28px;align-items:center;justify-content:center}
h1{font-size:22px;margin:14px 0 6px}p{color:#5B6B85;line-height:1.5;margin:6px 0 16px}
input{width:100%;height:52px;border:2px solid #D9E0EC;border-radius:14px;padding:0 14px;font-size:17px;margin-bottom:12px}
.b{display:block;width:100%;min-height:56px;border:0;border-radius:14px;font-size:17px;font-weight:700;text-decoration:none;line-height:56px;margin-top:12px;background:#FF8204;color:#0B1F3A}
.b.s{background:#0B1F3A;color:#fff}.b.l{background:none;color:#5B6B85;font-size:14px;font-weight:500;min-height:40px;line-height:40px}
.e{background:#FCE7E7;color:#A01818;border-radius:12px;padding:10px 12px;margin-bottom:12px;font-size:14px}
</style><body><div class="c" id="app"></div>
<script>
(function(){
var app=document.getElementById('app');
var secret=new URLSearchParams(location.search).get('s')||'';
var M=null;try{M=JSON.parse(localStorage.getItem('mtb_tel')||'null');}catch(e){}
if(M&&M.secret!==secret)M=null;
function save(){try{if(M)localStorage.setItem('mtb_tel',JSON.stringify(M));else localStorage.removeItem('mtb_tel');}catch(e){}}
function el(t,c,x){var e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e;}
function tete(titre,texte){app.replaceChildren();app.append(el('div','m','M'),el('h1','',titre));if(texte)app.append(el('p','',texte));}
function erreur(t){var o=app.querySelector('.e');if(o)o.remove();app.insertBefore(el('div','e',t),app.children[2]||null);}
function vue(){
  if(!M){
    tete('Bienvenue','Écrivez votre nom pour demander l’accès au site de test. La personne qui partage le site devra valider votre demande.');
    var i=el('input');i.placeholder='Votre nom';i.autocomplete='name';i.maxLength=60;
    var b=el('button','b','Demander l’accès');b.type='button';
    b.onclick=function(){
      var nom=i.value.trim();if(nom.length<2){erreur('Écrivez votre nom (au moins 2 lettres).');return;}
      b.disabled=true;
      fetch('/__matambo/demande',{method:'POST',body:JSON.stringify({secret:secret,nom:nom,type:'telephone'})})
        .then(function(r){return r.json().then(function(o){return{ok:r.ok,o:o};});})
        .then(function(r){if(!r.ok){b.disabled=false;erreur(r.o.erreur||'Impossible pour le moment.');return;}
          M={secret:secret,nom:nom,id:r.o.id,attente:r.o.attente,statut:'attente',jeton:''};save();vue();})
        .catch(function(){b.disabled=false;erreur('Pas de connexion. Réessayez.');});
    };
    app.append(i,b);return;
  }
  if(M.statut==='attente'){tete('Demande envoyée','Merci '+M.nom+'. Dès que l’hôte aura validé, les boutons pour ouvrir le site apparaîtront ici. Gardez cette page ouverte.');app.append(el('p','','⏳ En attente de validation…'));return;}
  if(M.statut==='accepte'){
    tete('Bienvenue '+M.nom,'Accès validé. Que voulez-vous tester ?');
    var q=encodeURIComponent(M.jeton);
    var a=el('a','b','Ouvrir le site client');a.href='/__matambo/entrer?t='+q+'&to='+encodeURIComponent('/');
    var g=el('a','b s','Ouvrir le back-office');g.href='/__matambo/entrer?t='+q+'&to='+encodeURIComponent('/gestion/');
    app.append(a,g);
  } else {tete(M.statut==='refuse'?'Demande refusée':'Accès retiré','L’hôte n’a pas donné (ou a retiré) l’accès. Contactez-le si c’est une erreur.');}
  var x=el('button','b l','Recommencer');x.type='button';x.onclick=function(){M=null;save();vue();};app.append(x);
}
function suivre(){
  if(!M||M.statut==='refuse'||M.statut==='revoque')return;
  fetch('/__matambo/statut?id='+encodeURIComponent(M.id)+'&attente='+encodeURIComponent(M.attente))
    .then(function(r){if(r.status===404){M=null;save();vue();return null;}return r.json();})
    .then(function(o){if(!o)return;if(o.statut!==M.statut||(o.jeton||'')!==M.jeton){M.statut=o.statut;M.jeton=o.jeton||'';save();vue();}})
    .catch(function(){});
}
vue();suivre();setInterval(suivre,3000);
})();
</script></html>`;

class Passerelle extends EventEmitter {
  /**
   * @param {object} o
   * @param {import('./stockage').Stockage} o.stockage
   * @param {string} o.cibleHote  adresse du site Matambo (127.0.0.1)
   * @param {number} o.ciblePort  port du site Matambo (8000)
   */
  constructor({ stockage, cibleHote = '127.0.0.1', ciblePort = 8000, maxTelephones = () => 3 }) {
    super();
    this.maxTelephones = maxTelephones; // fonction : téléphones permis par clé (0 = sans limite)
    this.stockage = stockage;
    this.cibleHote = cibleHote;
    this.ciblePort = ciblePort;
    this.server = null;
    this.essais = new Map(); // limite de demandes par adresse IP
    this.donnees = stockage.lire('acces', { cles: [], demandes: [] });
  }

  // ---------- données ----------
  sauver() { this.stockage.ecrire('acces', this.donnees); this.emit('change'); }

  creerCle(etiquette) {
    const cle = { id: jeton(6), secret: jeton(24), etiquette: nettoyerNom(etiquette) || 'Sans nom', creeLe: Date.now(), revoquee: false };
    this.donnees.cles.push(cle);
    this.sauver();
    return cle;
  }
  revoquerCle(id) {
    const c = this.donnees.cles.find((x) => x.id === id);
    if (c) { c.revoquee = true; this.sauver(); }
  }
  decider(id, statut) {
    const d = this.donnees.demandes.find((x) => x.id === id);
    if (!d) return null;
    if (statut === 'accepte' && !d.jetonAcces) d.jetonAcces = jeton(24);
    if (statut === 'revoque' || statut === 'refuse') d.jetonAcces = null;
    d.statut = statut;
    d.decideLe = Date.now();
    this.sauver();
    return d;
  }
  // Téléphones d'une clé qui comptent dans la limite (en attente ou acceptés ; refusés et retirés libèrent leur place).
  nbTelephones(cleId) {
    return this.donnees.demandes.filter((x) => x.cleId === cleId && x.type === 'telephone' && (x.statut === 'attente' || x.statut === 'accepte')).length;
  }
  accepter(id) { return this.decider(id, 'accepte'); }
  refuser(id) { return this.decider(id, 'refuse'); }
  revoquerAcces(id) { return this.decider(id, 'revoque'); }

  accesValide(jetonAcces) {
    if (!jetonAcces) return null;
    const d = this.donnees.demandes.find((x) => x.statut === 'accepte' && x.jetonAcces && egal(x.jetonAcces, jetonAcces));
    if (!d) return null;
    const cle = this.donnees.cles.find((c) => c.id === d.cleId);
    return cle && !cle.revoquee ? d : null;
  }

  // ---------- serveur ----------
  ecouter(port, hote = '127.0.0.1') {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.traiter(req, res));
      this.server.on('error', reject);
      this.server.listen(port, hote, () => resolve(this.server.address().port));
    });
  }
  fermer() {
    return new Promise((r) => {
      if (!this.server) return r();
      this.server.closeAllConnections?.();
      this.server.close(() => r());
      this.server = null;
    });
  }

  json(res, code, o) {
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(o));
  }

  async corps(req) {
    return new Promise((resolve, reject) => {
      let t = '';
      req.on('data', (c) => { t += c; if (t.length > 4096) { reject(new Error('trop gros')); req.destroy(); } });
      req.on('end', () => { try { resolve(JSON.parse(t || '{}')); } catch (e) { reject(e); } });
      req.on('error', reject);
    });
  }

  ip(req) { return String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || ''); }

  limite(req) {
    const k = this.ip(req), maintenant = Date.now();
    const liste = (this.essais.get(k) || []).filter((t) => maintenant - t < 3600e3);
    if (liste.length >= 10) return false;
    liste.push(maintenant);
    this.essais.set(k, liste);
    return true;
  }

  async traiter(req, res) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(RESERVE)) return this.relayer(req, res);
    const action = url.pathname.slice(RESERVE.length);
    try {
      if (action === 'demande' && req.method === 'POST') return await this.actionDemande(req, res);
      if (action === 'rejoindre' && req.method === 'GET') return this.actionRejoindre(url, res);
      if (action === 'statut' && req.method === 'GET') return this.actionStatut(url, res);
      if (action === 'entrer' && req.method === 'GET') return this.actionEntrer(req, url, res);
      if (action === 'ping') return this.json(res, 200, { ok: true });
    } catch (e) {
      return this.json(res, 400, { erreur: 'Requête invalide.' });
    }
    return this.json(res, 404, { erreur: 'Introuvable.' });
  }

  async actionDemande(req, res) {
    if (!this.limite(req)) return this.json(res, 429, { erreur: 'Trop de demandes. Réessayez plus tard.' });
    const b = await this.corps(req);
    const cle = this.donnees.cles.find((c) => !c.revoquee && egal(c.secret, b.secret || ''));
    if (!cle) return this.json(res, 403, { erreur: "Clé inconnue ou retirée : demandez-en une nouvelle à la personne qui vous l'a donnée." });
    const nom = nettoyerNom(b.nom);
    if (nom.length < 2) return this.json(res, 400, { erreur: 'Écrivez votre nom (au moins 2 lettres).' });
    const type = b.type === 'telephone' ? 'telephone' : 'ordinateur';
    const max = Number(this.maxTelephones()) || 0;
    if (type === 'telephone' && max > 0 && this.nbTelephones(cle.id) >= max) {
      return this.json(res, 409, { erreur: "Limite atteinte : cette clé a déjà son nombre maximum de téléphones. Demandez à l'hôte." });
    }
    const d = { id: jeton(6), cleId: cle.id, nom, type, statut: 'attente', jetonAttente: jeton(18), jetonAcces: null, creeLe: Date.now(), ip: this.ip(req) };
    this.donnees.demandes.push(d);
    this.sauver();
    this.emit('demande', d);
    return this.json(res, 200, { id: d.id, attente: d.jetonAttente });
  }

  actionRejoindre(url, res) {
    const cle = this.donnees.cles.find((c) => !c.revoquee && egal(c.secret, url.searchParams.get('s') || ''));
    if (!cle) {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(pageHtml('Lien plus valable', 'Ce QR code n’est plus valable. Demandez-en un nouveau à la personne qui vous l’a montré.'));
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(PAGE_TELEPHONE);
  }

  actionStatut(url, res) {
    const d = this.donnees.demandes.find((x) => x.id === url.searchParams.get('id') && egal(x.jetonAttente, url.searchParams.get('attente') || ''));
    if (!d) return this.json(res, 404, { erreur: 'Demande inconnue.' });
    return this.json(res, 200, { statut: d.statut, nom: d.nom, jeton: d.statut === 'accepte' ? d.jetonAcces : null });
  }

  actionEntrer(req, url, res) {
    const d = this.accesValide(url.searchParams.get('t'));
    if (!d) {
      res.writeHead(403, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(pageHtml('Accès refusé', 'Ce lien n’est plus valable. Rouvrez l’application Matambo Test pour obtenir un lien à jour.'));
    }
    let vers = url.searchParams.get('to') || '/';
    if (!vers.startsWith('/') || vers.startsWith('//') || vers.startsWith(RESERVE) || /[\r\n]/.test(vers)) vers = '/';
    const https = String(req.headers['x-forwarded-proto'] || '').split(',')[0] === 'https';
    res.writeHead(302, {
      'set-cookie': `${COOKIE}=${d.jetonAcces}; Path=/; Max-Age=${DUREE_ACCES_S}; HttpOnly; SameSite=Lax${https ? '; Secure' : ''}`,
      location: vers,
      'cache-control': 'no-store',
    });
    res.end();
  }

  relayer(req, res) {
    const cookies = lireCookies(req.headers.cookie);
    if (!this.accesValide(cookies[COOKIE])) {
      res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return res.end(pageHtml('Accès réservé', 'Ce site est en test privé. Ouvrez l’application <b>Matambo Test</b>, saisissez la clé que l’on vous a donnée et attendez la validation.'));
    }
    const entetes = { ...req.headers };
    delete entetes.connection;
    // Le site n'a pas besoin de notre cookie d'accès.
    entetes.cookie = String(req.headers.cookie || '').split(';').map((s) => s.trim()).filter((s) => !s.startsWith(COOKIE + '=')).join('; ');
    if (!entetes.cookie) delete entetes.cookie;
    entetes['x-forwarded-proto'] = entetes['x-forwarded-proto'] || 'http';
    const p = http.request({ host: this.cibleHote, port: this.ciblePort, method: req.method, path: req.url, headers: entetes }, (pr) => {
      res.writeHead(pr.statusCode, pr.headers);
      pr.pipe(res); // en continu : les flux temps réel (SSE) passent sans attendre la fin
    });
    p.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
        res.end(pageHtml('Le site ne répond pas', 'Le site Matambo n’est pas démarré sur l’ordinateur de l’hôte. Réessayez dans un instant.'));
      } else res.destroy();
    });
    res.on('close', () => p.destroy());
    req.pipe(p);
  }
}

module.exports = { Passerelle, RESERVE, COOKIE };
