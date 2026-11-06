'use strict';
// Essai de bout en bout, sans Electron ni Cloudflare : un faux « site Matambo », la passerelle, et une personne qui demande l'accès.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Stockage } = require('../core/stockage');
const { Passerelle } = require('../core/passerelle');
const { encoder, decoder } = require('../core/cle');

const requete = (url, o = {}) => fetch(url, { redirect: 'manual', ...o });

async function monter() {
  const vu = [];
  const site = http.createServer((req, res) => {
    vu.push({ url: req.url, cookie: req.headers.cookie || '' });
    if (req.url === '/flux') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.write('data: un\n\n');
      setTimeout(() => { res.write('data: deux\n\n'); res.end(); }, 80);
      return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('site:' + req.url);
  });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'mtb-'));
  const p = new Passerelle({ stockage: new Stockage(dossier), ciblePort: site.address().port });
  const port = await p.ecouter(0);
  return { p, site, vu, base: `http://127.0.0.1:${port}`, dossier, fermer: async () => { await p.fermer(); site.closeAllConnections?.(); site.close(); } };
}

test('la clé se code et se décode', () => {
  const c = encoder({ url: 'https://abc.trycloudflare.com/', secret: 'x'.repeat(32), etiquette: 'Le patron' });
  assert.deepStrictEqual(decoder(' ' + c.slice(0, 20) + '\n' + c.slice(20)), { url: 'https://abc.trycloudflare.com', secret: 'x'.repeat(32), etiquette: 'Le patron' });
  assert.throws(() => decoder('MTB1.zzzz'));
  assert.throws(() => decoder('autre chose'));
});

test('sans accès, le site est fermé', async () => {
  const t = await monter();
  try {
    const r = await requete(t.base + '/gestion/');
    assert.strictEqual(r.status, 401);
    assert.strictEqual(t.vu.length, 0, 'le site ne doit rien recevoir');
  } finally { await t.fermer(); }
});

test('parcours complet : clé, demande, validation, lien, site, retrait', async () => {
  const t = await monter();
  try {
    const cle = t.p.creerCle('Le patron');
    // mauvaise clé
    let r = await requete(t.base + '/__matambo/demande', { method: 'POST', body: JSON.stringify({ secret: 'faux', nom: 'Awa' }) });
    assert.strictEqual(r.status, 403);
    // nom trop court
    r = await requete(t.base + '/__matambo/demande', { method: 'POST', body: JSON.stringify({ secret: cle.secret, nom: 'A' }) });
    assert.strictEqual(r.status, 400);
    // bonne demande : le nom est nettoyé
    r = await requete(t.base + '/__matambo/demande', { method: 'POST', body: JSON.stringify({ secret: cle.secret, nom: '  <b>Mme</b>   Awa ' }) });
    assert.strictEqual(r.status, 200);
    const { id, attente } = await r.json();
    assert.strictEqual(t.p.donnees.demandes[0].nom, 'bMme/b Awa');
    // en attente : pas de jeton
    let s = await (await requete(`${t.base}/__matambo/statut?id=${id}&attente=${attente}`)).json();
    assert.deepStrictEqual([s.statut, s.jeton], ['attente', null]);
    // mauvais jeton d'attente
    assert.strictEqual((await requete(`${t.base}/__matambo/statut?id=${id}&attente=nop`)).status, 404);
    // l'hôte valide
    t.p.accepter(id);
    s = await (await requete(`${t.base}/__matambo/statut?id=${id}&attente=${attente}`)).json();
    assert.strictEqual(s.statut, 'accepte');
    assert.ok(s.jeton);
    // le lien pose le cookie et redirige ; une redirection hors site est refusée
    r = await requete(`${t.base}/__matambo/entrer?t=${s.jeton}&to=/gestion/commandes/`);
    assert.strictEqual(r.status, 302);
    assert.strictEqual(r.headers.get('location'), '/gestion/commandes/');
    const cookie = r.headers.get('set-cookie').split(';')[0];
    r = await requete(`${t.base}/__matambo/entrer?t=${s.jeton}&to=//evil.example`);
    assert.strictEqual(r.headers.get('location'), '/');
    // avec le cookie : le site répond, sans voir notre cookie
    r = await requete(t.base + '/gestion/commandes/', { headers: { cookie: cookie + '; sessionid=abc' } });
    assert.strictEqual(await r.text(), 'site:/gestion/commandes/');
    assert.strictEqual(t.vu.at(-1).cookie, 'sessionid=abc');
    // le flux continu passe en entier
    r = await requete(t.base + '/flux', { headers: { cookie } });
    assert.match(await r.text(), /un[\s\S]*deux/);
    // l'hôte retire l'accès : plus rien ne passe
    t.p.revoquerAcces(id);
    assert.strictEqual((await requete(t.base + '/', { headers: { cookie } })).status, 401);
    // les données sont écrites sur le disque de l'hôte
    assert.ok(fs.existsSync(path.join(t.dossier, 'acces.json')));
  } finally { await t.fermer(); }
});

test('une clé retirée coupe aussi les accès déjà donnés', async () => {
  const t = await monter();
  try {
    const cle = t.p.creerCle('X');
    const r = await requete(t.base + '/__matambo/demande', { method: 'POST', body: JSON.stringify({ secret: cle.secret, nom: 'Paul' }) });
    const { id } = await r.json();
    const d = t.p.accepter(id);
    const cookie = `mtb_acces=${d.jetonAcces}`;
    assert.strictEqual((await requete(t.base + '/', { headers: { cookie } })).status, 200);
    t.p.revoquerCle(cle.id);
    assert.strictEqual((await requete(t.base + '/', { headers: { cookie } })).status, 401);
  } finally { await t.fermer(); }
});

test('le site arrêté donne une page claire (502)', async () => {
  const t = await monter();
  try {
    const cle = t.p.creerCle('X');
    const { id } = await (await requete(t.base + '/__matambo/demande', { method: 'POST', body: JSON.stringify({ secret: cle.secret, nom: 'Paul' }) })).json();
    const d = t.p.accepter(id);
    t.site.closeAllConnections?.(); await new Promise((r) => t.site.close(r));
    const r = await requete(t.base + '/', { headers: { cookie: `mtb_acces=${d.jetonAcces}` } });
    assert.strictEqual(r.status, 502);
  } finally { await t.p.fermer(); }
});

const demanderTel = (t, secret, nom) => requete(t.base + '/__matambo/demande', { method: 'POST', body: JSON.stringify({ secret, nom, type: 'telephone' }) });

test('téléphone : la page du QR s\'ouvre avec une bonne clé seulement', async () => {
  const t = await monter();
  try {
    const cle = t.p.creerCle('Le patron');
    let r = await requete(`${t.base}/__matambo/rejoindre?s=${encodeURIComponent(cle.secret)}`);
    assert.strictEqual(r.status, 200);
    const html = await r.text();
    assert.match(html, /Ouvrir le site client/);
    assert.match(html, /Ouvrir le back-office/);
    assert.strictEqual((await requete(`${t.base}/__matambo/rejoindre?s=faux`)).status, 403);
    t.p.revoquerCle(cle.id);
    assert.strictEqual((await requete(`${t.base}/__matambo/rejoindre?s=${encodeURIComponent(cle.secret)}`)).status, 403);
    assert.strictEqual(t.vu.length, 0, 'le site ne reçoit rien');
  } finally { await t.fermer(); }
});

test('téléphone : demande, validation par l\'hôte, puis accès au site client et au back-office', async () => {
  const t = await monter();
  try {
    const cle = t.p.creerCle('Awa');
    const r = await demanderTel(t, cle.secret, 'Moses');
    assert.strictEqual(r.status, 200);
    const { id, attente } = await r.json();
    assert.strictEqual(t.p.donnees.demandes[0].type, 'telephone');
    let s = await (await requete(`${t.base}/__matambo/statut?id=${id}&attente=${attente}`)).json();
    assert.strictEqual(s.statut, 'attente');
    t.p.accepter(id);
    s = await (await requete(`${t.base}/__matambo/statut?id=${id}&attente=${attente}`)).json();
    for (const [chemin, attendu] of [['/', '/'], ['/gestion/', '/gestion/']]) {
      const e = await requete(`${t.base}/__matambo/entrer?t=${s.jeton}&to=${encodeURIComponent(chemin)}`);
      assert.strictEqual(e.headers.get('location'), attendu);
      const page = await requete(t.base + attendu, { headers: { cookie: e.headers.get('set-cookie').split(';')[0] } });
      assert.strictEqual(await page.text(), 'site:' + attendu);
    }
  } finally { await t.fermer(); }
});

test('téléphone : 3 par clé, la 4e est refusée, un refus libère une place, 0 = sans limite', async () => {
  const t = await monter();
  try {
    const cle = t.p.creerCle('Awa');
    const ids = [];
    for (const nom of ['Un', 'Deux', 'Trois']) {
      const r = await demanderTel(t, cle.secret, nom);
      assert.strictEqual(r.status, 200);
      ids.push((await r.json()).id);
    }
    let r = await demanderTel(t, cle.secret, 'Quatre');
    assert.strictEqual(r.status, 409);
    assert.match((await r.json()).erreur, /Limite atteinte/);
    // un ordinateur n'est pas compté dans la limite des téléphones
    r = await requete(t.base + '/__matambo/demande', { method: 'POST', body: JSON.stringify({ secret: cle.secret, nom: 'Portable' }) });
    assert.strictEqual(r.status, 200);
    // un refus libère une place
    t.p.refuser(ids[0]);
    assert.strictEqual((await demanderTel(t, cle.secret, 'Quatre')).status, 200);
    // limite réglable, 0 = aucune limite
    t.p.maxTelephones = () => 0;
    assert.strictEqual((await demanderTel(t, cle.secret, 'Cinq')).status, 200);
  } finally { await t.fermer(); }
});
