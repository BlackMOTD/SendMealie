# Journal des modifications

Toutes les évolutions notables de SendMealie, version par version.
Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/), et le
projet respecte le [versionnage sémantique](https://semver.org/lang/fr/).

---

## [0.1.0] — 2026-08-21

Première version accompagnée d'une véritable application macOS, et refus des
pages qui ne contiennent pas de recette.

### Ajouts

#### Application macOS

- Application SendMealie réécrite en SwiftUI, à la place de la coquille `WKWebView` du modèle Xcode.
- Installation guidée : écran de chargement, choix de la langue, adresse de l'instance, identification sur la page de connexion Mealie officielle, puis confirmation.
- Tableau de bord sur l'instance : nombre total de recettes, recettes ajoutées dans les trente derniers jours, nombre d'étiquettes distinctes.
- Grille des trente dernières recettes avec vignettes ; un clic ouvre la recette dans Mealie.
- État de l'extension Safari affiché en permanence, avec accès direct aux réglages de Safari — une extension désactivée est la panne la plus fréquente, et elle était jusqu'ici silencieuse.
- Réglages de l'application : changement de langue, rappel de l'instance connectée, et déconnexion en deux temps qui révoque la clé sur le serveur avant d'effacer quoi que ce soit.
- Aucun mot de passe ne transite par l'application : la clé API est créée depuis la page Mealie elle-même, avec la session du navigateur, comme le fait déjà l'extension.
- Second parcours de connexion, **« Plutôt me connecter depuis Safari »** : l'application ouvre votre Mealie dans Safari, l'adresse est déjà renseignée dans le popup de l'extension, et l'application attend que la clé arrive dans le conteneur partagé. Pour qui préfère ne rien saisir dans une application. L'extension doit être activée pour ce chemin, ce que l'écran d'attente rappelle et permet de corriger sur place.

#### L'application comme unique poste de commande

- L'extension n'a plus d'écran de réglages : instance, clé, langue et déconnexion vivent uniquement dans l'application. Le popup ne fait plus qu'une chose, enregistrer la page courante.
- Le bouton en forme d'engrenage du popup ouvre l'application, par le schéma d'URL `sendmealie://` que Safari confie à LaunchServices — une extension Safari n'a aucun moyen de lancer son application autrement.
- Quand rien n'est configuré, le popup l'annonce et propose d'ouvrir l'application, au lieu de réclamer une adresse de serveur.
- La version et les liens GitHub et Web, jusqu'ici en pied du popup, ont rejoint les réglages de l'application.
- Le parcours « me connecter depuis Safari » ne demande plus de passer par le popup : l'application inscrit sa demande dans le conteneur partagé, et l'extension surveille la page Mealie d'elle-même. Il n'y a plus qu'à s'identifier.

#### Réglages partagés

- Conteneur App Group partagé entre l'application et l'extension : l'adresse, la clé et la langue se configurent indifféremment d'un côté ou de l'autre.
- Arbitrage par horodatage entre les deux copies des réglages — la dernière écriture l'emporte.
- Avertissement explicite dans l'application quand le conteneur partagé est hors d'atteinte, au lieu d'enregistrer dans le vide.

#### Langues

- Interface disponible en français et en anglais, dans l'application comme dans le popup.
- Le choix se fait dans l'un ou l'autre et s'applique aux deux ; « Système » suit la langue du Mac.

### Nettoyage

- Réglage `endpoint` supprimé : plus rien ne l'écrivait depuis que le popup a perdu ses réglages, et la valeur lue était toujours la même constante.
- État `connectSeen` et `connectError` supprimé, ainsi que le message `auto-connect-alive` qui l'alimentait : ils étaient écrits mais plus jamais lus depuis la disparition de l'écran d'attente du popup. Le message `set-language`, sans appelant, disparaît aussi.
- Le script d'arrière-plan, devenu un fourre-tout de neuf responsabilités, est coupé en deux : `bridge.js` porte les réglages partagés et le pont natif, `background.js` ce que l'extension sait faire.
- Le routeur de messages passe d'une échelle de `if` à une table, et la traduction entre le format du conteneur partagé et celui du stockage local n'est plus décrite qu'à un seul endroit.
- Les appels à Safari de l'application sont regroupés dans `SafariLink`.
- Commentaires remis d'équerre : le script d'arrière-plan n'est plus un *service worker* depuis qu'il est déclaré en `background.scripts`, et le popup n'a plus d'écran de réglages à préserver.

### Correctifs

- **Enregistrement d'une page sans recette** : l'envoi est désormais refusé avec un message explicite, au lieu de créer une fiche vide dans Mealie. Un lien **Envoyer quand même** reste disponible sous l'erreur, l'extracteur de Mealie réussissant parfois là où la lecture de la page échoue.
- Sur une page où Safari refuse l'accès à l'extension, le message reste celui de l'autorisation manquante : on n'a pas « rien trouvé », on n'a pas pu regarder.
- Mealie refusait les recettes avec `400 BAD_RECIPE_DATA` dès que la page fournissait des données structurées : le nœud `Recipe` extrait d'un `@graph` ne porte pas le `@context`, qui appartient au document englobant, et plus rien ne le rattachait à schema.org. Il est désormais réattaché.
- Un envoi refusé par l'import structuré repasse automatiquement par l'import par URL de Mealie, sauf en cas de clé refusée. Aucune recette ne devrait échouer parce que le balisage de la page a déplu à l'analyseur.
- Le script de page répondait aux demandes du popup en renvoyant un objet nu. Le contrat WebExtensions ne reconnaît une réponse que sous forme de promesse : sa réponse n'est donc **jamais** arrivée, sur aucune page, depuis la première version. Rien ne le montrait tant qu'une absence de réponse signifiait simplement « pas de données structurées », l'import par URL prenant le relais ; c'est devenu visible le jour où elle a commencé à faire refuser l'envoi.
- Le popup ne prétend plus distinguer « site non autorisé » de « onglet ouvert trop tôt » : sur Safari, `permissions.contains` reflète le manifest, pas l'autorisation réellement accordée par site, et affirmait donc du faux. Il propose le remède — demander l'autorisation puis recharger — sans nommer la cause.
- Le popup répare lui-même l'accès à un site au lieu d'expliquer où cliquer dans Safari : un bouton demande l'autorisation, et un autre recharge l'onglet quand l'autorisation existe déjà mais que la page a été ouverte avant — Safari n'injecte le script que dans les pages chargées ensuite. Les deux pannes donnaient le même silence, et une seule était mentionnée.
- Une page parfaitement valide pouvait être refusée avec « aucune recette sur cette page ». `browser.tabs.sendMessage` ne rejette pas toujours quand le script de page n'a pas tourné : Safari résout avec `undefined`, et cette absence de réponse était lue comme une absence de recette. Le message accusait la page au lieu de l'autorisation manquante. Marmiton en était un cas typique.
- Les accents des messages venant du service d'arrière-plan arrivaient mutilés dans le popup (« rien nâ€™a Ã©tÃ© envoyÃ© »). La page d'arrière-plan générée par Safari ne déclare aucun encodage et lisait `i18n.js` en Latin-1 ; le fichier porte désormais une marque d'ordre d'octets UTF-8, qui prime sur toute devinette. Par surcroît, le service ne renvoie plus de phrases mais des clés, et c'est le popup qui les traduit.
- Détection élargie : microdonnées `schema.org/Recipe`, microformat `hrecipe`, et titres d'étapes en anglais (`Directions`, `Method`, `Steps`) en plus des variantes françaises.
- L'application hôte plantait au lancement : elle chargeait une ressource `Main.html` supprimée du dépôt. Le storyboard et sa `WKWebView` ont disparu avec elle.
- L'application hôte interrogeait Safari avec un identifiant d'extension erroné (`fr.warneford.-sendmealie.SendMealie.Extension`), sans rapport avec celui du bundle. Il est maintenant dérivé de l'identifiant de l'application, ce qui reste juste après un fork.
- Le choix de la langue faisait planter l'application : `NSNull` n'est pas un objet property-list, et `UserDefaults` levait `NSInvalidArgumentException` à l'insertion des réglages. La clé absente remplace la valeur nulle, et des tests couvrent le cas.
- Hauteur commune des deux vues du popup remesurée dans WebKit après l'ajout du champ de langue, pour que le popup ne saute toujours pas d'un écran à l'autre.
- L'application restait indéfiniment sur « En attente de votre identification » alors que la session Mealie était bien ouverte : le script de récupération de la clé, recopié de l'extension vers l'app, avait perdu le repli sur `document.cookie` — là où le frontend de Mealie range son jeton. Les deux ne partagent plus qu'un seul fichier, `Shared/claim-token.js`.
- Surveillance de la connexion : délai maximal de quatre minutes, et les erreurs du script sont affichées au lieu d'être avalées silencieusement.
- Les vignettes du tableau de bord débordaient sur le titre des recettes : la hauteur de l'image était imposée *après* le rognage, si bien qu'une photo cadrée en « remplir » dépassait son cadre sans que rien ne la coupe.
- Cliquer sur « Extension Safari désactivée » n'avait aucun effet visible : le volet des réglages s'ouvrait bel et bien, mais Safari restait derrière la fenêtre de l'application. Il passe désormais au premier plan, la pastille annonce qu'elle est cliquable, et l'état est revérifié au retour dans l'application.
- Le script d'arrière-plan de l'extension était déclaré en `service_worker` et démarrait par un `importScripts()`. Si cette API n'existe pas dans le contexte où Safari exécute ce fichier, la première ligne échoue et **aucun écouteur n'est enregistré** : ni icône, ni envoi, ni synchronisation, et pas le moindre message d'erreur. Le manifest suit maintenant le gabarit d'Apple, `background.scripts`, qui ne dépend d'aucune API de worker.
- L'identifiant du conteneur App Group était résolu à l'exécution en relisant les entitlements du processus. Cela fonctionne dans l'application, mais rien ne le garantit dans l'extension — et l'échec était muet : on retombait sur un identifiant sans préfixe d'équipe, `UserDefaults` ouvrait une suite valide reliée à rien, et l'extension lisait du vide. L'identifiant est désormais écrit à la compilation dans les deux Info.plist, et un identifiant non résolu est signalé au lieu d'être confondu avec une configuration absente.
- Toute lecture des réglages partagés resynchronise d'abord : l'application et l'extension sont deux processus, et `UserDefaults` servait volontiers une copie en cache de l'un à l'autre.
- Le popup distingue maintenant « rien n'est configuré » de « je n'ai pas pu demander » : pont injoignable, conteneur inaccessible ou script d'arrière-plan muet ont chacun leur message, au lieu du même écran d'accueil trompeur.
- Chaque message natif est tracé (groupe résolu, configuration trouvée ou non, issue), consultable dans Console.app.
- La permission `nativeMessaging` est déclarée dans le manifest. Le gabarit d'Apple ne la déclare pas, mais il n'appelle jamais l'API depuis JavaScript : son silence ne prouvait rien, là où Chrome et Firefox l'exigent.
- L'exception levée par `sendNativeMessage` était avalée sans être conservée. Son motif remonte désormais jusqu'au popup — c'est la seule chose qui distingue un pont cassé d'une application jamais configurée.
- Le bouton « Ouvrir SendMealie » laissait un onglet vide derrière lui. Le nettoyage de cet onglet était programmé depuis le popup, qui se referme dans la foulée : le minuteur mourait avec lui. Il vit désormais dans le service d'arrière-plan.
- La fonction d'ouverture de l'application avait disparu du service d'arrière-plan, supprimée par mégarde avec le code de révocation qui l'entourait. Le message échouait donc systématiquement, et seul le repli par onglet s'exécutait — d'où l'onglet.
- L'application ne peut plus ouvrir qu'une seule fenêtre : la scène passe de `WindowGroup` à `Window`, et fermer cette fenêtre quitte l'application.
- Ouverture de l'application depuis l'extension : deux mécanismes natifs au lieu d'un — le schéma d'URL, puis l'ouverture directe du bundle conteneur, que l'appex sait situer deux niveaux au-dessus de lui.
- « État de l'extension inconnu » ne disait pas pourquoi. L'infobulle donne maintenant la cause réelle et le remède : Safari rattache l'extension au bundle exact qu'il a enregistré, et une application déplacée ou supprimée laisse ce lien pendant dans le vide.
- Cible de déploiement de l'extension relevée de macOS 10.14 à 14.0 : elle n'a jamais pu tourner ailleurs que dans une application qui exige 14, et ce reliquat interdisait des API disponibles.
- Le journal des modifications était embarqué dans le bundle de l'extension sans jamais y être lu ; il vit désormais à la racine du dépôt.

---

## [0.0.1] — 2026-08-21

Première version publiée.

### Ajouts

#### Envoi

- Enregistrement de la recette de la page courante sur Mealie depuis le bouton Safari.
- Extraction des données `Recipe` JSON-LD présentes dans les pages web.
- Import du titre, de l'image, des ingrédients, des instructions et des temps de préparation.
- Conservation de l'URL originale de la recette dans Mealie.
- Repli vers l'import Mealie par URL lorsque la page ne fournit pas de JSON-LD.
- Confirmation d'enregistrement portée par le bouton lui-même : il vire au vert et affiche « Recette enregistrée » avec une coche qui se trace, puis revient à son état neutre au bout de six secondes.
- Lien **Voir la recette** affiché après un import réussi.

#### Connexion

- Configuration réduite à l'adresse de l'instance : le jeton API est obtenu automatiquement.
- Connexion en un clic : Mealie s'ouvre dans un onglet, la clé API est créée et enregistrée automatiquement après identification.
- Page d'accueil ouverte automatiquement à l'installation pour saisir l'adresse de l'instance.
- Fermeture automatique de la page de configuration une fois la clé enregistrée.
- Ouverture directe des réglages dans le popup tant que la connexion n'est pas configurée.
- Réinitialisation en deux temps effaçant les réglages et rouvrant l'écran de bienvenue, le bouton corbeille virant au rouge pour demander confirmation.
- Révocation de la clé API sur Mealie avant l'effacement local, pour ne pas laisser de clé orpheline dans le profil.

#### Interface

- Icône de barre d'outils à assiette vide par défaut, assiette pleine sur les pages reconnues comme recette, avec l'infobulle « Sauvegarder la recette ? ».
- Carte du popup mise en avant et libellée « Sauvegarder la recette ? » quand une recette est détectée.
- Interface popup Safari : typographie système, jeu d'icônes SVG monochromes, palette neutre à accent orange Mealie et prise en charge du thème sombre.
- Bouton **Enregistrer sur Mealie** portant l'icône officielle Mealie (Material Design Icons « silverware-fork-knife »).
- Logo SendMealie aligné sur l'identité Mealie : assiette dressée sur l'orange de marque `#e58325`, décliné en icônes 16/32/128, variante monochrome pour la barre d'outils et jeu de PNG pour l'app hôte.
- Écrans d'envoi et de réglages à hauteur constante, sans saut du popup au changement de vue.
- Popup resserré : 336 px de large, espacements et contrôles réduits.
- Compteur de recettes cliquable en pied de popup, ouvrant l'instance Mealie dans un nouvel onglet.
- Pied de popup affichant l'utilisateur connecté (initiale en majuscule) et le nombre de recettes de l'instance.
- Engrenage dans l'en-tête donnant accès aux réglages, remplacé dans ceux-ci par une flèche de retour et un bouton de réinitialisation.
- Pied de l'écran de réglages affichant la version, un lien GitHub et un lien Web.
- Pastille « ! » sur l'icône de la barre d'outils tant que la connexion est incomplète.

### Correctifs

- Message explicite dans le popup lorsque Safari n'autorise pas l'extension sur la page courante : sans cette autorisation, le script de page ne s'exécute pas et la détection de recette reste muette.
- Icône de l'extension et de la barre d'outils absentes dans Safari : les chemins du manifest pointaient vers un sous-dossier `icons/`, qu'Xcode aplatit à la copie. Les fichiers référencés vivent désormais à la racine de `Resources/`.
- Icônes du manifest passées du SVG au PNG.
- Distinction actif/inactif de l'icône de barre d'outils portée par la forme — assiette pleine ou vide — doublée de la couleur : orange vif pour l'actif, gris chaud pour l'inactif. Un gris neutre était reteinté en bleu par Safari, qui rend en « template » toute icône jugée monochrome.
- Rendus PNG de l'icône d'app sortis des ressources de l'extension, où ils étaient embarqués sans servir.
- Utilisation de l'endpoint Mealie `/api/recipes/create/url` pour l'import par URL.
- Utilisation de `/api/recipes/create/html-or-json` lorsque les données structurées de la page sont disponibles.
- Migration automatique de l'ancien endpoint enregistré dans la configuration.
- Message explicite lorsque Mealie refuse le jeton (401/403).
- Connexion automatique bloquée sur « En attente… » : la détection passe désormais par le script de page déjà déclaré, au lieu d'une injection `scripting` que Safari pouvait refuser sans le signaler.
- Diagnostic affiché lorsque la page Mealie ne répond pas, avec bouton **Relancer la détection**.
- Reprise de la connexion en cours à la réouverture du popup.
- Réinitialisation annonçant « clé supprimée » sans avoir rien supprimé : `GET /api/users/self` renvoie `tokens` en `array | null`, et une liste absente était traitée comme un succès.

---

[0.1.0]: https://github.com/BlackMOTD/SendMealie/releases/tag/v0.1.0
[0.0.1]: https://github.com/BlackMOTD/SendMealie/releases/tag/v0.0.1
