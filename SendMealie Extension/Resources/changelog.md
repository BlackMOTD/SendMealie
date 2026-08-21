🏷️ [0.0.1]

### Ajouts

- Configuration réduite à l’adresse de l’instance : le jeton API est obtenu automatiquement.
- Enregistrement de la recette de la page courante sur Mealie depuis le bouton Safari.
- Extraction des données `Recipe` JSON-LD présentes dans les pages web.
- Icône de barre d’outils à assiette vide par défaut, assiette pleine sur les pages reconnues comme recette, avec l’infobulle « Sauvegarder la recette ? ».
- Carte du popup mise en avant et libellée « Sauvegarder la recette ? » quand une recette est détectée.
- Import du titre, de l’image, des ingrédients, des instructions et des temps de préparation.
- Conservation de l’URL originale de la recette dans Mealie.
- Repli vers l’import Mealie par URL lorsque la page ne fournit pas de JSON-LD.
- Interface popup Safari : typographie système, jeu d’icônes SVG monochromes, palette neutre à accent orange Mealie et prise en charge du thème sombre.
- Bouton **Enregistrer sur Mealie** portant l’icône officielle Mealie (Material Design Icons « silverware-fork-knife »).
- Logo SendMealie aligné sur l’identité Mealie : assiette dressée sur l’orange de marque `#e58325`, décliné en icônes 16/32/128, variante monochrome pour la barre d’outils et jeu de PNG pour l’app hôte.
- Connexion en un clic&nbsp;: Mealie s’ouvre dans un onglet, la clé API est créée et enregistrée automatiquement après identification.
- Écrans d’envoi et de réglages à hauteur constante, sans saut du popup au changement de vue.
- Popup resserré : 336 px de large, espacements et contrôles réduits.
- Compteur de recettes cliquable en pied de popup, ouvrant l’instance Mealie dans un nouvel onglet.
- Engrenage dans l’en-tête donnant accès aux réglages, remplacé dans ceux-ci par une flèche de retour et un bouton de réinitialisation.
- Pied de l’écran de réglages affichant la version, un lien GitHub et un lien Web.
- Pied de popup affichant l’utilisateur connecté (initiale en majuscule) et le nombre de recettes de l’instance.
- Fermeture automatique de la page de configuration une fois la clé enregistrée.
- Confirmation d’enregistrement portée par le bouton lui-même : il vire au vert et affiche « Recette enregistrée » avec une coche qui se trace, puis revient à son état neutre au bout de six secondes.
- Lien **Voir la recette** affiché après un import réussi.
- Page d’accueil ouverte automatiquement à l’installation pour saisir l’adresse de l’instance.
- Ouverture directe des réglages dans le popup tant que la connexion n’est pas configurée.
- Pastille « ! » sur l’icône de la barre d’outils tant que la connexion est incomplète.
- Réinitialisation en deux temps effaçant les réglages et rouvrant l’écran de bienvenue, le bouton corbeille virant au rouge pour demander confirmation.
- Révocation de la clé API sur Mealie avant l’effacement local, pour ne pas laisser de clé orpheline dans le profil.

### Correctifs

- Message explicite dans le popup lorsque Safari n’autorise pas l’extension sur la page courante : sans cette autorisation, le script de page ne s’exécute pas et la détection de recette reste muette.

- Icône de l’extension et de la barre d’outils absentes dans Safari : les chemins du manifest pointaient vers un sous-dossier `icons/`, qu’Xcode aplatit à la copie. Les fichiers référencés vivent désormais à la racine de `Resources/`.
- Icônes du manifest passées du SVG au PNG.
- Distinction actif/inactif de l’icône de barre d’outils portée par la forme — assiette pleine ou vide — doublée de la couleur : orange vif pour l’actif, gris chaud pour l’inactif. Un gris neutre était reteinté en bleu par Safari, qui rend en « template » toute icône jugée monochrome.
- Rendus PNG de l’icône d’app sortis des ressources de l’extension, où ils étaient embarqués sans servir.

- Utilisation de l’endpoint Mealie `/api/recipes/create/url` pour l’import par URL.
- Utilisation de `/api/recipes/create/html-or-json` lorsque les données structurées de la page sont disponibles.
- Migration automatique de l’ancien endpoint enregistré dans la configuration.
- Message explicite lorsque Mealie refuse le jeton (401/403).
- Connexion automatique bloquée sur « En attente… » : la détection passe désormais par le script de page déjà déclaré, au lieu d’une injection `scripting` que Safari pouvait refuser sans le signaler.
- Diagnostic affiché lorsque la page Mealie ne répond pas, avec bouton **Relancer la détection**.
- Reprise de la connexion en cours à la réouverture du popup.
- Réinitialisation annonçant « clé supprimée » sans avoir rien supprimé : `GET /api/users/self` renvoie `tokens` en `array | null`, et une liste absente était traitée comme un succès.
