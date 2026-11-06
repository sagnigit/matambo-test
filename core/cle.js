'use strict';
// Clé d'invitation : « MTB1. » + JSON en base64url { u: adresse publique de l'hôte, s: secret, e: étiquette }.
// La clé contient donc l'adresse : la personne n'a rien d'autre à saisir que la clé et son nom.
const PREFIXE = 'MTB1.';

function normaliserUrl(u) {
  return String(u || '').trim().replace(/\/+$/, '');
}

function encoder({ url, secret, etiquette }) {
  const charge = JSON.stringify({ u: normaliserUrl(url), s: secret, e: etiquette || '' });
  return PREFIXE + Buffer.from(charge, 'utf8').toString('base64url');
}

function decoder(texte) {
  const brut = String(texte || '').replace(/\s+/g, '');
  if (!brut.startsWith(PREFIXE)) throw new Error("Cette clé n'est pas valide (elle doit commencer par MTB1.).");
  let o;
  try {
    o = JSON.parse(Buffer.from(brut.slice(PREFIXE.length), 'base64url').toString('utf8'));
  } catch (e) {
    throw new Error('Clé illisible : copiez-la en entier, sans rien enlever.');
  }
  const url = normaliserUrl(o.u);
  if (!/^https?:\/\/[^\s/]+$/.test(url) || typeof o.s !== 'string' || o.s.length < 16) {
    throw new Error('Clé incomplète ou abîmée : demandez-en une nouvelle.');
  }
  return { url, secret: o.s, etiquette: String(o.e || '') };
}

// Adresse que le QR code d'un téléphone contient : la page mobile de la passerelle, avec le secret de la clé.
function lienTelephone(url, secret) {
  return normaliserUrl(url) + '/__matambo/rejoindre?s=' + encodeURIComponent(secret);
}

module.exports = { lienTelephone, encoder, decoder, normaliserUrl, PREFIXE };
