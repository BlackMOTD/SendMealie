# SendMealie

Extension Web Safari pour envoyer la recette de la page courante vers une instance Mealie.

## Configuration

À la première installation, un onglet d’accueil s’ouvre automatiquement pour demander les informations de connexion. Tant qu’elles manquent, l’icône de la barre d’outils affiche une pastille « ! » et le popup s’ouvre directement sur les réglages.

1. Saisissez l’adresse de votre instance (`https://mealie.exemple.com`).
2. Cliquez sur **Se connecter à Mealie** : l’instance s’ouvre dans un onglet.
3. Identifiez-vous normalement. L’extension détecte la session, crée une clé API nommée `SendMealie`, l’enregistre et referme l’onglet.
4. Ouvrez une page de recette, puis cliquez sur **Envoyer à Mealie**.

Il n’y a pas de saisie manuelle de jeton : si la connexion automatique échoue, l’écran affiche la raison et propose **Relancer la détection**.

La création de clé s’appuie sur `POST /api/users/api-tokens`, appelé depuis la page Mealie elle-même avec la session du navigateur — aucun mot de passe ne transite par l’extension. La détection est portée par `content.js`, piloté par le stockage : elle survit au rechargement de la page comme à la mise en veille du service worker.

**Safari doit autoriser l’extension sur votre instance.** Sans cette autorisation, le script de page ne s’exécute pas et la connexion reste en attente : l’écran l’indique au bout de douze secondes. Depuis l’onglet Mealie, cliquez sur l’icône SendMealie et choisissez **Toujours autoriser sur ce site web**, puis **Relancer la détection**.

Pour rejouer ce parcours après coup, utilisez **Réinitialiser la connexion** en bas des réglages : deux clics (le second confirme), les réglages sont effacés et l’écran de bienvenue se rouvre dans un onglet.

Le pied du popup affiche l’utilisateur connecté — première lettre mise en majuscule — et le nombre de recettes de l’instance. Le compteur est un lien : il ouvre votre Mealie dans un nouvel onglet. Si l’instance ne renvoie pas de total, il affiche simplement « Ouvrir Mealie » et reste cliquable.

Après un import réussi, **Voir la recette** ouvre la recette créée (route `/g/home/r/<slug>`, groupe Mealie par défaut).

La valeur par défaut est `POST /api/recipes/create/url` avec un corps JSON `{ "url": "..." }` et un en-tête `Authorization: Bearer ...`.

## Autorisation des sites — prérequis

`host_permissions` ne suffit pas : **Safari demande une autorisation par site**, et sans elle `content.js` ne s’exécute pas du tout sur la page. Il n’y a alors ni détection de recette, ni extraction des ingrédients, ni changement d’icône — le tout sans aucune erreur visible.

Pour que l’extension serve partout, ouvrir Safari > Réglages > Extensions > SendMealie et régler l’accès aux sites web sur **Autoriser sur tous les sites web**. Une autorisation site par site fonctionne aussi, mais l’icône restera inerte sur tout site non encore autorisé — donc sur exactement les sites que l’on découvre.

Quand le script de page ne répond pas, le popup l’indique désormais explicitement au lieu d’échouer en silence.

## Détection des pages recette

`content.js` évalue chaque page au chargement et le signale au service worker, qui allume ou grise l’icône de la barre d’outils pour cet onglet.

Une page est reconnue comme recette si elle porte un bloc JSON-LD `Recipe`, un attribut microdata `schema.org/Recipe`, ou — à défaut de balisage — à la fois un titre « Ingrédients » et un titre d’étapes (« Préparation », « Instructions », « Étapes », « Réalisation »). Exiger les deux titres évite de s’activer sur un article qui cite simplement une liste d’ingrédients.

**Les deux états se distinguent par la forme : assiette pleine quand une recette est détectée, assiette vide sinon.**

**Une icône de barre d’outils doit être suffisamment saturée.** Safari décide image par image : une image jugée monochrome est rendue en « template », c’est-à-dire reteintée selon la barre d’outils — d’où un pictogramme bleu. Une image assez colorée est affichée telle quelle.

Constaté sur cette extension : l’orange `#e58325` (saturation 0,84) passe en couleur ; un gris neutre `#8a8f94` (saturation 0,03) était reteinté en bleu. L’état inactif utilise donc un **gris chaud `#bfa07a`** (saturation 0,36), assez désaturé pour lire comme « éteint », assez coloré pour échapper au traitement template.

La distinction repose malgré tout d’abord sur la **forme** — assiette pleine ou vide — qui ne peut être ni reteintée ni normalisée. La couleur vient en second signal.

L’icône par défaut du manifest est l’état atténué, ce qui donne le bon comportement même là où le script de page ne s’exécute pas.

L’icône de la liste des extensions, elle, s’affiche bien en couleur : c’est `icons` dans le manifest, pas `action.default_icon`.

**Le popup reste toujours cliquable**, y compris grisé : les réglages ne doivent jamais devenir inaccessibles. L’enregistrement fonctionne aussi sur une page non reconnue — Mealie sait importer n’importe quelle URL.

## Interface

Les deux écrans (envoi et réglages) partagent une hauteur minimale commune — 166 px, la hauteur naturelle du plus grand des deux — pour que le popup ne change pas de taille quand on passe de l’un à l’autre. Après toute modification d’un des écrans, remesurer les hauteurs naturelles et réajuster ce plancher dans `popup.css`, sinon le blanc réapparaît.

Le popup suit la typographie système (`-apple-system`) et l’apparence claire ou sombre de macOS. Les icônes sont un jeu SVG monochrome défini en sprite dans `popup.html` (`<symbol>` + `<use>`), teinté par `currentColor` : aucune police d’icônes ni emoji, donc un rendu identique quelle que soit la configuration.

Les icônes sont dessinées au trait (`fill: none` + `stroke: currentColor`). Le symbole `#i-mealie` fait exception : c’est le tracé officiel de Mealie, plein, d’où la classe `icon-solid` qui inverse `fill` et `stroke`.

La palette est déclarée en variables CSS sur `:root`, redéfinie sous `@media (prefers-color-scheme: dark)`. Pour retoucher les couleurs — dont l’accent orange — il suffit de modifier ces deux blocs en tête de `popup.css`.

## Logo

Une assiette dressée — fourchette, assiette, couteau — sur l’orange de marque Mealie `#e58325`. Même univers que le couteau-fourchette croisés de Mealie, sans le décalquer.

L’accent de l’interface reprend le même orange (`#cf7014` en clair, `#ef9440` en sombre) pour rester cohérent avec le logo et avec Mealie.

### Où vivent les fichiers

**Xcode aplatit l’arborescence à la copie.** Tout ce qui se trouve sous `Resources/`, sous-dossiers compris, atterrit à plat à la racine de `Resources/` dans le bundle compilé — il n’y a pas de dossier `icons/` dans l’app. Deux conséquences :

1. **Tout fichier référencé par `manifest.json` doit être à la racine de `Resources/`**, sans préfixe de dossier. Un chemin comme `icons/mon-icone.png` pointe dans le vide une fois compilé, et Safari affiche son icône générique sans le moindre message d’erreur.
2. **Deux fichiers de même nom dans l’arbre entrent en collision.** Avant d’ajouter un fichier, vérifier : `find . -type f -exec basename {} \; | sort | uniq -d`.

Fichiers livrés, donc à la racine :

- `icon-16.png`, `icon-32.png`, `icon-128.png` — icônes de l’extension.
- `toolbar-16.png` / `toolbar-32.png` — icône de barre d’outils, état actif (alpha plein).
- `toolbar-off-16.png` / `toolbar-off-32.png` — même dessin à 35 % d’alpha, état inactif.

Sources et dérivés :

- `icons/*.svg` — les dessins d’origine, dont `toolbar-icon.svg` et sa variante `-off`.
- `AppIcon-source/` (à la racine du projet, **hors** des ressources de l’extension) — rendus PNG de 48 à 1024 px, à glisser dans l’`AppIcon` de l’app hôte dans Xcode. Ils sont volontairement à l’extérieur : placés dans `Resources/`, ils seraient embarqués dans l’extension sans y servir.

Pour régénérer un PNG d’icône après retouche du SVG : `qlmanage -t -s <taille> -o <dossier> icons/icon-128.svg`. Pour les icônes de barre d’outils, il faut un rendu avec transparence, que `qlmanage` ne fait pas — passer par un navigateur en mode headless avec `--default-background-color=00000000`.

## Installation dans Safari

1. Ouvrez ce dossier dans Xcode avec **File > New > Project > Safari Extension App** ou utilisez l’outil de conversion Safari Web Extension.
2. Sélectionnez les fichiers de ce dossier comme source de l’extension Web.
3. Dans la cible de l’extension, autorisez les domaines Mealie et les pages `http`/`https` nécessaires.
4. Lancez l’app hôte depuis Xcode, puis activez SendMealie dans Safari > Réglages > Extensions.

Le projet contient la partie Web Extension portable. Xcode doit fournir l’app hôte macOS/iOS et la signature Apple nécessaires à Safari.
