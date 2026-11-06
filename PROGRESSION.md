# Progression : Matambo Test

> Journal de ce projet. **À mettre à jour à chaque session** : cocher ce qui est fait, ajouter une ligne datée dans « Journal », garder « Reste à faire » honnête. Le but est dans `PROJET.md`.

## Où on en est (5 novembre 2026)

Le code est écrit et la logique centrale est testée. **Pas encore essayé de bout en bout avec un vrai tunnel Cloudflare ni avec deux ordinateurs.**

## Fait

- [x] Dossier du projet, voisin de `Matambo/` (`Matambo_Partage_Test/`)
- [x] `PROJET.md` (le but), `GUIDE.md` (le mode d'emploi), ce fichier
- [x] Passerelle : demande, statut, lien d'entrée, relais vers le site, flux continus (SSE) conservés, accès retirable
- [x] Clés d'invitation (création, retrait, encodage avec l'adresse publique)
- [x] Côté testeur : clé + nom, attente avec mise à jour seule, liens par partie du site
- [x] Lancement et arrêt du site, du worker et du faux agrégateur (arrêt de tout l'arbre de processus sous Windows)
- [x] Tunnel Cloudflare rapide et fixe, téléchargement de `cloudflared`
- [x] Interface Electron (hôte : Partage, Clés, Demandes, Programmes, Réglages ; testeur) et pont sécurisé
- [x] `core/parcours.json` : 10 sections, 95 liens, générés depuis `Matambo_liens_de_test.html`
- [x] Essais automatiques : 6 verts (`npm test`)
- [x] Configuration de l'installateur Windows (`npm run dist`)

## Reste à faire

- [x] `npm install` puis `npm start -- --essai` : la fenêtre s'ouvre et se ferme (ESSAI-OK, 5 nov.)
- [ ] Essai réel : Tout démarrer → adresse publique → clé → demande depuis un autre ordinateur → validation → pages
- [ ] Construire l'installateur (`npm run dist`) et l'essayer sur un autre ordinateur
- [ ] Vérifier la connexion à `/gestion/` à travers le tunnel (cookies, CSRF) et le temps réel (SSE) en conditions réelles
- [ ] Icône de l'application
- [ ] (Si utile) tunnel fixe avec un vrai domaine : tester le mode « Adresse fixe »
- [ ] (Si utile) afficher dans l'application les comptes de démonstration à côté des liens de gestion

## Décisions prises

| Date | Décision | Pourquoi |
| --- | --- | --- |
| 5 nov. | Une seule application, deux rôles (hôte / testeur) | Un seul installateur à envoyer. |
| 5 nov. | Une **passerelle** devant le site, seule exposée par le tunnel | Contrôler qui entre, sans toucher au code de Matambo. |
| 5 nov. | Tunnel **rapide** par défaut, fixe en option | Gratuit et sans compte ; l'adresse change mais c'est acceptable pour des essais. |
| 5 nov. | Clé = adresse + secret | La personne ne saisit que la clé et son nom. |
| 5 nov. | Faux agrégateur non exposé | Le fournisseur `faux` intégré suffit pour les testeurs. |
| 5 nov. | Le projet Matambo n'est pas modifié | Seules des variables d'environnement sont passées au site. |

## Journal

- **5 nov. 2026** : création du projet. Analyse des liens de test existants, écriture de la passerelle, du tunnel, des deux rôles et de l'interface. 6 essais automatiques verts (passerelle : accès fermé sans clé, parcours complet, retrait de clé, site arrêté ; côté testeur de bout en bout). Electron installé : `npm start -- --essai` ouvre la fenêtre et se ferme sans erreur (l'interface n'a pas encore été regardée à l'écran, ni testée avec un vrai tunnel).
- **5 nov. 2026 (soir)** : l'application s'ouvrait **vide**. Cause : dans `renderer/app.js`, `const api = window.api` entrait en conflit avec le `window.api` posé par `contextBridge` (SyntaxError, tout le script s'arrêtait). Constante renommée `pont`. L'essai `--essai` vérifie maintenant que la page affiche du texte et n'a aucune erreur ; il passe pour l'écran de choix, l'écran hôte et l'écran testeur.
