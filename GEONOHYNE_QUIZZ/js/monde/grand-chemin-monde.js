/* ==========================================================================
   monde/grand-chemin-monde.js — Jeu « Le Grand Chemin » des pays du monde (Le monde et ses pays)

   Les règles et tout le déroulement sont dans le moteur commun js/grand-chemin.js (à charger avant) :
   ce fichier n'en donne que la version monde. Relier deux pays de voisin en voisin, en tapant leur nom.

   Choix de Théo
     - Frontières terrestres de data/monde/infos-pays.js, TERRITOIRES D'OUTRE-MER COMPRIS : France–Brésil
       et France–Suriname (Guyane), France–Pays-Bas (Saint-Martin), Danemark–Canada (île Hans),
       Espagne–Maroc (Ceuta, Melilla), Royaume-Uni–Espagne (Gibraltar), Royaume-Uni–Chypre (bases).
       Monde entier : un réseau de 155 pays (et Haïti – République dominicaine à part), jusqu'à 18 sauts
       (Lesotho – Papouasie-Nouvelle-Guinée).
     - Les pays sans frontière terrestre (Japon, Australie, Islande…) sont hors du jeu.
     - Réglage « Région » : Monde entier, Europe, Afrique, Asie, Amériques ; seuls les pays de la région
       comptent (continent de infos-pays.js : la Russie est en Europe, la Turquie en Asie, l'Égypte en
       Afrique), les autres sont estompés. Plus grand écart : Europe 9, Afrique, Asie et Amériques 10.
     - Globe par défaut, carte plate au choix (bouton 🌐) ; la vue se cadre sur le départ, l'arrivée et
       les étapes.
   Sa place dans le menu : { jeu: 'grand-chemin-monde' } dans js/menu.js. Réglages : geonohyne.chemin-monde.*
   ========================================================================== */
(function () {
  'use strict';

  const INFOS = (window.GeoInfos || {})['monde-pays'];
  if (!INFOS || !GeoNohyne.grandChemin) {
    console.error('monde/grand-chemin-monde.js : data/monde/infos-pays.js et js/grand-chemin.js doivent être chargés avant ce fichier');
    return;
  }

  const REGIONS = [
    { id: 'monde', nom: 'Monde entier', de: '', continents: null },
    { id: 'europe', nom: 'Europe', de: "d'Europe ", continents: ['Europe'] },
    { id: 'afrique', nom: 'Afrique', de: "d'Afrique ", continents: ['Afrique'] },
    { id: 'asie', nom: 'Asie', de: "d'Asie ", continents: ['Asie'] },
    { id: 'ameriques', nom: 'Amériques', de: 'des Amériques ', continents: ['Amérique du Nord', 'Amérique du Sud'] }
  ];
  const ECARTS = { monde: 'Lesotho – Papouasie-Nouvelle-Guinée', europe: 'Chypre – Grèce', afrique: 'Gambie – Lesotho',
    asie: 'Émirats arabes unis – Timor oriental', ameriques: 'Argentine – Canada' };

  function dansRegion(code, region) {
    const r = REGIONS.find((x) => x.id === region) || REGIONS[0];
    const z = INFOS.zones[code];
    return !r.continents || (!!z && r.continents.includes(z.continent));
  }

  // Réseau de la région : seuls les pays de la région, et leurs voisins dans la région
  function voisins(region) {
    const res = {};
    Object.keys(INFOS.zones).filter((c) => dansRegion(c, region)).forEach((c) => {
      res[c] = (INFOS.zones[c].voisins || []).filter((v) => INFOS.zones[v] && dansRegion(v, region));
    });
    return res;
  }

  GeoNohyne.grandChemin({
    id: 'grand-chemin-monde',
    titre: 'Le Grand Chemin',
    icone: '🧭',
    description: 'Reliez deux pays de voisin en voisin, par le chemin le plus court, avec ou sans détours.',
    carte: () => GeoCarte.obtenir('monde-pays'),
    globe: 'monde-pays-globe',
    idCarte: 'monde-pays',
    voisins,
    regions: REGIONS.map(({ id, nom }) => ({ id, nom })),
    dansRegion,
    cadrerSurArrets: true,
    montrerCodes: false,
    alias: (code) => (INFOS.zones[code] && INFOS.zones[code].alias) || [],
    // « (seuls les pays d'Europe qui ont une frontière terrestre) »
    mots: { un: 'pays', des: 'pays',
      exclus: (region) => '(seuls les pays ' + ((REGIONS.find((r) => r.id === region) || REGIONS[0]).de) + 'qui ont une frontière terrestre)',
      ecartMax: (region) => ECARTS[region] || '' },
    longueurMax: 20,
    reglagesDefaut: { min: 4, max: 10, detours: false, etapes: 2, region: 'monde' },
    cles: { mode: 'geonohyne.chemin-monde.mode', reglages: 'geonohyne.chemin-monde.reglages' }
  });
})();
