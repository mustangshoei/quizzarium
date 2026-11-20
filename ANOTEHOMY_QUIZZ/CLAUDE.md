# CLAUDE.md — Anotehomy Quizz

Spécialités de ce jeu. Les règles communes (indépendance, `COMMUN/` facultatif, versions, commits…) sont
dans le `CLAUDE.md` de la racine ; la documentation complète pour un humain est dans `README.md`, les
crédits dans `CREDITS.md`, les outils 3D dans `tools/README.md`.

## Carte d'identité

- Anatomie humaine sur un modèle 3D (os, ostéologie descriptive, muscles, vaisseaux, organes,
  splanchnologie descriptive) et langue médicale sans 3D (pathologies, termes médicaux).
- id `anotehomy`. Version dans `README.md` et dans `../COMMUN/jeux.js`.
- Thème « Planches anatomiques » : prune profond, rose framboise et blanc rosé, menthe = juste, pêche =
  temps et avertissements ; fond en papier d'électrocardiogramme (`img/trame.svg`).
- **Nomenclature TA2** (Terminologia Anatomica 2) : noms français TA2 attendus, nom latin TA2 accepté,
  anciens termes (rotule, péroné, omoplate…) reconnus mais **comptés faux**.
- **Identifiants en anglais, commentaires en français.** Les anciens fichiers ont des commentaires sans
  accents ; écris les nouveaux **avec** accents. Un seul espace de noms : `window.AQ`
  (`util`, `data`, `engine`, `game`, `account` ; `geo` est un vestige inutilisé).
- Scripts `defer`, chargés dans l'ordre par `index.html` : vendor → core → data → modèle du squelette →
  engine → game (state, matcher, adaptateurs, setup, play, results, lexique-*, home) → account → `main.js`.

## Où est quoi

| Dossier / fichier | Rôle |
|---|---|
| `js/data/games.js` | **le catalogue du menu** : `CHAPTERS`, `GROUPS` (une carte pour plusieurs jeux), `GAMES` (`status: 'ready'` ou `'soon'`) |
| `js/data/*.js` | catalogues : `bones`, `osteology`, `muscles`, `vessels`, `organs`, `splanchnology`, `pathologies`, `morphemes`, `regions` |
| `js/data/*-model.js`, `js/data/splanchno/*.js` | **modèles 3D générés** (1,5 à 3 Mo chacun) : ne jamais les lire en entier ni les éditer |
| `js/engine/` | moteur Three.js : `model`, `scene`, `camera`, `highlight`, `input`, `segment` (découpage des os), `systems` (fabrique commune muscles / vaisseaux / organes), `splanchno` (organe isolé), `tissue` (matériau des organes), `bvh` (lancer de rayon accéléré) |
| `js/game/state.js` | réglages (`settings`), session, `ADAPTERS`, `SCREENS` |
| `js/game/matcher.js` | correction des saisies (voir plus bas) |
| `js/game/setup.js`, `play.js`, `results.js` | configuration, partie et résultats **communs** aux jeux 3D |
| `js/game/*-game.js`, `*-setup.js` | un adaptateur et un bloc de configuration par jeu 3D |
| `js/game/lexique-*.js` | moteur des jeux de vocabulaire et ses modes |
| `js/game/home.js` | le menu (`ICONS`, `TINTS`, `PLANCHES`) |
| `js/account/profile.js`, `account.js` | statistiques / bouton, menu du compte, écran des statistiques |
| `tools/` | PowerShell + C# (compilé à la volée, rien à installer) : régénère les modèles 3D |

## Les trois sortes de jeux

1. **Jeu 3D avec adaptateur** (os, ostéologie, muscles, vaisseaux, organes, splanchnologie) : un objet
   `NS.ADAPTERS['<id>']` dont l'interface est décrite **en tête de `js/game/osteo-game.js`** (`texts`,
   `build`, `showTarget`, `evaluate`, `isHit`, `reveal`, `names`, `review`, `leave`…), + son bloc de
   configuration (`index.html` + `*-setup.js`, réglages préfixés dans `settings` : `o`, `m`, `v`, `g`, `s`).
   Déroulement, correction, résultats et statistiques sont communs : rien d'autre à écrire.
2. **Jeu sans 3D avec ses propres écrans** : `NS.SCREENS['<id>'] = { open, close }` ; le menu les ouvre à
   la place de la configuration commune ; la partie s'enregistre avec `AQ.account.saveGame`.
3. **Jeu de vocabulaire** (« lexique » : pathologies, termes médicaux) : un fichier
   `js/game/lexique-<jeu>.js` qui appelle `registerLexique` (interface en tête de
   `js/game/lexique-game.js` : `items`, `filters`, `question`, `hints`, `fiche`, `evaluate`, `suggestions`,
   `leurres`, `memeSens`…). Les **modes** sont des fichiers à part qui appellent `registerLexMode`
   (`lexique-devinette.js`, `lexique-qcm.js`) : un nouveau mode sert aussitôt à tous les lexiques.
   **C'est le modèle à reprendre pour tout futur jeu de questions sans 3D** (y compris, en copie, dans
   Histehory ou Natehure).

Dans tous les cas : l'entrée dans `js/data/games.js`, les `<script defer>` dans `index.html` (l'ordre
compte), la ligne dans `modes` de `../COMMUN/jeux.js`, le README.

## Mécanismes à connaître (et à réutiliser)

- **Correction** (`matcher.js`) : `norm` (minuscules, sans accents ni ponctuation, sans article ni « os »)
  puis `canon` (sans prépositions, adjectifs d'os ramenés au nom de l'os : « trochlée humérale » =
  « trochlée de l'humérus », sans « muscle » initial). Distance `lev` (Damerau-Levenshtein), seuil
  `tolFor` (0 / 1 / 2 / 3). La réponse est comparée à **tous** les noms du jeu, anciens compris : juste
  seulement si le plus proche est un nom TA2 de l'élément demandé. Os en série : numéro, niveau et côté lus
  dans la réponse (« T9 », « 12e côte gauche »). Score 10, ou 7 avec une faute.
- **3D paresseuse** : rien ne se charge derrière le menu ; le squelette au premier lancement
  (`ensure3D`), chaque autre modèle au premier lancement de son jeu, chaque organe détaillé quand il est
  tiré. Hors des parties, le rendu est **en pause**.
- **Éléments cachés** : en Nommage, ce qui masque la cible est caché automatiquement ; en Ciblage, rien
  n'est caché (ce serait un indice) mais **Maj + clic** écarte un élément gênant.
- **Autocomplétion** sur tous les noms du jeu (pas seulement ceux de la partie) ; en vaisseaux et organes,
  seulement sur ce qui est affiché (types, appareils, sexe du corps).
- **QCM** : les mauvaises propositions viennent de prédicats `leurres`, du plus proche au plus lointain ;
  jamais deux propositions de même sens (`memeSens`) ; la bonne réponse n'est pas reproposée dans les
  `RECENT` = 3 questions suivantes.
- **Filtres croisés** (lexiques) : un élément est jouable s'il passe **tous** les filtres ; le nombre à
  côté de chaque case tient compte des autres filtres.
- **Groupes de jeux** (`GROUPS`) : une carte du menu ouvre une fenêtre coupée en deux, une moitié par jeu.
- **Sexe du corps** (`gSex`) partagé entre « Les organes » et la splanchnologie descriptive.
- **Délais** : 2,2 s / 3,5 s (remarque) / 6,5 s (erreur) dans les jeux 3D ; 3,5 / 5 / 9 s dans les lexiques.
- **Rendu des organes** (`js/engine/tissue.js`, organes et splanchnologie) : `tissueMaterial(couleur, ao)`,
  un MeshPhysicalMaterial partagé par couleur, retouché par `onBeforeCompile` (vernis + carte
  d'environnement PMREM, occlusion ambiante par sommet, grain en bruit 3D estompé de loin, liseré), visible
  des deux côtés. Les marques (`MAT.hover/target/ko/ok`) passent aussi en double face avec la palette
  `organ` (`setMarkPalette`). L'occlusion vient du modèle : attribut `ao` (un octet par sommet, `ao: true`
  dans l'en-tête du modèle, lu par `decode` / `makeGeometry` de `js/engine/model.js`) ; sans lui, `ao` vaut 1.
- **Lancer de rayon accéléré** (`js/engine/bvh.js`) : `NS.accelerate(mesh)` remplace `mesh.raycast` par un
  BVH construit au premier rayon (mêmes résultats que Three.js, ~30 fois plus rapide) ; appliqué aux
  systèmes (`systems.js`) et à l'organe isolé. Indispensable avec le million de triangles des organes
  (sinon : survol lent, dégagement automatique jusqu'à 1 s).
- **Modèle des organes** (`tools/build-organs.ps1`, ~1 million de triangles, 8,7 Mo) : options du
  catalogue `h: [...]` (organe pris aux organes de référence de l'homme HuBMAP, recalé sur la bouche par
  ICP, `tools/Register.cs`) et `b: 20` (trous de plus de 20 mm bouchés, `tools/MeshFix.cs`) ; faces
  remises vers l'extérieur, subdivision des organes grossiers, simplification à erreur commune
  (`Builder.TargetsByError`), occlusion ambiante. Détails : `tools/README.md`.

## Pièges

- **Clés de statistiques** : id des jeux, noms des éléments, `nom` d'une pathologie, `morpheme` d'un
  morphème. Ne plus les changer (corriger plutôt `resume`, `alt`, `old`…).
- Gros fichiers de données (`morphemes.js` ~230 Ko, `osteology.js` ~120 Ko, `pathologies.js` ~90 Ko) :
  Grep ou lecture par morceaux.
- **Licences** : Z-Anatomy est en **CC BY-SA 4.0**, donc les modèles qui en dérivent (`muscle-model.js`,
  `vessel-model.js`, `organ-model.js`, certains organes détaillés) aussi ; BodyParts3D et HuBMAP en CC BY
  4.0 (organes féminins : ensemble féminin v1.5 ; langue et tonsilles : ensemble masculin v1.10). Toute
  nouvelle source ou modification va dans `CREDITS.md`.
- Le modèle Z-Anatomy est masculin : les organes féminins viennent de HuBMAP, recalés dans le bassin, ou
  sont générés (`tools/GlbRead.cs`). Le bassin osseux reste masculin.
- **HuBMAP (homme) contre Z-Anatomy** : comparés organe par organe en novembre 2026 (rendus côte à côte,
  modèles d'origine non simplifiés). Z-Anatomy est plus fin presque partout (intestins avec haustrations
  et ténias, foie, poumons, larynx, trachée annelée, œil, thymus, pancréas, vessie, glandes salivaires) ;
  HuBMAP ne l'emporte que pour la langue (682 triangles chez Z-Anatomy) et les tonsilles palatines
  (ellipsoïdes trop petites chez Z-Anatomy). Le foie HuBMAP (`liver_capsule`) est une coque ouverte ;
  l'estomac et l'œsophage n'existent pas chez HuBMAP. Inutile de refaire la comparaison sans nouvelle
  version de HuBMAP.
- **C# : clés `long` dans un `Dictionary` / `HashSet`** : toujours passer `Key64.Instance`
  (`tools/MeshBuild.cs`). Le hachage par défaut (XOR des deux moitiés) dégénère sur les maillages
  réguliers : la génération des organes passait de 45 s à 7 min.
- Les formes générées (`Shape.Tube`, `Shape.Ellipsoid`) avaient leurs faces vers l'intérieur jusqu'à la
  2.5.1 (invisible avec l'ancien rendu à une face) ; vérifier l'orientation de toute nouvelle forme
  (volume signé positif : `Orientation.SignedVolume`).
- Les planches du menu (`img/chapitre-*.webp`) sont des rendus figés du modèle : **aucune 3D dans le menu**.

## Plans

- « Les nerfs » (chapitre « Le corps humain », `status: 'soon'`) : un jeu 3D de plus, sur le modèle des
  vaisseaux (Z-Anatomy, `tools/build-*.ps1` à écrire).
- Module « Le corps humain » (chapitre « Apprendre la Vie ») : exploration libre du corps et fiche de
  chaque élément.
- Pas de classements publics pour l'instant (`publiques` vide) : à discuter avec Théo avant d'en ajouter.
