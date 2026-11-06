'use strict';
// Interface de Matambo Test. Aucun texte venant d'une autre personne n'est inséré en HTML : tout passe par textContent.
const pont = window.api; // ne pas nommer cette constante « api » : contextBridge a déjà posé window.api, ce qui ferait échouer tout le script
const racine = document.getElementById('app');
const S = {
  mode: null, vue: 'partage', hote: null, testeur: null,
  saisie: { etiquette: '', cle: '', nom: '' },
  logs: { site: [], worker: [], agregateur: [], tunnel: [] },
  occupe: false, message: '',
  maj: { etat: 'repos', version: '', nouvelle: '', progres: 0, erreur: '' },
  qr: {}, // QR codes affichés : identifiant -> { lien, img }
};

function h(tag, attrs, ...enfants) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  enfants.flat().forEach((c) => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); });
  return e;
}

let minuteur;
function toast(t) {
  const el = document.getElementById('toast');
  el.textContent = t; el.classList.add('on');
  clearTimeout(minuteur); minuteur = setTimeout(() => el.classList.remove('on'), 2600);
}
async function faire(f, ok) {
  try { const r = await f(); if (ok) toast(ok); return r; }
  catch (e) { toast('⚠ ' + e.message); S.message = e.message; majVue(); return undefined; }
}
const copier = (t, m = 'Copié') => faire(() => pont.copier(t), m);
const quand = (t) => (t ? new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');

// ---------- cadre ----------
function majVue() {
  const actif = document.activeElement;
  const id = actif && actif.id, deb = actif && actif.selectionStart, fin = actif && actif.selectionEnd;
  const haut = racine.querySelector('.vue')?.scrollTop || 0;
  racine.replaceChildren(S.mode === 'hote' ? vueHote() : S.mode === 'testeur' ? vueTesteur() : vueChoix());
  const v = racine.querySelector('.vue'); if (v) v.scrollTop = haut;
  if (id) { const n = document.getElementById(id); if (n) { n.focus(); try { n.setSelectionRange(deb, fin); } catch (e) { /* pas un champ texte */ } } }
}

function champ(id, etiquette, cle, opts = {}) {
  return [h('label', { for: id }, etiquette),
    h('input', { id, type: opts.type || 'text', value: S.saisie[cle] || '', placeholder: opts.ph || '', autocomplete: 'off', spellcheck: 'false',
      oninput: (e) => { S.saisie[cle] = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter' && opts.entree) opts.entree(); } })];
}

// ---------- mises à jour de l'application (GitHub) ----------
// Bandeau en haut de la fenêtre : visible seulement quand une mise à jour se télécharge ou est prête.
function majBandeau() {
  const z = document.getElementById('maj'), m = S.maj;
  z.replaceChildren(); z.className = '';
  if (m.etat === 'telechargement') { z.className = 'on'; z.append(`Mise à jour ${m.nouvelle} en cours de téléchargement… ${m.progres}%`); }
  else if (m.etat === 'prete') {
    z.className = 'on prete';
    z.append(`La version ${m.nouvelle} est prête. `, h('button', { class: 'btn sm p', onclick: () => faire(() => pont.maj.installer()) }, 'Mettre à jour et redémarrer'));
  }
}
const texteMaj = () => ({ verification: 'Recherche…', telechargement: 'Téléchargement…', prete: 'Mise à jour prête', 'a-jour': 'Vous avez la dernière version', erreur: S.maj.erreur, indisponible: '', repos: '' }[S.maj.etat] || '');
function pied(role) {
  const m = S.maj;
  return h('div', { class: 'pied' }, role, h('br'), h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); changerRole(); } }, 'Changer de rôle'),
    h('div', { class: 'maj-pied' }, 'Version ', m.version || '…', m.etat !== 'indisponible' ? [h('br'), h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); faire(() => pont.maj.verifier()); } }, 'Vérifier les mises à jour'), texteMaj() ? h('div', { class: 'xs' }, texteMaj()) : null] : null));
}

// ---------- QR code pour connecter un téléphone ----------
// Le téléphone scanne, ouvre la page de la passerelle (par Internet) et sa demande arrive chez l'hôte, qui valide.
async function afficherQr(idQr, lien) {
  const img = await faire(() => pont.qr(lien));
  if (img) { S.qr[idQr] = { lien, img }; majVue(); }
}
function blocQr(idQr, lien, texteBouton) {
  const q = S.qr[idQr];
  if (!lien) return h('p', { class: 'sm t2' }, 'Le QR code apparaîtra dès que le tunnel est démarré (onglet Partage).');
  if (q && q.lien === lien) {
    return h('div', { class: 'qr' }, h('img', { src: q.img, alt: 'QR code à scanner avec le téléphone', width: 240, height: 240 }),
      h('p', { class: 'sm' }, 'Scannez avec l’appareil photo du téléphone. Ce QR est valable tant que le tunnel n’est pas redémarré.'),
      h('div', { class: 'ligne' }, h('button', { class: 'btn sm', onclick: () => { delete S.qr[idQr]; majVue(); } }, 'Masquer'), h('button', { class: 'btn sm', onclick: () => copier(lien, 'Lien copié') }, 'Copier le lien')));
  }
  return h('div', { class: 'ligne' }, h('button', { class: 'btn n', onclick: () => afficherQr(idQr, lien) }, texteBouton || 'Connecter un téléphone'));
}

// ---------- choix du rôle ----------
function vueChoix() {
  return h('div', { class: 'vue' }, h('div', { class: 'centre' },
    h('h1', {}, 'Matambo Test'),
    h('p', { class: 't2' }, 'Partager le site Matambo en test privé. Que voulez-vous faire sur cet ordinateur ?'),
    h('div', { class: 'choix' },
      h('button', { onclick: () => choisir('hote') }, h('b', {}, 'Je partage le site'), h('span', { class: 't2 sm' }, 'Le site tourne chez moi, je donne des clés et je valide les demandes. Toutes les données restent sur cet ordinateur.')),
      h('button', { onclick: () => choisir('testeur') }, h('b', {}, 'Je teste le site'), h('span', { class: 't2 sm' }, 'J’ai reçu une clé. Je saisis mon nom, j’attends la validation, puis j’ouvre les parties du site.')))));
}
async function choisir(m) {
  await faire(() => pont.mode.fixer(m));
  S.mode = m;
  if (m === 'hote') S.hote = await faire(() => pont.hote.etat());
  else S.testeur = await faire(() => pont.testeur.etat());
  majVue(); if (m === 'testeur') suivreTesteur();
}

// ---------- hôte ----------
const VUES = [['partage', 'Partage'], ['cles', 'Clés'], ['demandes', 'Demandes et accès'], ['programmes', 'Programmes'], ['reglages', 'Réglages']];
function vueHote() {
  const e = S.hote;
  if (!e) return h('div', { class: 'vue' }, 'Chargement…');
  const attente = e.demandes.filter((d) => d.statut === 'attente').length;
  const nav = h('nav', { class: 'nav' }, h('div', { class: 'logo' }, h('b', {}, 'M'), 'Matambo Test'),
    VUES.map(([k, t]) => h('button', { class: S.vue === k ? 'actif' : '', onclick: () => { S.vue = k; S.message = ''; majVue(); } }, t,
      k === 'demandes' && attente ? h('span', { class: 'badge' }, attente) : null)),
    pied('Rôle : hôte'));
  const corps = { partage: vuePartage, cles: vueCles, demandes: vueDemandes, programmes: vueProgrammes, reglages: vueReglages }[S.vue](e);
  return fragmentApp(nav, corps);
}
function fragmentApp(nav, corps) {
  const f = document.createDocumentFragment();
  f.append(nav, h('div', { class: 'vue' }, S.message ? h('div', { class: 'alerte err' }, S.message) : null, corps));
  return f;
}
async function changerRole() {
  await faire(() => pont.mode.fixer(''));
  S.mode = null; majVue();
}
const pastille = (etat, texte) => h('span', { class: 'pastille ' + ({ ok: 'ok', att: 'att', ko: 'ko' }[etat] || '') }, texte);

function vuePartage(e) {
  const site = e.programmes.site.actif, worker = e.programmes.worker.actif, t = e.tunnel;
  const tout = site && worker && t.etat !== 'arrete';
  return h('div', {},
    h('h1', {}, 'Partage'),
    h('p', { class: 't2' }, 'Démarrez le site et le tunnel Cloudflare, puis donnez une clé (onglet Clés). Les données restent sur cet ordinateur.'),
    h('div', { class: 'carte' }, h('div', { class: 'ligne entre' },
      h('div', {}, h('h2', {}, tout ? 'Le partage est en marche' : 'Le partage est arrêté'),
        h('div', { class: 'ligne' }, pastille(site ? 'ok' : 'ko', 'Site'), pastille(worker ? 'ok' : 'ko', 'Worker'),
          pastille(t.etat === 'actif' ? 'ok' : t.etat === 'demarrage' ? 'att' : 'ko', 'Tunnel'))),
      tout ? h('button', { class: 'btn d', onclick: () => faire(() => pont.hote.toutArreter(), 'Tout est arrêté') }, 'Tout arrêter')
        : h('button', { class: 'btn p', onclick: () => faire(() => pont.hote.toutDemarrer(), 'Démarrage…') }, 'Tout démarrer'))),
    t.erreur ? h('div', { class: 'alerte err' }, t.erreur) : null,
    !t.exe ? h('div', { class: 'carte' }, h('h2', {}, 'cloudflared est nécessaire'),
      h('p', { class: 'sm t2' }, 'C’est le petit programme gratuit de Cloudflare qui crée le tunnel. Il n’est pas encore sur cet ordinateur.'),
      h('button', { class: 'btn n', disabled: S.occupe, onclick: async () => { S.occupe = true; majVue(); await faire(() => pont.hote.telechargerCloudflared(), 'cloudflared installé'); S.occupe = false; S.hote = await pont.hote.etat(); majVue(); } },
        S.occupe ? 'Téléchargement…' : 'Installer cloudflared')) : null,
    h('div', { class: 'carte' }, h('h2', {}, 'Adresse publique'),
      t.url ? h('div', {}, h('div', { class: 'cle' }, t.url),
        h('div', { class: 'ligne' }, h('button', { class: 'btn sm', onclick: () => copier(t.url) }, 'Copier'), h('button', { class: 'btn sm', onclick: () => faire(() => pont.ouvrir(t.url)) }, 'Ouvrir'),
          h('span', { class: 'xs t2' }, e.config.urlFixe ? 'Adresse fixe : les clés restent valables.' : 'Adresse temporaire : elle change à chaque démarrage du tunnel, il faudra redonner les clés.')))
        : h('p', { class: 'sm t2' }, t.etat === 'demarrage' ? 'Le tunnel démarre…' : 'Pas d’adresse tant que le tunnel est arrêté.')),
    h('div', { class: 'carte' }, h('h2', {}, 'Connecter un téléphone'),
      h('p', { class: 'sm t2' }, 'Un QR code à scanner : le téléphone arrive chez vous par Internet, écrit son nom, et vous validez dans « Demandes et accès ». Ensuite il voit deux boutons : site client et back-office.'),
      (() => {
        const kt = e.cles.find((c) => c.etiquette === 'Mes téléphones' && !c.revoquee);
        if (kt && kt.lienTel) return blocQr('hote-' + kt.id, kt.lienTel, 'Afficher le QR code');
        if (!t.url) return h('p', { class: 'sm t2' }, 'Démarrez d’abord le partage (le tunnel donne l’adresse publique).');
        return h('div', { class: 'ligne' }, h('button', { class: 'btn n', onclick: async () => { await faire(() => pont.hote.cleTelephone()); S.hote = await pont.hote.etat(); majVue(); } }, 'Afficher le QR code'));
      })()),
    h('div', { class: 'carte' }, h('h2', {}, 'Vous-même'), h('p', { class: 'sm' }, 'Sur cet ordinateur, ouvrez directement ', h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); faire(() => pont.ouvrir(e.urlSite)); } }, e.urlSite), ' : pas besoin de clé.')));
}

function vueCles(e) {
  const creer = async () => { await faire(() => pont.hote.cleCreer(S.saisie.etiquette), 'Clé créée'); S.saisie.etiquette = ''; S.hote = await pont.hote.etat(); majVue(); };
  const t = e.tunnel;
  return h('div', {},
    h('h1', {}, 'Clés d’invitation'),
    h('p', { class: 't2' }, 'Une clé par personne ou par groupe (« Le patron », « Équipe vente »…). La clé contient l’adresse du site : la personne n’a rien d’autre à saisir que la clé et son nom.'),
    !t.url ? h('div', { class: 'alerte warn' }, 'Le tunnel n’est pas démarré : les clés s’afficheront dès que l’adresse publique existe (onglet Partage).') : null,
    h('div', { class: 'carte' }, ...champ('etiquette', 'Pour qui est cette clé ?', 'etiquette', { ph: 'Le patron', entree: creer }), h('div', { class: 'ligne' }, h('button', { class: 'btn p', onclick: creer }, 'Créer une clé'))),
    e.cles.length ? e.cles.map((c) => h('div', { class: 'carte' },
      h('div', { class: 'ligne entre' }, h('div', {}, h('h3', {}, c.etiquette), h('span', { class: 'xs t2' }, 'Créée le ', quand(c.creeLe), ' · ', c.nbAcces, ' accès validé(s)')),
        c.revoquee ? pastille('ko', 'Retirée') : h('button', { class: 'btn sm d', onclick: () => { if (confirm('Retirer cette clé ? Les personnes qui l’ont utilisée perdent aussi leur accès.')) faire(async () => { await pont.hote.cleRevoquer(c.id); }, 'Clé retirée'); } }, 'Retirer')),
      c.cle ? h('div', {}, h('div', { class: 'cle' }, c.cle), h('div', { class: 'ligne' }, h('button', { class: 'btn sm n', onclick: () => copier(c.cle, 'Clé copiée') }, 'Copier la clé'))) : null,
      !c.revoquee ? h('div', {}, h('p', { class: 'xs t2' }, 'Téléphones : ', c.nbTelephones, ' sur ', e.config.maxTelephones || '∞', ' permis.'), blocQr('cle-' + c.id, c.lienTel, 'QR code pour un téléphone')) : null))
      : h('p', { class: 't2' }, 'Aucune clé pour l’instant.'));
}

function vueDemandes(e) {
  const libelle = { attente: ['att', 'En attente'], accepte: ['ok', 'Accès donné'], refuse: ['ko', 'Refusée'], revoque: ['ko', 'Accès retiré'] };
  const bouton = (id, action, texte, cls, conf) => h('button', { class: 'btn sm ' + cls, onclick: () => { if (!conf || confirm(conf)) faire(() => pont.hote.demande(id, action)); } }, texte);
  return h('div', {},
    h('h1', {}, 'Demandes et accès'),
    h('p', { class: 't2' }, 'Quand quelqu’un saisit sa clé et son nom, il apparaît ici. Rien n’est visible pour lui tant que vous n’avez pas validé.'),
    e.demandes.length ? h('div', { class: 'carte' }, h('table', {}, h('thead', {}, h('tr', {}, ['Nom écrit', 'Clé', 'Reçue le', 'État', ''].map((x) => h('th', {}, x)))),
      h('tbody', {}, e.demandes.map((d) => h('tr', {}, h('td', {}, h('b', {}, d.nom), d.type === 'telephone' ? h('span', { class: 'etiq' }, '📱 téléphone') : null), h('td', { class: 't2' }, d.cle), h('td', { class: 'sm' }, quand(d.creeLe)),
        h('td', {}, pastille(...libelle[d.statut] || ['', d.statut])),
        h('td', { class: 'ligne' },
          d.statut === 'attente' ? [bouton(d.id, 'accepter', 'Valider', 'v'), bouton(d.id, 'refuser', 'Refuser', 'd')] : null,
          d.statut === 'accepte' ? bouton(d.id, 'revoquer', 'Retirer l’accès', 'd', 'Retirer l’accès de ' + d.nom + ' ?') : null,
          d.statut === 'refuse' || d.statut === 'revoque' ? bouton(d.id, 'accepter', 'Valider quand même', '') : null))))))
      : h('p', { class: 't2' }, 'Aucune demande pour l’instant.'));
}

function carteProgramme(e, nom) {
  const p = e.programmes[nom];
  const journal = h('div', { class: 'journal', id: 'journal-' + nom }, S.logs[nom].slice(-80).join('\n'));
  setTimeout(() => { journal.scrollTop = journal.scrollHeight; });
  return h('div', { class: 'carte' }, h('div', { class: 'ligne entre' }, h('div', { class: 'ligne' }, h('h2', {}, p.nom), pastille(p.actif ? 'ok' : 'ko', p.actif ? 'En marche' : 'Arrêté')),
    p.actif ? h('button', { class: 'btn sm d', onclick: () => faire(() => pont.hote.programme(nom, false)) }, 'Arrêter') : h('button', { class: 'btn sm n', onclick: () => faire(() => pont.hote.programme(nom, true)) }, 'Démarrer')), journal);
}
function vueProgrammes(e) {
  return h('div', {}, h('h1', {}, 'Programmes'),
    h('p', { class: 't2' }, 'Le site et le worker sont indispensables. Le faux agrégateur ne sert que pour simuler le téléphone d’un client sur cet ordinateur (il n’est pas exposé aux testeurs).'),
    ['site', 'worker', 'agregateur'].map((n) => carteProgramme(e, n)),
    h('div', { class: 'carte' }, h('h2', {}, 'Journal du tunnel'), h('div', { class: 'journal', id: 'journal-tunnel' }, S.logs.tunnel.slice(-80).join('\n'))));
}

function vueReglages(e) {
  const c = e.config;
  const v = { ...c };
  const ligne = (id, etiq, cle, opts = {}) => [h('label', { for: id }, etiq), h('input', { id, type: opts.type || 'text', value: v[cle] ?? '', placeholder: opts.ph || '', autocomplete: 'off', oninput: (ev) => { v[cle] = opts.nombre ? Number(ev.target.value) : ev.target.value; } })];
  return h('div', {}, h('h1', {}, 'Réglages'),
    h('div', { class: 'carte' }, h('h2', {}, 'Projet Matambo'),
      ...ligne('r-dossier', 'Dossier du projet (celui qui contient manage.py)', 'dossierMatambo'),
      h('div', { class: 'ligne' }, h('button', { class: 'btn sm', onclick: async () => { const d = await faire(() => pont.hote.choisirDossier()); if (d) { await pont.hote.reglages({ dossierMatambo: d }); S.hote = await pont.hote.etat(); majVue(); } } }, 'Parcourir…')),
      ...ligne('r-python', 'Python (laisser « python », ou le chemin de python.exe ; le .venv du projet est détecté seul)', 'python'),
      ...ligne('r-port', 'Port du site', 'portSite', { nombre: true, type: 'number' }),
      ...ligne('r-passerelle', 'Port de la passerelle (change après redémarrage de l’application)', 'portPasserelle', { nombre: true, type: 'number' }),
      ...ligne('r-max', 'Téléphones permis par clé (0 = sans limite)', 'maxTelephones', { nombre: true, type: 'number' }),
      ...ligne('r-paiement', 'Fournisseur de paiement (vide = celui du .env, par exemple « faux »)', 'fournisseurPaiement')),
    h('div', { class: 'carte' }, h('h2', {}, 'Tunnel Cloudflare'),
      h('p', { class: 'sm t2' }, 'Par défaut : tunnel rapide, gratuit et sans compte, avec une adresse qui change à chaque démarrage. Pour une adresse qui ne change pas, créez un tunnel dans votre compte Cloudflare et collez ici son adresse et son jeton.'),
      ...ligne('r-exe', 'Chemin de cloudflared.exe (vide = automatique)', 'cloudflaredPath'),
      ...ligne('r-fixe', 'Adresse fixe (https://test.mondomaine.com)', 'urlFixe'),
      ...ligne('r-jeton', 'Jeton du tunnel nommé', 'jetonTunnel', { type: 'password' })),
    h('div', { class: 'ligne' }, h('button', { class: 'btn p', onclick: () => faire(async () => { await pont.hote.reglages(v); S.hote = await pont.hote.etat(); majVue(); }, 'Réglages enregistrés') }, 'Enregistrer')));
}

// ---------- testeur ----------
function vueTesteur() {
  const t = S.testeur || {};
  const nav = h('nav', { class: 'nav' }, h('div', { class: 'logo' }, h('b', {}, 'M'), 'Matambo Test'),
    pied('Rôle : testeur'));
  let corps;
  if (!t.statut) corps = formulaireTesteur();
  else if (t.statut === 'attente') corps = h('div', { class: 'centre' }, h('h1', {}, 'Demande envoyée'),
    h('p', {}, 'Bonjour ', h('b', {}, t.nom), '. Votre demande est arrivée chez l’hôte. Dès qu’il l’aura validée, les liens apparaîtront ici (cette page se met à jour toute seule).'),
    pastille('att', 'En attente de validation'), h('div', { class: 'ligne' }, h('button', { class: 'btn', onclick: () => verifierTesteur(true) }, 'Vérifier maintenant'), h('button', { class: 'btn d', onclick: oublierTesteur }, 'Annuler')));
  else if (t.statut === 'accepte') corps = liensTesteur(t);
  else corps = h('div', { class: 'centre' }, h('h1', {}, t.statut === 'refuse' ? 'Demande refusée' : 'Accès retiré'),
    h('p', {}, 'L’hôte n’a pas donné (ou a retiré) l’accès. Contactez-le si c’est une erreur.'), h('button', { class: 'btn', onclick: oublierTesteur }, 'Recommencer avec une autre clé'));
  const f = document.createDocumentFragment();
  f.append(nav, h('div', { class: 'vue' }, S.message ? h('div', { class: 'alerte err' }, S.message) : null, corps));
  return f;
}
function formulaireTesteur() {
  const envoyer = async () => {
    S.message = ''; S.occupe = true; majVue();
    const r = await faire(() => pont.testeur.demander(S.saisie.cle, S.saisie.nom));
    S.occupe = false; if (r) { S.testeur = r; suivreTesteur(); } majVue();
  };
  return h('div', { class: 'centre' }, h('h1', {}, 'Entrer dans le test'),
    h('p', { class: 't2' }, 'Collez la clé que l’on vous a donnée et écrivez votre nom : il apparaîtra chez l’hôte, qui validera votre accès.'),
    h('div', { class: 'carte' }, ...champ('t-cle', 'Clé (commence par MTB1.)', 'cle', { ph: 'MTB1.…' }), ...champ('t-nom', 'Votre nom', 'nom', { ph: 'Ex. : Awa Kamga', entree: envoyer }),
      h('div', { class: 'ligne' }, h('button', { class: 'btn p', disabled: S.occupe, onclick: envoyer }, S.occupe ? 'Envoi…' : 'Envoyer ma demande'))));
}
function liensTesteur(t) {
  const b = t.boutons || {};
  return h('div', { class: 'centre' }, h('h1', {}, 'Bienvenue ', t.nom),
    h('p', { class: 't2' }, 'Accès validé. Choisissez ce que vous voulez tester : vous voyez le site comme un client, ou comme un employé dans le back-office.'),
    h('div', { class: 'carte' },
      h('button', { class: 'btn p gros', onclick: () => faire(() => pont.ouvrir(b.client)) }, 'Ouvrir le site client'),
      h('button', { class: 'btn n gros', onclick: () => faire(() => pont.ouvrir(b.gestion)) }, 'Ouvrir le back-office')),
    h('div', { class: 'carte' }, h('h2', {}, 'Tester sur mon téléphone'),
      h('p', { class: 'sm t2' }, 'Scannez ce QR avec votre téléphone : il arrive chez l’hôte, qui doit aussi valider ce téléphone.'),
      blocQr('testeur', t.lienTel, 'Afficher le QR code')),
    h('details', { class: 'carte' }, h('summary', {}, 'Avancé : tous les liens du site (', (t.liens || []).reduce((n, s) => n + s.liens.length, 0), ')'),
      h('div', { class: 'ligne' }, h('b', {}, 'Adresse du site :'), h('span', { class: 'cle' }, t.url), h('button', { class: 'btn sm', onclick: () => copier(t.url) }, 'Copier')),
      (t.liens || []).map((s) => h('div', {}, h('h3', {}, s.titre), s.note ? h('p', { class: 'xs t2' }, s.note) : null,
        s.liens.map((l) => h('div', { class: 'lien' }, h('div', { class: 'nom' }, l.libelle, h('small', {}, l.chemin)),
          h('button', { class: 'btn sm n', onclick: () => faire(() => pont.ouvrir(l.direct)) }, 'Ouvrir'),
          h('button', { class: 'btn sm', onclick: () => copier(l.simple, 'Adresse copiée') }, 'Copier')))))),
    h('div', { class: 'ligne' }, h('button', { class: 'btn d', onclick: oublierTesteur }, 'Quitter ce test')));
}
async function verifierTesteur(manuel) {
  try { S.testeur = await pont.testeur.verifier(); S.message = ''; }
  catch (e) { if (manuel) S.message = e.message; }
  majVue();
}
async function oublierTesteur() { S.testeur = await faire(() => pont.testeur.oublier()); S.saisie.cle = ''; majVue(); }
let sondage;
function suivreTesteur() {
  clearInterval(sondage);
  sondage = setInterval(() => { if (S.mode === 'testeur' && S.testeur && S.testeur.statut === 'attente') verifierTesteur(false); }, 3000);
}

// ---------- démarrage ----------
pont.maj.surEtat((m) => { S.maj = m; majBandeau(); if (S.mode) majVue(); });
(async () => { S.maj = (await faire(() => pont.maj.etat())) || S.maj; majBandeau(); })();
pont.hote.surEtat((s) => { S.hote = s; if (S.mode === 'hote' && !(document.activeElement && document.activeElement.tagName === 'INPUT')) majVue(); });
pont.hote.surLog((src, ligne) => {
  const l = S.logs[src]; if (!l) return;
  l.push(ligne); if (l.length > 300) l.shift();
  const el = document.getElementById('journal-' + src);
  if (el) { el.textContent += (el.textContent ? '\n' : '') + ligne; el.scrollTop = el.scrollHeight; }
});
(async () => {
  S.mode = (await faire(() => pont.mode.lire())) || null;
  if (S.mode === 'hote') S.hote = await faire(() => pont.hote.etat());
  if (S.mode === 'testeur') { S.testeur = await faire(() => pont.testeur.etat()); suivreTesteur(); if (S.testeur?.statut === 'attente') verifierTesteur(false); }
  majVue();
})();
