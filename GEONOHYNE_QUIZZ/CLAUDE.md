# CLAUDE.md — GéoNohyne Quizz

Spécialités de ce jeu. Les règles communes (indépendance, `COMMUN/` facultatif, versions, commits…) sont
dans le `CLAUDE.md` de la racine ; la documentation complète pour un humain est dans `README.md`.

## Carte d'identité

- Géographie : départements et préfectures, fleuves, pays, mers du monde (quiz, jeux, mode Apprendre).
- id `geonohyne` (ancien nom **GéoQuiz**, ancien id `geoquiz` : repris tout seul, ne pas casser cette
  reprise). Version dans `README.md` et dans `../COMMUN/jeux.js` (affichée en bas du menu).
- Thème « Atlas en relief » : sombre, bleu-vert ; corail = action, menthe = trouvé, sable = temps et records.
- **Identifiants et commentaires en français.** Espaces de noms globaux : `GeoNohyne` (noyau), `GeoCarte`
  (moteur et registre des cartes), `GeoInfos` (fiches des zones, `data/*/infos-*.js`), `GeoProfils`
  (statistiques, `js/profils.js`).
- **C'est le jeu modèle** : sa façon de faire (menu atlas, écran de choix, ciblage / nommage, mode record,
  modules qui s'enregistrent, cartes grisées) sert de référence aux autres jeux.

## Où est quoi

| Fichier | Rôle |
|---|---|
| `js/core.js` | **le noyau** (~100 Ko) : enregistrement des modules, écran de choix, quiz, mode Apprendre, carte SVG interactive, correction des saisies. **Lis d'abord son en-tête** : il décrit tous les contrats. |
| `js/carte.js` | moteur de cartes (GeoJSON → SVG), sans aucune donnée |
| `js/grand-chemin.js` | moteur des deux « Grand Chemin » (`GeoNohyne.grandChemin(config)` : contrat en tête) ; versions dans `js/france/grand-chemin.js` et `js/monde/grand-chemin-monde.js` |
| `js/globe.js` | géométrie du globe (`GeoCarte.globe` : projection orthographique, découpage à l'horizon), sans donnée ni DOM |
| `js/menu.js` | **le catalogue du menu** (`MENU` : chapitres et cartes, `ICONES`, `TEINTES`, `IMAGES`) ; chargé en dernier |
| `js/profils.js` / `js/compte.js` | statistiques (invité ou compte) / bouton et menu du compte, écran des statistiques |
| `js/ancien-nom.js` | reprise des clés `geoquiz.*` → `geonohyne.*`, chargé en premier (dans `<head>`) |
| `js/france/`, `js/monde/`, `js/apprendre/` | un fichier par module, rangés comme les chapitres du menu |
| `data/france/`, `data/monde/` | `carte-*.js` (tracés, souvent générés) et `infos-*.js` (fiches, modifiables à la main, une ligne par zone) |
| `outils/` | régénération des données (Python, Node, pages HTML) : voir le README |
| `css/style.css` | toute l'apparence (~120 Ko) : cherche par commentaire de section plutôt que de tout lire |

## Les quatre sortes de modules

Chaque fichier de module s'enregistre auprès du noyau ; la carte du menu de même type et de même id
s'active toute seule (sinon elle reste grisée avec les textes de `MENU`).

| Sorte | Enregistrement | Carte du menu | Ce que le noyau fournit | Modèle à copier |
|---|---|---|---|---|
| Quiz | `GeoNohyne.registerCategory` | `{ quiz: 'id' }` | ciblage + nommage, occasionnel + **record**, écran de choix, statistiques, révision | `js/france/quiz-departements.js` |
| Jeu à part | `GeoNohyne.registerJeu` | `{ jeu: 'id' }` | un écran (`ecran` : sa `<section>` dans `index.html`), la carte si besoin, `api.suggestions` ; **ni record ni statistiques** | `js/france/grand-chemin.js` (avec carte), `js/france/morpion.js` (`sansCarte`) |
| Apprendre | `GeoNohyne.registerApprentissage` | `{ apprendre: 'id' }` | carte cliquable, fiche (`fiche(zone)`), recherche, filtres | `js/apprendre/departements.js` |
| Page | `GeoNohyne.registerPage` | `{ page: 'id' }` | rien (aucune pour l'instant) | — |

Ajouter un module : le fichier, sa balise `<script>` dans la bonne section de `index.html` (avant
`js/menu.js`), sa carte dans `MENU`, sa ligne dans `modes` de `../COMMUN/jeux.js`, puis le README.

## Mécanismes à connaître (et à réutiliser)

- **Écran de choix** (modèle dessiné par Théo, 2.3.0) : construit par `core.js` à partir du
  `<template id="setup-modele">` ; un **panneau** par quiz, et avec `colonneDroite` deux panneaux dont un seul est
  montré, au choix du sélecteur **« Sujet du jeu »** (départements | préfectures ; dernier sujet mémorisé,
  `geonohyne.setup.sujet.<id>`, seulement depuis le menu ; façon de jouer et mode record synchronisés entre les
  deux). **Grille 2 × 2 dont les cases s'alignent en haut et en bas** (`grid-template-areas`, classe `is-record`
  pour le mode record ; les conteneurs `occasionnel` / `partie-record` sont en `display: contents`). Mini-carte
  cliquable des groupes (cocher une région, choisir le périmètre du record), liste en 3 colonnes (5 en record)
  pour ne jamais défiler en 1280 × 720. **Couleur ambrée et lumières propres à cet écran** : bloc
  `#screen-setup` de `css/style.css`, qui redéfinit `--coral…` (Théo l'étendra peut-être à tout le jeu). La
  Liste des Départements réutilise les classes `.setup-*` : ne rien changer hors de `#screen-setup` sans la
  vérifier.
- **Indices** : `indices: [{ id, libelle, titre, texte(zone), dessous, ordonne }]` d'une catégorie → une ligne
  « <nomIndice> : rien | … » (avec `aideIndice` dessous) ; `ordonne: true` met aussi les questions dans l'ordre
  des codes. Départements et préfectures (choix de Théo) : **« Ordre INSEE (en indice) » : rien | code | ordre
  + code**, plus de case « Ordre INSEE » séparée ni d'indice « département ». L'ancienne forme `indice` /
  `indiceDessous` est convertie à l'enregistrement.
- **La Liste, mode Hardcore** (`js/france/liste.js`) : Non / 3 / 5 / 10 / Illimité répétitions permises ; ni
  liste ni carte pendant la partie (`#liste-zone` cachée, `#liste-hardcore` : noms cités et répétitions) ; un
  nom déjà trouvé retapé = une répétition ; à la limite, `eliminer()` révèle le reste et la liste revient.
- **Mode record** : périmètre fixe (tout, ou un seul groupe), sans indice ni rattrapage ni suggestion ;
  meilleur = score, puis temps au dixième. Clé `categorie|façon de jouer|périmètre`. Les records sont la
  **seule** donnée publiée (`publiques`) : GéoNohyne est le seul jeu avec des classements.
- **Suggestions** : `filtrerNoms` de `core.js` (`MIN_SUGGESTION` = 3 caractères, début du nom, article ou
  mot générique sautables), donnée aux jeux à part par `api.suggestions`. Mêmes règles partout dans le jeu.
- **Tolérance aux fautes** : option `tolerance: true` d'une catégorie (préfectures), `distance()` et
  `fautesTolerees()` dans `core.js` ; `alias` pour les autres noms (« Cergy » pour Pontoise).
- **Petites zones** : `point: true` sur un élément de carte (micro-État, détroit) → point de taille fixe à
  l'écran, surface cliquable plus large. Les **points** d'une catégorie (`points`, ex. préfectures) suivent
  l'état de leur zone.
- **Critères générés** (Morpion, L'Entonnoir) : des **familles** de critères avec des seuils tirés au
  hasard ; une grille n'est proposée que si elle est **toujours remplissable** ; un critère n'est gardé que
  s'il sépare assez de départements. **Cas limites** (à moins de 2 % d'un seuil chiffré, ou trop près de
  Paris) : jamais comptés contre le joueur, jamais utilisés pour départager.
- **Le Grand Chemin** (un moteur, deux versions ; choix de Théo, 2.4.0) : le moteur `js/grand-chemin.js` reçoit
  une configuration (réseau des voisins par région, carte, mots « département » / « pays », réglages et clés) et
  partage l'écran `#screen-chemin` ; un jeu à part peut définir `rendu()` (core.js l'appelle après chaque rendu
  de la carte : numéros des étapes sur le globe). Monde : frontières d'outre-mer comprises (France–Brésil…),
  réglage « Région » (monde, Europe, Afrique, Asie, Amériques), globe par défaut. Graphe des voisinages, plus courts chemins,
  chemin parfait construit tronçon par tronçon (étapes = vrais détours), recherche bornée par un budget
  (au-delà, on accepte plutôt que bloquer).
- **Globe** (2.4.0, choix de Théo : globe par défaut, carte plate au choix, **nord toujours en haut** (la rotation
  libre, comme une boule, a été essayée et refusée : « horrible pour jouer »), **R** = vue de départ,
  Europe-Afrique ou continents choisis ; records communs globe / plat) : une catégorie avec `globe: '<id>'` (seulement `pays` pour l'instant ; mers et Apprendre plus tard) se
  joue sur la carte globe `<id>` (`data/monde/globe-pays.js`, en degrés, générée par `outils/construire-monde.js`
  avec la carte plate). `core.js` construit le SVG une fois puis recalcule tous les tracés à chaque rotation
  (`rendreGlobe`, viewBox = pixels de la carte) ; les zones gardent leurs éléments, donc états et classes. Vue =
  `{ q, zoom }` (quaternion, mais toute vue est redressée : `vueVers(lon, lat)` = nord en haut ; `rouler` au
  glisser avec butée aux pôles, `amener` et `interpoler` pour les rotations automatiques) ; `vueSur`, `reinitialiserVue`, `afficherRepere` (rotation vers une zone cachée) et
  `cadrerZone` ont leur branche globe. Bouton 🌐 (`data-zoom="globe"`, visible si `body[data-globe]`) :
  `basculerGlobe()` reconstruit la carte en gardant états, classes, vue de départ et repère. Préférence :
  `geonohyne.carte.globe`. **Découpage à l'horizon** (`anneau()` de `globe.js`) : Weiler-Atherton, chaque
  sortie reliée à l'entrée la plus proche *le long de l'horizon* dans le sens de l'anneau ; il faut donc des
  anneaux orientés (extérieurs dans le sens direct, trous dans l'autre : fait par le générateur) ; un tour
  presque complet (frôlement de l'horizon) vaut une jonction directe. Vérifié sur 4 000 vues au hasard (aucun
  morceau ne couvre le disque). Une carte globe n'a ni `largeur` ni `hauteur` (`carte.js` l'accepte).
- **Délais** (en tête de `core.js`) : `DELAI_BONNE` 500 ms, `DELAI_FAUSSE` 1 500 ms.

## Pièges

- Codes INSEE : `2A` / `2B` (Corse, comptent pour 20 dans les critères chiffrés), DOM `971` à `976`
  (pas de 975), Outre-Mer dans des encadrés à leur propre échelle (`outils/ajouter-outre-mer.js`).
- Le Val-d'Oise a Pontoise pour préfecture (services à Cergy) ; la Corse et l'Outre-Mer sont exclus du
  Grand Chemin ; l'Eure ne compte pas comme département maritime.
- Monde : 196 pays (ONU + Vatican, Kosovo, Taïwan) ; territoires rattachés à leur pays ; Palestine et Bir
  Tawil en gris, non cliquables ; « point de vue de la France » pour les frontières (Natural Earth).
- `carte-*.js` générées : ne pas les éditer à la main (régénérer avec `outils/`). Les `infos-*.js`, si.
- Toute source de données est créditée (README « Données et crédits », et `credit` de la catégorie, affiché
  sur l'écran de choix).

## Plans

- **Globe** : l'étendre aux océans et mers et aux modes Apprendre (pays, mers) ; peut-être un relief (ombrage
  des montagnes) : à voir avec Théo.
- Cartes grisées prévues : `{ quiz: 'capitales' }`, `{ jeu: 'morpion-monde' }` (données déjà dans
  `data/monde/infos-pays.js`, `voisins` compris). Le Morpion du monde pourra reprendre le moteur du Morpion
  comme le Grand Chemin l'a fait (un moteur, une configuration par version) : demande à Théo.
