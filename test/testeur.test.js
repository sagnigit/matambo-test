'use strict';
// Le côté testeur parle à la vraie passerelle : clé → demande → attente → validation → liens par partie du site.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Stockage } = require('../core/stockage');
const { Passerelle } = require('../core/passerelle');
const { Testeur } = require('../core/testeur');
const { encoder } = require('../core/cle');

test('un testeur obtient ses liens après validation, et la clé fausse est refusée clairement', async () => {
  const site = http.createServer((req, res) => { res.end('site:' + req.url); });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const hote = new Passerelle({ stockage: new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'h-'))), ciblePort: site.address().port });
  const port = await hote.ecouter(0);
  const url = `http://127.0.0.1:${port}`;
  const t = new Testeur(new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 't-'))));
  try {
    const cle = hote.creerCle('Le patron');
    await assert.rejects(t.demander(encoder({ url, secret: 'z'.repeat(30), etiquette: '' }), 'Awa'), /Clé inconnue/);

    let e = await t.demander(encoder({ url, secret: cle.secret, etiquette: cle.etiquette }), 'Awa Kamga');
    assert.strictEqual(e.statut, 'attente');
    assert.strictEqual(e.liens, null);
    assert.strictEqual(hote.donnees.demandes[0].nom, 'Awa Kamga');

    e = await t.verifier();
    assert.strictEqual(e.statut, 'attente');

    hote.accepter(hote.donnees.demandes[0].id);
    e = await t.verifier();
    assert.strictEqual(e.statut, 'accepte');
    assert.ok(e.liens.length >= 8, 'une section par partie du site');
    const gestion = e.liens.find((s) => /Gestion/.test(s.titre));
    const lien = gestion.liens[0];

    // le lien « direct » ouvre le site avec le cookie ; le site répond
    const r = await fetch(lien.direct, { redirect: 'manual' });
    assert.strictEqual(r.status, 302);
    const cookie = r.headers.get('set-cookie').split(';')[0];
    const page = await fetch(url + r.headers.get('location'), { headers: { cookie } });
    assert.strictEqual(await page.text(), 'site:' + lien.chemin);

    // l'état est gardé sur disque : après un redémarrage de l'application, la personne reste connectée
    const t2 = new Testeur(t.stockage);
    assert.strictEqual(t2.etat().statut, 'accepte');
  } finally { await hote.fermer(); site.closeAllConnections?.(); site.close(); }
});

test('un testeur validé a deux boutons (client, back-office) et un QR pour son téléphone', async () => {
  const site = http.createServer((req, res) => { res.end('site:' + req.url); });
  await new Promise((r) => site.listen(0, '127.0.0.1', r));
  const hote = new Passerelle({ stockage: new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 'h-'))), ciblePort: site.address().port });
  const port = await hote.ecouter(0);
  const url = `http://127.0.0.1:${port}`;
  const t = new Testeur(new Stockage(fs.mkdtempSync(path.join(os.tmpdir(), 't-'))));
  try {
    const cle = hote.creerCle('Le patron');
    let e = await t.demander(encoder({ url, secret: cle.secret, etiquette: cle.etiquette }), 'Awa');
    assert.strictEqual(e.boutons, null);
    assert.strictEqual(e.lienTel, null);
    hote.accepter(hote.donnees.demandes[0].id);
    e = await t.verifier();
    // les deux boutons ouvrent l'accueil et le back-office, déjà autorisés
    for (const [lien, chemin] of [[e.boutons.client, '/'], [e.boutons.gestion, '/gestion/']]) {
      const r = await fetch(lien, { redirect: 'manual' });
      assert.strictEqual(r.headers.get('location'), chemin);
    }
    // le QR du testeur mène à la page téléphone de l'hôte, avec la clé du testeur
    const page = await fetch(e.lienTel);
    assert.strictEqual(page.status, 200);
    assert.match(await page.text(), /Ouvrir le back-office/);
    // ce téléphone arrive chez l'hôte, rattaché à la clé du testeur
    const r = await fetch(url + '/__matambo/demande', { method: 'POST', body: JSON.stringify({ secret: cle.secret, nom: 'Tel de Awa', type: 'telephone' }) });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(hote.nbTelephones(cle.id), 1);
  } finally { await hote.fermer(); site.closeAllConnections?.(); site.close(); }
});
