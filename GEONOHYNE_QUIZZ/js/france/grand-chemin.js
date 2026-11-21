/* ==========================================================================
   france/grand-chemin.js — Jeu « Le Grand Chemin » des départements (La France et sa géographie)

   Les règles et tout le déroulement sont dans le moteur commun js/grand-chemin.js (à charger avant) :
   ce fichier n'en donne que la version France. Relier deux départements de voisin en voisin, en
   tapant leur nom ; France métropolitaine continentale uniquement (Corse et Outre-Mer exclus : ils
   n'ont aucune frontière terrestre avec le continent). Le plus grand écart est de 12 sauts (Moselle –
   Pyrénées-Atlantiques, par exemple) ; avec des étapes, 15 sauts au plus.
   Frontières : celles de data/france/infos-departements.js, calculées sur les contours IGN, y compris
   dans les estuaires (ex. Charente-Maritime – Gironde par l'estuaire de la Gironde).
   Sa place dans le menu : { jeu: 'grand-chemin' } dans js/menu.js. Réglages : geonohyne.chemin.*
   ========================================================================== */
(function () {
  'use strict';

  const INFOS = (window.GeoInfos || {})['france-departements'];
  if (!INFOS || !GeoNohyne.grandChemin) {
    console.error('france/grand-chemin.js : data/france/infos-departements.js et js/grand-chemin.js doivent être chargés avant ce fichier');
    return;
  }

  const EXCLUS = new Set(['2A', '2B', '971', '972', '973', '974', '976']);
  const voisins = {};
  Object.keys(INFOS.zones).forEach((c) => {
    if (!EXCLUS.has(c)) voisins[c] = INFOS.zones[c].voisins.filter((v) => !EXCLUS.has(v));
  });

  // Carte : uniquement la métropole continentale, cadrée sur elle (sans encadrés d'Outre-Mer)
  function carte() {
    const c = GeoCarte.obtenir('france-departements');
    const elements = c.elements.filter((e) => voisins[e.code]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    elements.forEach((e) => {
      const n = e.d.match(/-?\d+(?:\.\d+)?/g).map(Number);
      for (let i = 0; i + 1 < n.length; i += 2) {
        x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]);
        y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]);
      }
    });
    const m = 12;
    return Object.assign({}, c, {
      elements,
      cadres: [],
      vue: { x: x0 - m, y: y0 - m, w: x1 - x0 + 2 * m, h: y1 - y0 + 2 * m }
    });
  }

  GeoNohyne.grandChemin({
    id: 'grand-chemin',
    titre: 'Le Grand Chemin',
    icone: '🧭',
    description: 'Reliez deux départements de voisin en voisin, par le chemin le plus court, avec ou sans détours.',
    carte,
    voisins: () => voisins,
    montrerCodes: true,
    mots: { un: 'département', des: 'départements', exclus: '(Corse et Outre-Mer exclus)', ecartMax: () => 'le plus long écart en France' },
    longueurMax: 15,
    reglagesDefaut: { min: 5, max: 12, detours: false, etapes: 2 },
    cles: { mode: 'geonohyne.chemin.mode', reglages: 'geonohyne.chemin.reglages', aide: 'geonohyne.chemin.aide' }
  });
})();
