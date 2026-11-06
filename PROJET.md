# Matambo Test : partager le site en test privé

> Ce fichier explique **ce que l'on construit et pourquoi**. L'avancement est dans `PROGRESSION.md`, le mode d'emploi dans `GUIDE.md`.
> **À tenir à jour** : si le but, l'architecture ou une décision change, modifier ce fichier dans la même session.

## Le besoin

Le site Matambo (dossier voisin `../Matambo`, Django) tourne sur l'ordinateur de développement. On veut le **montrer au patron et à d'autres personnes** sans le mettre en ligne :

- le site et **toutes les données** (commandes, produits, comptes de démonstration…) restent **sur l'ordinateur de l'hôte** ; chaque manipulation des testeurs s'y enregistre ;
- l'hôte l'expose par **un tunnel Cloudflare** (`cloudflared`), sans ouvrir de port ni acheter d'hébergement ;
- l'hôte donne une **clé** à chaque personne ; la personne ouvre l'application **Matambo Test**, colle la clé et écrit **son nom** ;
- la demande arrive chez l'hôte avec ce nom ; l'hôte **valide** (ou refuse) ;
- une fois validée, la personne voit dans l'application **les liens de chaque partie du site** (boutique, gestion, catalogue, commandes, etc.) et les ouvre dans son navigateur.
- **Téléphone par QR code** (6 nov.) : l'hôte **et** chaque testeur peuvent afficher un QR code. Le téléphone qui le scanne arrive **chez l'hôte** par Internet (page `/__matambo/rejoindre`), écrit son nom, l'hôte valide, puis le téléphone voit **deux boutons** : « Ouvrir le site client » (accueil) et « Ouvrir le back-office » (`/gestion/`). Les téléphones d'un testeur sont rattachés à sa clé ; **3 téléphones par clé** au maximum (réglable, 0 = sans limite).
- Dans l'application d'un testeur validé, les ~95 liens sont rangés dans « Avancé » ; il voit d'abord les deux mêmes boutons.

## Ce que l'on construit

Une seule application **Electron** (Windows), avec deux rôles choisis au premier lancement :

| Rôle | Ce qu'il fait |
| --- | --- |
| **Hôte** | Démarre le site, le worker et le faux agrégateur ; démarre le tunnel ; crée et retire des clés ; valide, refuse ou retire des accès ; voit les journaux. |
| **Testeur** | Colle la clé, écrit son nom, attend la validation, ouvre les ~95 liens de test classés par partie du site. |

Le projet Matambo lui-même **n'est pas modifié** : l'application le lance comme on le lance à la main (`uvicorn`, `db_worker`) et lui passe seulement des variables d'environnement (`ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS`).

## Comment ça marche (architecture)

```
Testeur (navigateur)            Cloudflare                Ordinateur de l'hôte
        │  https://xxxx.trycloudflare.com  │                        │
        └────────────────────────────────► │ ───────────────►  cloudflared
                                                                    │
                                                          Passerelle (port 8088)
                                                  ┌─────────────────┴──────────────────┐
                                       /__matambo/*  (demande, statut, entrer)      tout le reste
                                       clés, demandes, accès                 cookie valide ? ──► Site Matambo (port 8000)
                                       (acces.json, chez l'hôte)                       sinon 401 « Accès réservé »
```

- **La passerelle** (`core/passerelle.js`) est la **seule chose exposée** par le tunnel. Sans accès validé, le site Matambo ne reçoit rien.
- **La clé** (`core/cle.js`) = `MTB1.` + {adresse publique, secret, étiquette} en base64. Elle contient l'adresse : la personne ne saisit que clé + nom.
- **L'accès** : après validation, l'application du testeur reçoit un jeton ; les liens « Ouvrir » (`/__matambo/entrer?t=…&to=/chemin`) posent un cookie `mtb_acces` (7 jours) et redirigent vers la page. Le site ne voit jamais ce cookie.
- **Retrait** : retirer l'accès d'une personne, ou retirer sa clé, coupe immédiatement ses pages (à la requête suivante).
- **Protection** : 10 demandes par heure et par adresse, comparaison des secrets à temps constant, noms nettoyés, aucune insertion HTML de texte étranger dans l'interface, adresses de redirection limitées au site, interface sans accès Node (`contextIsolation`, CSP stricte).

## Tunnel : deux modes

| Mode | Réglage | Adresse | Clés |
| --- | --- | --- | --- |
| **Rapide** (par défaut) | rien | `https://xxxx.trycloudflare.com`, **change à chaque démarrage** | à redonner à chaque fois |
| **Fixe** | adresse + jeton d'un tunnel nommé (compte Cloudflare, domaine) | stable | restent valables |

## Les liens de chaque partie

`core/parcours.json` est généré depuis `../Matambo_liens_de_test.html` par `outils/extraire_parcours.py` (10 sections, 95 liens : boutique, compte client, pages d'information, gestion des commandes, du catalogue, des promotions, de l'après-vente…). Si le site gagne des pages, relancer ce script.

## Hors périmètre (volontairement)

- Pas d'hébergement permanent : c'est un **outil de test privé**, éteint quand l'hôte ferme l'application.
- Le **faux agrégateur** (port 9000) n'est pas exposé : les paiements des testeurs passent par le fournisseur `faux` intégré au site.
- Pas de comptes ni de mots de passe propres à l'application : la clé validée tient lieu d'accès. Les comptes de démonstration de Matambo (moses, paul, grace…) restent ceux du site.
- Pas de mise à jour automatique de l'application.

## Fichiers

```
Matambo_Partage_Test/
  main.js, preload.js        application Electron (fenêtre, actions autorisées)
  renderer/                  interface (index.html, style.css, app.js)
  core/                      logique, testable sans Electron
    passerelle.js            portail devant le site, clés, demandes, accès
    cle.js                   code / décode les clés
    processus.js             lance site, worker, faux agrégateur
    tunnel.js                lance et surveille cloudflared
    hote.js, testeur.js      les deux rôles
    stockage.js              fichiers JSON (config, acces, testeur, mode)
    parcours.json            les liens par partie du site
  test/                      essais automatiques (npm test)
  outils/extraire_parcours.py
  PROJET.md, PROGRESSION.md, GUIDE.md
```

Les données de l'application sont dans le dossier utilisateur d'Electron (`%APPDATA%\matambo-test-prive`) : `acces.json` (clés, demandes, accès), `config.json`, `testeur.json`, `mode.json`, `bin\cloudflared.exe`.
