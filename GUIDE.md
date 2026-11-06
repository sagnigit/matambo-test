# Guide : utiliser Matambo Test

## 0. Une seule fois : préparer l'application

Dans ce dossier, dans une fenêtre cmd :

```
npm install
npm start          (pour l'essayer sans l'installer)
```

**Créer le programme d'installation à donner aux autres** (Windows) :

```
npm run dist
```

Le fichier `dist\Matambo Test Setup 0.1.0.exe` est l'installateur : c'est lui que vous envoyez à la personne (WhatsApp, clé USB…). Elle l'installe, rien d'autre. (`construire_setup.bat` fait la même chose en double-cliquant.)

> Windows peut afficher « application non reconnue » : l'installateur n'est pas signé. Cliquer « Informations complémentaires » puis « Exécuter quand même ».

## 1. Vous, l'hôte : partager le site

1. Ouvrez **Matambo Test**, choisissez **« Je partage le site »**.
2. Onglet **Réglages** : vérifiez que « Dossier du projet » est bien le dossier `Matambo` (celui qui contient `manage.py`). Il est détecté seul s'il est à côté de ce dossier.
3. Onglet **Partage** :
   - si c'est écrit « cloudflared est nécessaire », cliquez **Installer cloudflared** (téléchargement unique, gratuit, sans compte) ;
   - cliquez **Tout démarrer** : le site, le worker et le tunnel démarrent. Après quelques secondes, l'**adresse publique** apparaît (`https://….trycloudflare.com`).
4. Onglet **Clés** : écrivez pour qui (« Le patron ») puis **Créer une clé**. Cliquez **Copier la clé** et envoyez-la à la personne (avec l'installateur, la première fois).
5. Onglet **Demandes et accès** : quand la personne saisit sa clé et son nom, il apparaît ici (avec une notification Windows). Cliquez **Valider** (ou **Refuser**). Plus tard, **Retirer l'accès** coupe tout de suite ses pages.

Pour vous-même, ouvrez simplement http://localhost:8000 : pas de clé nécessaire.

**Adresse temporaire.** En tunnel rapide, l'adresse change chaque fois que vous redémarrez le tunnel : les anciennes clés ne marchent plus, créez-en de nouvelles. Pour une adresse fixe, voir « Adresse fixe » ci-dessous.

**Les données.** Tout ce que font les testeurs (commandes, modifications du catalogue, etc.) s'écrit dans la base du site, sur votre ordinateur. Ils ne voient jamais vos fichiers.

**Fermer.** Fermer l'application arrête le tunnel, le site et le worker.

## 2. La personne qui teste

1. Installer **Matambo Test** (l'installateur reçu), l'ouvrir, choisir **« Je teste le site »**.
2. Coller la **clé** reçue, écrire **son nom** (celui qui apparaîtra chez l'hôte), **Envoyer ma demande**.
3. Attendre : la page se met à jour toute seule dès que l'hôte valide.
4. Les liens apparaissent, classés par partie du site (boutique, compte client, gestion des commandes, catalogue, promotions, après-vente…). **Ouvrir** lance la page dans le navigateur, déjà autorisée ; **Copier** donne l'adresse à taper plus tard.
5. Pour la gestion (`/gestion/`), les comptes de démonstration sont indiqués dans chaque section (mot de passe de démonstration : `matambo-demo-2026`). Le compte `moses` demande une double vérification : préférer `paul`, `grace`, `awa` ou `sandra`.

Si l'hôte éteint son ordinateur ou son tunnel, les pages ne répondent plus : il suffit d'attendre qu'il redémarre (et, si l'adresse a changé, de lui demander une nouvelle clé).

## 2 bis. Connecter un téléphone (QR code)

Pour voir le site sur un téléphone, sans rien installer dessus :

1. **Chez vous (hôte)** : démarrez le partage, onglet **Partage**, carte « Connecter un téléphone », bouton **Afficher le QR code**. Un testeur déjà validé a le même bouton dans son application.
2. Le téléphone **scanne le QR** avec l'appareil photo. Une page s'ouvre : la personne écrit son nom et demande l'accès (par Internet, pas besoin du même wifi).
3. Vous voyez la demande dans **Demandes et accès** (avec la mention « téléphone » et la clé d'où elle vient) : **Valider** ou **Refuser**.
4. Sur le téléphone, deux boutons apparaissent : **Ouvrir le site client** (accueil) et **Ouvrir le back-office** (page de connexion de `/gestion/`).

Limite : **3 téléphones par clé** (Réglages, « Téléphones permis par clé » ; 0 = sans limite). Un téléphone refusé ou retiré libère sa place. Retirer la clé coupe aussi les téléphones qui en viennent. Le QR n'est valable que tant que l'adresse du tunnel ne change pas (tunnel rapide : à refaire à chaque démarrage).

## 3. Adresse fixe (facultatif)

Pour que les clés restent valables d'un jour à l'autre, il faut un domaine dans votre compte Cloudflare :

1. Cloudflare → Zero Trust → Networks → Tunnels → créer un tunnel **Cloudflared**, copier son **jeton**.
2. Dans le tunnel, ajouter un « Public hostname » (par exemple `test.mondomaine.com`) qui pointe vers **`http://localhost:8088`** (la passerelle, pas le site !).
3. Dans **Réglages** de Matambo Test : « Adresse fixe » = `https://test.mondomaine.com`, « Jeton » = le jeton copié. Enregistrer, puis Tout démarrer.

## 4. Dépannage

| Symptôme | Cause probable |
| --- | --- |
| « Dossier Matambo introuvable » | Réglages → Parcourir → choisir le dossier qui contient `manage.py`. |
| Le site ne démarre pas | Onglet Programmes → lire le journal du site. Souvent : dépendances absentes (`pip install -r requirements.txt` dans le dossier Matambo) ou `migrate` non fait. |
| « cloudflared est introuvable » | Onglet Partage → Installer cloudflared. |
| La personne reçoit « L'hôte est injoignable » | Tunnel arrêté, ordinateur de l'hôte éteint, ou adresse changée (nouvelle clé). |
| Page « Accès réservé » dans le navigateur | Il faut passer par un bouton **Ouvrir** de l'application (il pose l'autorisation). |
| Page « Le site ne répond pas » | Le site n'est pas démarré chez l'hôte : bouton Tout démarrer. |
| Erreur « CSRF » en se connectant à la gestion | Redémarrer le site depuis l'application (c'est elle qui donne les bons réglages d'hôte). |

## 5. Pour développeur

```
npm test                              essais automatiques (passerelle, clés, côté testeur)
python outils/extraire_parcours.py    régénère core/parcours.json depuis ../Matambo_liens_de_test.html
npm start -- --essai                  ouvre la fenêtre puis se ferme : vérifie que l'installation Electron marche
```
