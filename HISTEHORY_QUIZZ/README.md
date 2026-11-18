# Histehory Quizz

Jeu consacré à l'histoire (nom provisoire). Il fait partie du dossier des jeux : lancement, comptes
communs et serveur sont décrits dans le [README à la racine](../README.md).

**Version 2.2.1** (numérotation MAJEUR.MINEUR.CORRECTIF : voir « Versions » dans le
[README à la racine](../README.md#versions)).

**Modes de jeu** : trois sont jouables, **Qui est venu en premier ?**, **Chronologie** et **Trouver la
date** ; les quatre autres restent grisés (« Bientôt ») : Deviner la personne (indices progressifs), Qui a
dit ça ?, Les paires, Vrai ou Faux.

## Le menu « Chroniques » (`js/menu.js`, `css/menu.css`)

Même construction que les menus de GéoNohyne Quizz, d'Anotehomy Quizz et de Natehure Quizz :

- à gauche, le titre et la **liste des chapitres** (le chapitre affiché est souligné d'ambre) ;
- à droite, la **planche** du chapitre : un dessin au trait avec quelques repères et une légende,
  **immobile** (seule son apparition est animée) ; dessous, un **cadran** marque l'année du jour ;
- dessous, les **cartes** du chapitre. Un mode jouable est une carte active (bouton) ; un mode annoncé
  reste grisé, avec un cadenas et « Bientôt ».

Les flèches ← → changent de chapitre ; le dernier chapitre affiché est retenu (`histehory.menu.chapitre`
dans le stockage du navigateur).

| № | Chapitre | Planche | Cartes |
|---|---|---|---|
| 01 | **Le fil du temps** | un sablier et la frise du temps, coupée par l'an 1 | Chronologie · Trouver la date |
| 02 | **Les grandes figures** | trois portraits-médailles (Napoléon, Jeanne d'Arc, Marie Curie) et une plume | Qui est venu en premier ? · Deviner la personne · Qui a dit ça ? |
| 03 | **L'épreuve de l'historien** | une balance (vrai d'un côté, faux de l'autre) et deux maillons de chaîne | Les paires · Vrai ou Faux |

Les chapitres, l'ordre des cartes et leurs textes sont décrits en tête de `js/menu.js` (`CHAPITRES`,
`MENU`) : c'est le seul fichier à modifier pour ajouter, déplacer ou renommer une carte ou un chapitre.

**Apparence** : thème « Chroniques », sombre (brun d'archives), ambre pour les actions, orange pour les
consignes ; fond de papier réglé, immobile. Polices locales **Bricolage Grotesque** et **IBM Plex Mono**
(licence OFL, `css/polices/`, textes de licence joints) ; la police des titres est commune à tout le site
(`../COMMUN/police.css`).

**Compte** : bouton en haut à gauche et **menu déroulant**, comme dans les autres jeux (`js/compte.js`,
`css/compte.css`) : se connecter ou créer un compte (en reprenant les statistiques de l'invité), comptes
déjà utilisés dans ce navigateur, puis renommer, changer le mot de passe, changer de compte, se
déconnecter, supprimer le compte. Le menu s'ouvre seul à l'arrivée (une fois par session du navigateur,
tous jeux confondus) quand le serveur répond et qu'aucun compte n'est connecté.

## Trouver la date (`js/modes/date.js`, `css/date.css`)

**Un événement, une date à taper.** L'événement vient de `js/donnees/dates.js` (939 événements) : on voit
son **thème** (la thématique : Politique, Militaire, Religion…), sa région, son intitulé et son résumé,
jamais sa date.

- **Deux façons de jouer** (préphase) :
  - **L'année** : on tape l'année seule ;
  - **La date exacte** : jour, mois (dans une liste) et année, quand l'événement est daté au jour près
    (697 événements sur 939) ; pour les autres, les champs jour et mois disparaissent et seule l'année
    est demandée (« On ne connaît que l'année de cet événement »).
- **Saisie** : un interrupteur **apr. J.-C. / av. J.-C.** à côté de l'année (au clavier, un « - » tapé
  devant l'année passe en « av. J.-C. »). **Entrée valide** ; s'il manque un champ, Entrée y mène. Pas
  d'année 0 (l'an 1 av. J.-C. est suivi de l'an 1) ; un jour impossible (31 février) est refusé.
- **Juste ou faux**, sans points partiels : l'année exacte, et en date exacte le jour et le mois exacts.
  Les **dates approximatives** (« vers… », 67 événements, surtout dans l'Antiquité) sont jugées sur
  l'année seule, avec une **marge** annoncée dans la consigne : 10 % de leur ancienneté (comptée depuis
  l'an 2000), au moins 10 ans, arrondie à la dizaine (vers 1620 : 40 ans ; vers 30 : 200 ans ;
  vers 2560 av. J.-C. : 460 ans).
- **Correction** : chaque champ passe au vert ou au rouge ; la bonne date s'affiche, avec l'écart
  (« 3 ans trop tard », « la bonne année, mais 12 jours trop tôt »). Bonne réponse : la question
  suivante arrive seule au bout de 1,8 s (le bouton « Suivant » se remplit) ; erreur : on lit, puis
  « Suivant » ou Entrée. Série de bonnes réponses affichée.
- **Préphase** (réglages retenus d'une partie à l'autre, `histehory.date.reglages`) : la façon de jouer,
  le **nombre d'événements** de 1 à 50 (− / +, 5 · 10 · 20 · 30 · 50, curseur) et les trois mêmes filtres
  croisés que « Chronologie » (**période**, **difficulté**, **thématique**, avec le nombre d'événements
  sur chaque case, et un interrupteur « Tout / Aucun » par filtre). Les périodes et les thématiques ont
  chacune leur emoji. L'écran est une grille de deux colonnes alignées : façon de jouer en face de la
  période, nombre d'événements en face de la difficulté et de la thématique. S'il y a moins d'événements
  que demandé, la partie les prend tous ; aucun : on ne peut pas lancer.
- **Fin** : anneau de réussite, score, temps, meilleure série ; les erreurs (bonne date et réponse donnée :
  les 3 dernières, les autres derrière « Voir les N autres ») ; **Revoir mes erreurs** relance une partie
  avec les seuls événements manqués. La partie est enregistrée pour le joueur (une bonne réponse = un
  point).

## Chronologie (`js/modes/chronologie.js`, `css/chronologie.css`)

**Cinq événements, sous forme de blocs, à placer sur une frise de cinq emplacements**, du plus ancien
(à gauche, ou en haut sur téléphone) au plus récent. Chaque bloc porte le titre de l'événement et deux
indices (thématique · région), jamais sa date. Les événements viennent de `js/donnees/dates.js`
(939 événements, de la préhistoire à 2025).

- **Placer et déplacer** : on peut déplacer les blocs autant qu'on veut **avant de valider**.
  - **Glisser** (souris ou doigt) un bloc jusqu'à un emplacement ; déposé sur un emplacement occupé, il
    échange sa place avec l'autre bloc ; déposé dans la zone « à placer », il est retiré de la frise.
  - **Cliquer** un bloc, puis un emplacement (ou un autre bloc, pour les échanger).
  - **Clavier** : Tab, Entrée pour prendre un bloc, puis un chiffre de 1 à 5 (emplacement) ; ← / → (ou
    ↑ / ↓) décalent un bloc de la frise ; Suppr le retire ; Échap lâche la sélection.
- **Valider** (actif quand les cinq emplacements sont remplis) : la date de chaque événement s'affiche,
  avec son résumé ; les blocs bien placés sont marqués ✓ (vert), les autres ✗ et la place qu'ils auraient
  dû prendre (« ✗ n° 3 », rouge). Une échelle montre les cinq dates à leur vraie distance (deux dates très proches sont légèrement
  écartées pour que les numéros restent lisibles), avec l'écart en années entre le plus ancien et le
  plus récent. Un point par événement bien placé ; 5 sur 5 :
  « Chronologie parfaite ».
- **Préphase** : trois filtres **cumulables et croisés**, avec le nombre d'événements concernés sur chaque
  case (compte tenu des deux autres filtres) et « Tout / Aucun » pour chaque groupe :
  **période** (Antiquité, Moyen Âge, époque moderne, époque contemporaine), **difficulté** (1 à 5, comme
  dans `dates.js`) et **thématique** (les 14 domaines). **Impossible de lancer la partie s'il y a moins
  de 5 événements** qui correspondent : le message dit combien il y en a. Même chose si les événements
  restants sont trop proches dans le temps pour en tirer cinq qu'on puisse départager. Puis la longueur :
  3, 5 ou 10 manches (15, 25 ou 50 événements).
- **Tirage** : les cinq événements d'une manche ne tombent jamais la même année (sauf deux événements à
  date précise et différente) ; si une date est approximative, au moins 15 ans d'écart avec les autres.
  Les événements ne reviennent pas d'une manche à l'autre tant qu'il en reste d'autres à tirer.
- **Score** : un point par événement placé à sa vraie place, donc 5 par manche. La partie est enregistrée
  pour le joueur (bonnes réponses = événements bien placés, questions = 5 × le nombre de manches).

## Qui est venu en premier ? (`js/modes/premier.js`, `css/premier.css`)

Chapitre 02, « Les grandes figures ». Deux personnages s'affichent en grand au milieu de l'écran, chacun
dans un cadre en forme de portrait (brun sombre, liseré doré), un losange « VS » entre les deux : le
portrait à double filet, puis, sous un filet doré, le nom, pays · domaine · époque et la date de naissance
(« Né en ? » dans une pastille en pointillés tant qu'on ne la connaît pas). La consigne est toujours la
même, en capitales en haut de l'écran : **qui est né en premier ?** On clique sur le plus ancien des deux
(ou flèche gauche / droite) ; les années s'inscrivent en doré, un badge ✓ / ✗ marque les cadres et une
mini-frise montre l'écart.

- **Partie sans fin, en mort subite** : pas de nombre de questions ; la partie s'arrête à la première
  erreur. « Quitter » l'arrête aussi, et la série en cours compte. Le score est le nombre de bonnes
  réponses d'affilée ; un **record par niveau** est gardé pour le joueur (compte ou invité) et affiché en
  haut de l'écran (« 🏆 Nouveau record ! » dès qu'il est battu).
- **Un personnage reste, l'autre change** : après une bonne réponse (la suite arrive seule au bout de
  1,8 s, le bouton « Suivant » se remplit), l'un des deux personnages reste à sa place et l'autre est
  remplacé. Celui qui reste est tiré au hasard, mais personne ne joue plus de **3 manches de suite**. Sa
  date reste affichée : on compare le nouveau venu (« Né en ? ») à une date connue.
- **Tirage** : une pioche mélangée de la sélection ; un personnage ne revient pas avant que tous les
  autres soient passés, et au remélange les plus récents passent en fin de pioche (personne ne revient
  aussitôt d'un tour à l'autre). Jamais deux personnes nées la même année ; si une date est
  approximative, au moins 15 ans d'écart.
- **Préphase** : la **période** (quatre cartes cumulables : Antiquité, Moyen Âge, époque moderne, époque
  contemporaine, avec l'interrupteur « Tout / Aucun » ; époque = celle du milieu de la vie) et la
  **difficulté** (un seul choix : Facile = difficulté 1-2, Moyen = 1-3, Expert = toutes), avec le nombre de
  personnages sur chaque case ; lancement impossible sous 3 personnages. Réglages retenus.
- **Fin** : la série, le record (battu ou non), l'erreur qui a arrêté la partie (« Vous avez choisi X, né
  en 1480 ; Y est né 29 ans plus tôt »), le niveau, les périodes et le temps.

## Portraits (`img/`, `js/donnees/portraits.js`)

Chaque personne de `js/donnees/personnes.js` a une image, rangée dans `js/donnees/portraits.js` :
son **portrait** (`img/personnes/<id>.webp`, rectangle 3:4 de 384 × 512 entouré d'un double filet,
~45 Ko), ou à défaut une **image générique** (`img/generiques/` : souverain, dame, guerrier, religieux,
savant ; Mahomet n'a volontairement aucune image). Les portraits viennent de l'image principale de chaque
personne sur Wikidata (Wikimedia Commons), recadrée sur le visage puis convertie en traits blancs
(« taille-douce ») ; sources, auteurs et licences : [img/CREDITS.md](img/CREDITS.md). Les scripts qui les
fabriquent sont dans `outils/portraits/` (voir son README).

La planche du chapitre 02 garde des **médaillons ronds** : `img/medaillons/` (Napoléon, Jeanne d'Arc,
Marie Curie), les anciens portraits ronds de 256 px, conservés pour elle.

**Ouvert au public** depuis la version 2.0.0 : sa tuile est un lien sur la page d'accueil et dans le menu
« Jeux » des autres jeux, et ses totaux comptent dans le bouton « Statistiques » de l'accueil (champ
`totaux` de sa ligne dans `../COMMUN/jeux.js`). Voir « Accès aux jeux » dans le
[README à la racine](../README.md) pour le fermer de nouveau (`bloque: true`).

## Versions

À chaque nouvelle version : une ligne ici, et le numéro dans `../COMMUN/jeux.js` (ligne `histehory`),
d'où il s'affiche dans le menu « Jeux », sur la page d'accueil et en bas du menu du jeu.

| Version | Date | Changements |
|---|---|---|
| 2.2.1 | 17/11/2026 | **Portraits refaits** : rectangles 3:4 à double filet (384 × 512, au lieu de médaillons ronds de 256 px), tirés de sources en 960 px ; images génériques comprises. La planche du chapitre 02 garde ses trois médaillons ronds (`img/medaillons/`). **Qui est venu en premier ?** : cadres en forme de portrait (brun sombre, liseré et lueur dorés au survol), losange « VS » entre les deux, nom sous un filet doré, « Né en ? » dans une pastille en pointillés, consigne en capitales, « Quitter » et score en pastilles. |
| 2.2.0 | 13/11/2026 | **Qui est venu en premier ?** change de règle et passe dans le chapitre 02 (Les grandes figures). Toujours « qui est né en premier ? » (plus de « en dernier »), sans nombre de questions : la partie continue jusqu'à la première erreur, avec un record par niveau. Après chaque bonne réponse, l'un des deux personnages reste (tiré au hasard, 3 manches de suite au plus) et garde sa date affichée ; l'autre est remplacé, sans revenir avant que tous les autres soient passés. Préphase sur le modèle de « Trouver la date » : période en quatre cartes (« Tout / Aucun ») et difficulté en trois cartes, avec le nombre de personnages. Écran de jeu : les deux cadres en grand au milieu, la consigne fixe dans la barre du haut. Styles du mode dans `css/premier.css` ; l'interrupteur « Tout / Aucun » et les cartes des périodes passent de `date.css` à `style.css` (partagés). |
| 2.1.0 | 11/11/2026 | Nouveau mode **Trouver la date** : un événement (thème, région, intitulé, résumé), sa date à taper — l'année seule, ou la date exacte au jour près quand on la connaît ; juste ou faux, avec une marge pour les dates approximatives. Préphase en grille alignée : façon de jouer, 1 à 50 événements, filtres croisés par période, difficulté et thématique (emojis, interrupteurs « Tout / Aucun », réglages retenus). Fin : anneau de réussite, erreurs, « Revoir mes erreurs ». Les styles des filtres passent de `chronologie.css` à `style.css` (partagés). |
| 2.0.0 | 10/11/2026 | **Nouvelle interface**, sur le modèle des autres jeux : menu « atlas » en trois chapitres (Le fil du temps, Les grandes figures, L'épreuve de l'historien), chacun avec sa planche dessinée et ses cartes ; les deux modes jouables en tête du premier chapitre. Thème « Chroniques » (polices locales Bricolage Grotesque et IBM Plex Mono, fond de papier réglé). Compte : menu déroulant en haut à gauche (comptes déjà utilisés ici, changer de compte) au lieu d'une fenêtre au centre. **Jeu ouvert au public.** |
| 1.2.0 | 09/11/2026 | Nouveau mode **Chronologie** : cinq événements à placer sur une frise (glisser-déposer, clic ou clavier), validation qui révèle les dates, préphase avec filtres croisés par période, difficulté et thématique (lancement impossible sous 5 événements). 939 événements dans `dates.js`. |
| 1.1.1 | 08/11/2026 | Consigne « en premier / en dernier » au lieu de « avant / après ». |
| 1.1.0 | 08/11/2026 | Écran de jeu revu : portrait-héros et cartouche, consigne avant / après en couleurs et flèches opposées, badges ✓ / ✗, mini-frise, enchaînement automatique, série, survol réservé à la souris. |
| 1.0.0 | 08/11/2026 | Mode « Qui est venu en premier ? » (avant / après), portraits des personnes, sept modes annoncés. |
| 0.1.0 | 28/10/2026 | Page d'accueil (quatre modes grisés) et comptes communs. |
