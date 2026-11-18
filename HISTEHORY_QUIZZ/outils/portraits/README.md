# Fabrique des portraits (Python)

Scripts qui produisent `img/personnes/<id>.webp`, `js/donnees/portraits.js` et `img/CREDITS.md`.
À lancer **depuis ce dossier**, avec Python 3 et `pip install pillow numpy "opencv-python-headless<5"`
(OpenCV 5 n'a plus le détecteur de visages utilisé ici). Les images sources (`src/`, `grand/`, `alt/`,
`cand/`) ne sont pas versionnées (voir `.gitignore` à la racine) : elles se retéléchargent.

| Étape | Script | Rôle |
|---|---|---|
| 0 | (node, voir ci-dessous) | `personnes.json` : liste des personnes tirée de `js/donnees/personnes.js` |
| 1 | `f1_wiki.py .` | Wikipédia FR → élément Wikidata (année de naissance vérifiée) → image principale (P18) |
| 2 | `f2_fix.py .` | titres corrigés à la main pour les homonymies |
| 3 | `f3_dl.py .` | vignettes de 960 px (ou la plus grande taille standard qui tient dans l'image) + licence et auteur (Commons) → `src/` (lent : ~25 min, Commons limite le débit) ; puis `f3_dl.py . --petits` pour les originaux de moins de 250 px, que seul `upload.wikimedia.org` sert et qui refuse vite (429) |
| 4 | `f4_conv.py ../../img/personnes` | conversion en portraits 3:4 à double filet, avec les réglages de `reglages.json` |
| 5 | `f5_portraits.py ../..` | écrit `js/donnees/portraits.js` et `img/CREDITS.md` |
| — | `gen.py ../../img/generiques` | images génériques (sources dans `gen/src/`, recadrages dans `gen/meta.json`) |

```sh
node -e "global.window={};require('../../js/donnees/personnes.js');require('fs').writeFileSync('personnes.json',JSON.stringify(window.HISTEHORY.PERSONNES))"
```

**`portrait.py`** : recadrage 3:4 sur le visage (OpenCV), puis « taille-douce » : lignes obliques dont
l'épaisseur suit la lumière, contours creusés ; double filet rectangulaire autour. Sortie 384 × 512
(WebP, transparence compressée : ~45 Ko). OpenCV n'ouvrant pas les chemins accentués, ses fichiers sont
lus par le nom court Windows.

**`reglages.json`**, par id : `coupe: [cx, cy, largeur]` (recadrage à la main : centre de la tête en
fractions de la largeur et de la hauteur, largeur du cadrage en fraction de la largeur ; le cadre 3:4
part du haut d'un carré de ce côté centré sur la tête, et descend sur les épaules), `pleine: true`
(chercher le visage sur l'image entière : par défaut, on le cherche sur une copie de 500 px de large, ce
qui évite de prendre des oreilles ou des drapés pour des visages, mais en rate quelques-uns), `exclu: true` (image générique à la place),
`aucune: true` (pas d'image du tout). `wiki.json` garde, pour chaque personne, l'image Commons retenue,
sa page, sa licence et son auteur.

**Revoir et corriger** : `revue2.py ../../img/personnes planche` (planches de 60 médaillons),
`grille.py g.png id1 id2…` (sources quadrillées), `essai2.py e.png id1 id2…` (source avec le cadre
de recadrage, à côté du résultat). Autre source pour une personne : `cand.py nom "recherche Commons"`
(planche de candidats), puis `alt.py id nom numéro`.

**Images génériques** (`img/generiques/`) : gravures de Commons (`gen/meta.json`), recadrées à la main
(`coupe` de `gen/meta.json`), fabriquées par `gen.py`. Attribution par `generique()` dans `f5_portraits.py` :
femme → dame ; politique → souverain ; militaire → guerrier ; religion, philosophie, lettres → religieux ;
sciences, médecine, société, économie, exploration → savant.
