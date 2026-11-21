/* ==========================================================================
   globe.js — Géométrie du globe de GéoNohyne Quizz (GeoCarte.globe)

   Aucune donnée, aucun élément de page : des calculs. Le noyau (js/core.js) construit le SVG et
   appelle ces fonctions à chaque rotation ou zoom pour recalculer les tracés.

   Une carte « globe » (ex. data/monde/globe-pays.js, faite par outils/construire-monde.html) a la
   même forme qu'une carte plate (voir carte.js), mais en degrés :
     globe: true, zoomMax,
     elements: [{ code, nom, d, cx, cy, cadre, point }]
       d       « M lon lat L lon lat … Z » ; anneaux extérieurs dans le sens direct (vers l'est puis le
               nord), trous dans l'autre sens : c'est ce qui permet de suivre l'horizon (voir anneau())
       cx, cy  longitude et latitude du point d'étiquette (repère, point des micro-États)
       cadre   [lon0, lat0, lon1, lat1] (lon1 peut dépasser 180 pour un pays à cheval sur l'antiméridien)
     decor: [{ d, classe, nom, dessus, ligne }]   ligne : tracé ouvert (pas de remplissage)

   Projection orthographique (le globe vu de loin). Une vue = { q, zoom } : l'orientation du globe
   (quaternion unitaire [w, x, y, z] qui fait passer des coordonnées terrestres à celles de l'écran :
   x vers la droite, y vers le haut, z vers l'observateur) et le grossissement (1 = le globe entier).
   Le NORD RESTE TOUJOURS EN HAUT (choix de Théo) : glisser à gauche ou à droite change la longitude, vers le
   haut ou le bas la latitude (butée aux pôles). Une rotation libre, comme une boule, a été essayée (2.4.0) puis
   abandonnée : on s'y perd en jouant. L'orientation reste un quaternion (vueVers() le construit pour un centre
   donné) mais toute vue fabriquée ici est redressée.

   API (GeoCarte.globe)
     preparer(chaine)              chaîne « d » -> [{ ferme, sens, v: Float64Array (x, y, z par sommet) }]
     vecteur(lon, lat)             vecteur unitaire du point
     vueVers(lon, lat, zoom)       vue centrée sur ce point, nord en haut
     cadre(vue, largeur, hauteur)  repère de l'écran { vue, R, cx, cy, m, … } pour une vue
     chemin(anneaux, rep)          attribut « d » SVG de ces anneaux vus depuis rep ('' si caché)
     projeter(lon, lat, rep)       { x, y, z } : position à l'écran, z > 0 = face visible (z = 1 au centre)
     inverser(x, y, rep)           [lon, lat] du point de l'écran, ou null hors du globe
     nord(rep)                     angle (degrés, sens horaire) du nord à l'écran, pour la boussole
     graticule(pas)                anneaux des méridiens et parallèles (tracés ouverts)
     rouler(vue, dx, dy, R)        vue tournée par un glisser de (dx, dy) pixels (nord en haut, butée aux pôles)
     viser(vue, x, y, lon, lat, largeur, hauteur)   vue tournée pour que (lon, lat) passe sous (x, y)
     amener(vue, lon, lat)         vue qui met ce point au centre (même zoom)
     interpoler(v0, v1, t)         vue intermédiaire (centre à vitesse régulière, zoom géométrique), t de 0 à 1
     vueSur(cadres, largeur, hauteur, zoomMax)   vue (nord en haut) qui montre ces cadres [lon0, lat0, lon1, lat1]
   ========================================================================== */
(function (root) {
  'use strict';

  const RAD = Math.PI / 180;
  const RAYON = 0.45;                 // rayon du globe entier, en part du plus petit côté de la carte
  const PAS_ARC = 4 * RAD;            // finesse des arcs de l'horizon
  const FROLE = 3 * RAD;              // écart toléré entre une sortie et une entrée « à l'envers » (voir anneau())

  function vecteur(lon, lat) {
    const l = lon * RAD, p = lat * RAD, c = Math.cos(p);
    return [c * Math.cos(l), c * Math.sin(l), Math.sin(p)];
  }

  // « M lon lat L lon lat … Z M … » -> anneaux de vecteurs unitaires (ferme : se termine par Z)
  function preparer(chaine) {
    const res = [];
    String(chaine || '').split('M').forEach((morceau) => {
      if (!morceau.trim()) return;
      const ferme = morceau.indexOf('Z') >= 0;
      const pts = morceau.replace('Z', '').split('L');
      const v = new Float64Array(pts.length * 3);
      let n = 0, aire = 0, prec = null, premier = null;
      pts.forEach((p) => {
        const [lon, lat] = p.trim().split(/\s+/).map(Number);
        if (!isFinite(lon) || !isFinite(lat)) return;
        const u = vecteur(lon, lat);
        v[n++] = u[0]; v[n++] = u[1]; v[n++] = u[2];
        if (prec) aire += prec[0] * lat - lon * prec[1]; else premier = [lon, lat];
        prec = [lon, lat];
      });
      if (prec && premier) aire += prec[0] * premier[1] - premier[0] * prec[1];
      // sens : 1 = sens direct (anneau extérieur), -1 = sens inverse (trou)
      if (n >= 6) res.push(calotte({ ferme, sens: aire < 0 ? -1 : 1, v: n === v.length ? v : v.slice(0, n) }));
    });
    return res;
  }

  // Calotte qui contient l'anneau (centre c, sinus de son rayon angulaire s) : un anneau entièrement
  // derrière le globe est écarté sans calcul
  function calotte(an) {
    const v = an.v;
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < v.length; i += 3) { x += v[i]; y += v[i + 1]; z += v[i + 2]; }
    const n = Math.hypot(x, y, z);
    if (n < 1e-9) { an.c = null; return an; }
    an.c = [x / n, y / n, z / n];
    let mini = 1;
    for (let i = 0; i < v.length; i += 3) mini = Math.min(mini, v[i] * an.c[0] + v[i + 1] * an.c[1] + v[i + 2] * an.c[2]);
    an.s = mini <= 0 ? 2 : Math.sqrt(1 - mini * mini);   // 2 : plus d'un hémisphère, jamais écarté
    return an;
  }

  /* Quaternions : [w, x, y, z], unitaires. produit(a, b) = tourner par b puis par a. */
  function produit(a, b) {
    return [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
  }
  function unitaire(q) {
    const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
  }
  function matrice(q) {
    const [w, x, y, z] = q;
    return [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
      2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
      2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)];
  }
  function depuisMatrice(m) {
    const t = m[0] + m[4] + m[8];
    let q;
    if (t > 0) { const s = Math.sqrt(t + 1) * 2; q = [s / 4, (m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s]; }
    else if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; q = [(m[7] - m[5]) / s, s / 4, (m[1] + m[3]) / s, (m[2] + m[6]) / s]; }
    else if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; q = [(m[2] - m[6]) / s, (m[1] + m[3]) / s, s / 4, (m[5] + m[7]) / s]; }
    else { const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; q = [(m[3] - m[1]) / s, (m[2] + m[6]) / s, (m[5] + m[7]) / s, s / 4]; }
    return unitaire(q);
  }
  // Rotation autour d'un axe (vecteur quelconque) d'un angle en radians
  function autour(axe, angle) {
    const n = Math.hypot(axe[0], axe[1], axe[2]);
    if (n < 1e-12 || !angle) return [1, 0, 0, 0];
    const s = Math.sin(angle / 2) / n;
    return [Math.cos(angle / 2), axe[0] * s, axe[1] * s, axe[2] * s];
  }
  // Plus courte rotation qui amène le vecteur unitaire a sur b
  function entre(a, b) {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (d < -0.999999) {                   // opposés : demi-tour autour d'un axe perpendiculaire
      const axe = Math.abs(a[0]) < 0.9 ? [0, -a[2], a[1]] : [-a[1], a[0], 0];
      return autour(axe, Math.PI);
    }
    return unitaire([1 + d, a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
  }

  // Vue centrée sur (lon, lat), nord en haut
  function vueVers(lon, lat, zoom) {
    const cl = Math.cos(lon * RAD), sl = Math.sin(lon * RAD), cp = Math.cos(lat * RAD), sp = Math.sin(lat * RAD);
    return { q: depuisMatrice([-sl, cl, 0, -sp * cl, -sp * sl, cp, cp * cl, cp * sl, sp]), zoom: zoom || 1 };
  }

  // Repère de l'écran pour une vue : matrice de rotation, centre et rayon en pixels ; dir : point du globe
  // au centre de l'écran (coordonnées terrestres)
  function cadre(vue, largeur, hauteur) {
    const R = Math.min(largeur, hauteur) * RAYON * vue.zoom;
    const m = matrice(vue.q);
    return { vue, R, cx: largeur / 2, cy: hauteur / 2, largeur, hauteur, m, dir: [m[6], m[7], m[8]] };
  }

  // Coordonnées vues du sommet i : x vers la droite, y vers le haut, z vers l'observateur (z > 0 : face visible)
  function tourner(v, i, r, out) {
    const X = v[i], Y = v[i + 1], Z = v[i + 2], m = r.m;
    out[0] = m[0] * X + m[1] * Y + m[2] * Z;
    out[1] = m[3] * X + m[4] * Y + m[5] * Z;
    out[2] = m[6] * X + m[7] * Y + m[8] * Z;
  }

  const arr = (x) => Math.round(x * 10) / 10;

  // Point où le segment a -> b passe derrière l'horizon (z = 0), ramené sur le cercle de l'horizon
  function horizon(a, b) {
    const t = a[2] / (a[2] - b[2]);
    const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
    const n = Math.hypot(x, y) || 1;
    return Math.atan2(y / n, x / n);
  }

  // Un anneau fermé vu depuis r. Entièrement visible : tel quel. Sinon (découpage de Weiler-Atherton par
  // l'horizon) : l'anneau est coupé en morceaux visibles, chacun d'une entrée (le tracé revient de derrière
  // le globe) à une sortie ; on relie chaque sortie, en suivant l'horizon dans le sens de l'anneau, à l'entrée
  // la plus proche dans ce sens. Anneau extérieur (sens direct) : l'horizon se suit dans le sens direct ; trou
  // (sens inverse) : dans l'autre. L'intérieur de l'anneau reste ainsi toujours du même côté du tracé.
  function anneau(v, r, morceaux, sens) {
    const n = v.length / 3;
    const P = new Float64Array(n * 3), q = [0, 0, 0];
    let cache = -1;
    for (let i = 0; i < n; i++) {
      tourner(v, i * 3, r, q);
      P[i * 3] = q[0]; P[i * 3 + 1] = q[1]; P[i * 3 + 2] = q[2];
      if (q[2] <= 0 && cache < 0) cache = i;
    }
    let px = Infinity, py = Infinity;
    // Un sommet à moins d'un pixel du précédent n'apporte rien : il est sauté (sauf sur l'horizon)
    const point = (pts, x, y, force) => {
      const X = r.cx + r.R * x, Y = r.cy - r.R * y;
      if (!force && Math.abs(X - px) + Math.abs(Y - py) < 0.9) return;
      px = X; py = Y;
      pts.push(arr(X) + ' ' + arr(Y));
    };
    if (cache < 0) {                                   // entièrement visible
      const pts = [];
      for (let i = 0; i < n; i++) point(pts, P[i * 3], P[i * 3 + 1]);
      if (pts.length >= 3) morceaux.push('M' + pts.join('L') + 'Z');
      return;
    }
    // Morceaux visibles, en partant d'un sommet caché : chacun est complet (entrée … sortie)
    const frag = [];
    let f = null;
    const a = [0, 0, 0], b = [0, 0, 0];
    for (let k = 1; k <= n; k++) {
      const i = (cache + k) % n, j = (cache + k - 1) % n;
      a[0] = P[j * 3]; a[1] = P[j * 3 + 1]; a[2] = P[j * 3 + 2];
      b[0] = P[i * 3]; b[1] = P[i * 3 + 1]; b[2] = P[i * 3 + 2];
      if ((a[2] > 0) !== (b[2] > 0)) {
        const t = horizon(a, b);
        if (b[2] > 0) { f = { pts: [], entree: t, sortie: 0, pris: false }; point(f.pts, Math.cos(t), Math.sin(t), true); }
        else if (f) { point(f.pts, Math.cos(t), Math.sin(t), true); f.sortie = t; frag.push(f); f = null; }
      }
      if (b[2] > 0 && f) point(f.pts, b[0], b[1]);
    }
    if (!frag.length) return;
    const DEUX_PI = 2 * Math.PI;
    // Écart angulaire de « de » à « vers » en tournant dans le sens de l'anneau (0 à 2π). Un tracé qui frôle
    // l'horizon (un sommet à peine caché) donne une sortie et une entrée presque confondues, parfois dans le
    // désordre : un tour presque complet (à FROLE près) vaut alors 0, on relie directement.
    const ecart = (de, vers) => {
      let d = (vers - de) * sens;
      while (d < 0) d += DEUX_PI;
      while (d >= DEUX_PI) d -= DEUX_PI;
      return d > DEUX_PI - FROLE ? 0 : d;
    };
    const arc = (pts, de, vers) => {
      const d = ecart(de, vers), k = Math.ceil(d / PAS_ARC);
      for (let j = 1; j < k; j++) { const t = de + sens * d * j / k; point(pts, Math.cos(t), Math.sin(t), true); }
    };
    for (const depart of frag) {
      if (depart.pris) continue;
      const pts = [];
      let cur = depart;
      for (let garde = 0; garde <= frag.length; garde++) {
        cur.pris = true;
        pts.push(...cur.pts);
        // Entrée suivante le long de l'horizon : un morceau pas encore pris, ou le premier (l'anneau se ferme)
        let suivant = depart, meilleur = ecart(cur.sortie, depart.entree);
        for (const g of frag) {
          if (g.pris) continue;
          const d = ecart(cur.sortie, g.entree);
          if (d < meilleur) { meilleur = d; suivant = g; }
        }
        arc(pts, cur.sortie, suivant.entree);
        if (suivant === depart) break;
        cur = suivant;
      }
      if (pts.length >= 3) morceaux.push('M' + pts.join('L') + 'Z');
    }
  }

  // Un tracé ouvert vu depuis r : coupé là où il passe derrière le globe
  function ligne(v, r, morceaux) {
    const n = v.length / 3;
    const a = [0, 0, 0], b = [0, 0, 0];
    let pts = [];
    const fin = () => { if (pts.length > 1) morceaux.push('M' + pts.join('L')); pts = []; };
    const point = (x, y) => pts.push(arr(r.cx + r.R * x) + ' ' + arr(r.cy - r.R * y));
    for (let i = 0; i < n; i++) {
      tourner(v, i * 3, r, b);
      if (i > 0 && (a[2] > 0) !== (b[2] > 0)) {
        const t = horizon(a, b);
        point(Math.cos(t), Math.sin(t));
        if (a[2] > 0) fin();
      }
      if (b[2] > 0) point(b[0], b[1]);
      a[0] = b[0]; a[1] = b[1]; a[2] = b[2];
    }
    fin();
  }

  function chemin(anneaux, r) {
    const morceaux = [];
    const d = r.dir, c = [0, 0, 0];
    for (const an of anneaux) {
      if (an.c && an.s <= 1) {
        if (an.c[0] * d[0] + an.c[1] * d[1] + an.c[2] * d[2] < -an.s) continue;   // tout derrière le globe
        // Tout hors de l'écran (globe zoomé) : la calotte se projette dans un disque de rayon R·s
        tourner(an.c, 0, r, c);
        const x = r.cx + r.R * c[0], y = r.cy - r.R * c[1], m = r.R * an.s + 2;
        if (c[2] > 0 && (x + m < 0 || x - m > r.largeur || y + m < 0 || y - m > r.hauteur)) continue;
      }
      if (an.ferme) anneau(an.v, r, morceaux, an.sens || 1);
      else ligne(an.v, r, morceaux);
    }
    return morceaux.join('');
  }

  function projeter(lon, lat, r) {
    const out = [0, 0, 0];
    tourner(vecteur(lon, lat), 0, r, out);
    return { x: r.cx + r.R * out[0], y: r.cy - r.R * out[1], z: out[2] };
  }

  function inverser(sx, sy, r) {
    const x = (sx - r.cx) / r.R, y = (r.cy - sy) / r.R, d = x * x + y * y;
    if (d > 1) return null;
    const z = Math.sqrt(1 - d), m = r.m;
    const X = m[0] * x + m[3] * y + m[6] * z, Y = m[1] * x + m[4] * y + m[7] * z, Z = m[2] * x + m[5] * y + m[8] * z;
    return [Math.atan2(Y, X) / RAD, Math.asin(Math.max(-1, Math.min(1, Z))) / RAD];
  }

  // Direction du nord à l'écran, au centre : angle en degrés dans le sens horaire (0 = nord en haut).
  // Pôle au centre : direction indéfinie, null
  function nord(r) {
    const m = r.m, x = m[2], y = m[5];
    return Math.hypot(x, y) < 1e-6 ? null : Math.atan2(x, y) / RAD;
  }

  // Méridiens et parallèles tous les « pas » degrés (tracés ouverts, un point tous les 2°)
  function graticule(pas) {
    const res = [];
    for (let lon = -180; lon < 180; lon += pas) {
      const v = [];
      for (let lat = -90 + pas / 3; lat <= 90 - pas / 3 + 1e-9; lat += 2) v.push(...vecteur(lon, lat));
      res.push({ ferme: false, v: new Float64Array(v) });
    }
    for (let lat = -90 + pas; lat < 90; lat += pas) {
      const v = [];
      for (let lon = -180; lon <= 180; lon += 2) v.push(...vecteur(lon, lat));
      res.push({ ferme: false, v: new Float64Array(v) });
    }
    return res;
  }

  const borner = (v, a, b) => Math.max(a, Math.min(b, v));

  // Point du globe au centre de l'écran : [lon, lat]
  function centre(vue) {
    const m = matrice(vue.q);
    return [Math.atan2(m[7], m[6]) / RAD, Math.asin(borner(m[8], -1, 1)) / RAD];
  }

  const normaliserLon = (lon) => ((lon + 540) % 360) - 180;

  // Même centre et même zoom, mais le nord en haut. Le globe ne penche JAMAIS : toutes les vues passent par là
  // (une rotation libre, comme une boule, a été essayée puis abandonnée : on s'y perd en jouant)
  function redresser(vue) {
    const [lon, lat] = centre(vue);
    return vueVers(lon, lat, vue.zoom);
  }

  // Glisser de (dx, dy) pixels : la longitude suit le geste horizontal, la latitude le geste vertical, bornée aux
  // pôles (butée) ; le nord reste en haut
  function rouler(vue, dx, dy, R) {
    const [lon, lat] = centre(vue), k = 1 / (R || 1) / RAD;
    return vueVers(normaliserLon(lon - dx * k), borner(lat + dy * k, -90, 90), vue.zoom);
  }

  // Vue tournée (même zoom, nord en haut) pour que (lon, lat) se retrouve sous le point (x, y) de l'écran :
  // zoom vers le curseur
  function viser(vue, x, y, lon, lat, largeur, hauteur) {
    let v = vue;
    for (let k = 0; k < 4; k++) {
      const r = cadre(v, largeur, hauteur);
      const p = projeter(lon, lat, r);
      if (p.z <= 0) break;
      const [c0, c1] = centre(v);
      v = vueVers(normaliserLon(c0 - (x - p.x) / r.R / RAD / Math.max(0.2, Math.cos(lat * RAD))),
        borner(c1 + (y - p.y) / r.R / RAD, -90, 90), v.zoom);
    }
    return v;
  }

  // Vue (nord en haut) qui met (lon, lat) au centre, sans changer le zoom
  function amener(vue, lon, lat) {
    return vueVers(lon, lat, vue.zoom);
  }

  // Vue intermédiaire entre v0 et v1 (t de 0 à 1) : le centre suit le plus court chemin (grand cercle) à vitesse
  // régulière, le nord reste en haut, le zoom varie de façon géométrique
  function interpoler(v0, v1, t) {
    const a = v0.q;
    let b = v1.q, d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = b.map((c) => -c); d = -d; }        // le plus court chemin
    let k0 = 1 - t, k1 = t;
    if (d < 0.9995) {
      const th = Math.acos(d), s = Math.sin(th);
      k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s;
    }
    return redresser({ q: unitaire(a.map((c, i) => k0 * c + k1 * b[i])), zoom: v0.zoom * Math.pow(v1.zoom / v0.zoom, t) });
  }

  // Vue qui montre ces cadres : centrée sur leur moyenne, assez zoomée pour que tous tiennent à l'écran
  function vueSur(cadres, largeur, hauteur, zoomMax) {
    const coins = [];
    cadres.forEach(([lon0, lat0, lon1, lat1]) => {
      coins.push([lon0, lat0], [lon1, lat0], [lon0, lat1], [lon1, lat1], [(lon0 + lon1) / 2, (lat0 + lat1) / 2]);
    });
    let sx = 0, sy = 0, sz = 0;
    coins.forEach(([lon, lat]) => { const u = vecteur(lon, lat); sx += u[0]; sy += u[1]; sz += u[2]; });
    const n = Math.hypot(sx, sy, sz);
    if (!coins.length || n < 1e-6) return null;
    const lon = Math.atan2(sy, sx) / RAD, lat = Math.asin(sz / n) / RAD;
    let zoom = 1;
    // Angle maximal entre le centre et un coin : à l'écran, le coin est à R·sin(angle) du centre
    const c = [sx / n, sy / n, sz / n];
    let angle = 0;
    coins.forEach(([lon, lat]) => {
      const u = vecteur(lon, lat);
      angle = Math.max(angle, Math.acos(borner(u[0] * c[0] + u[1] * c[1] + u[2] * c[2], -1, 1)));
    });
    if (angle < Math.PI / 2) {
      const R0 = Math.min(largeur, hauteur) * RAYON;
      const demi = Math.min(largeur, hauteur) / 2 * 0.86;
      zoom = borner(demi / (R0 * Math.max(Math.sin(angle), 1e-3)), 1, zoomMax || 16);
    }
    return vueVers(lon, lat, zoom);
  }

  root.GeoCarte = root.GeoCarte || {};
  root.GeoCarte.globe = { preparer, vecteur, vueVers, cadre, chemin, projeter, inverser, nord, graticule, rouler, viser, amener,
    interpoler, vueSur };
})(typeof window !== 'undefined' ? window : globalThis);
