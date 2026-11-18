/* ==========================================================================
   modes/premier.js — « Qui est venu en premier ? »

   Deux personnages, chacun dans un grand cadre (portrait en traits blancs à double filet, nom sous un
   filet doré), un losange « VS » entre eux : on clique sur celui qui est né EN PREMIER (ou ← / →). Les deux années s'inscrivent
   alors sur les cartouches, un badge ✓ / ✗ marque les cadres et une mini-frise montre l'écart.

   Partie sans fin, en « mort subite » : elle s'arrête à la première erreur. « Quitter » l'arrête aussi,
   et la série en cours compte. Score = bonnes réponses d'affilée ; un record par niveau
   (HistProfils.record('premier.<niveau>')).

   Après une bonne réponse (la suite arrive seule au bout de DELAI_AUTO, le bouton « Suivant » se
   remplit), l'un des deux personnages reste et l'autre est remplacé. Celui qui reste est tiré au hasard,
   mais personne ne joue plus de MAX_MANCHES manches de suite. Sa date reste affichée : on compare le
   nouveau venu à une date connue. Le nouveau venu entre avec une petite animation.

   Tirage : une « pioche » mélangée de la sélection. Un personnage remplacé ne revient pas avant que tous
   les autres aient été tirés (la pioche ne se remplit de nouveau qu'une fois vide) ; au remélange, la
   moitié la plus récente des entrés passe en fin de pioche, pour qu'aucun ne revienne aussitôt d'un tour
   à l'autre. Jamais deux personnes nées la même année ; si l'une des deux dates est approximative
   (« vers »), au moins ECART_APPROX ans d'écart, pour que la réponse reste sûre.

   Préphase : la période (époques cumulables, interrupteur « Tout / Aucun ») et la difficulté (un seul
   choix : Facile = difficulté 1-2, Moyen = 1-3, Expert = toutes), avec le nombre de personnages sur
   chaque case (croisé avec l'autre filtre). Lancement impossible sous MIN_PERSONNES. Réglages retenus
   (clé histehory.premier.reglages).

   Portraits : js/donnees/portraits.js (HISTEHORY.PORTRAITS) ; sans lui, les cadres restent sans image.
   Styles : css/premier.css (filtres en cases et interrupteur : css/style.css).
   ========================================================================== */
(function () {
  'use strict';

  const H = window.HISTEHORY || {};
  const PERSONNES = H.PERSONNES || [];

  const ECART_APPROX = 15;            // ans d'écart au moins si une date est approximative
  const DELAI_AUTO = 1800;            // ms avant la manche suivante après une bonne réponse
  const MAX_MANCHES = 3;              // manches de suite au plus pour un même personnage
  const MIN_PERSONNES = 3;            // personnages au moins dans la sélection
  const CLE = 'histehory.premier.reglages';
  const NIVEAUX = {
    facile: { titre: 'Facile', aide: 'Les plus connus', max: 2 },
    moyen: { titre: 'Moyen', aide: 'Connus et moins connus', max: 3 },
    expert: { titre: 'Expert', aide: 'Tous les personnages', max: 5 }
  };
  // Époque d'une personne : celle du milieu de sa vie, sauf époque imposée (js/donnees/personnes.js)
  const EPOQUES = () => H.EPOQUES || { antiquite: 'Antiquité', 'moyen-age': 'Moyen Âge', moderne: 'Époque moderne', contemporaine: 'Époque contemporaine' };
  const AIDE_EPOQUE = { antiquite: 'avant 476', 'moyen-age': '476 – 1452', moderne: '1453 – 1788', contemporaine: 'depuis 1789' };
  const ICONES_EPOQUE = { antiquite: '🏛️', 'moyen-age': '🏰', moderne: '⛵', contemporaine: '🏭' };

  const reglages = { niveau: 'facile', epoques: new Set() };
  const cases = { epoques: {}, niveaux: {} };   // valeur -> { bouton, n }
  let bascule = null;                 // interrupteur « Tout / Aucun » des périodes
  let partie = null;
  let minuterie = null;

  const $ = (id) => document.getElementById(id);
  const hasard = (n) => Math.floor(Math.random() * n);
  const nombre = (n) => n.toLocaleString('fr-FR');
  const pluriel = (n, mot) => nombre(n) + ' ' + mot + (n > 1 ? 's' : '');
  function el(balise, classe, texte) {
    const x = document.createElement(balise);
    if (classe) x.className = classe;
    if (texte !== undefined) x.textContent = texte;
    return x;
  }
  function melanger(t) {
    for (let i = t.length - 1; i > 0; i--) { const j = hasard(i + 1); [t[i], t[j]] = [t[j], t[i]]; }
    return t;
  }
  const record = (niveau) => (window.HistProfils && HistProfils.record ? HistProfils.record('premier.' + niveau) : 0);

  /* ---------- Textes ---------- */
  function annee(p) {
    const a = p.naissance < 0 ? -p.naissance + ' av. J.-C.' : String(p.naissance);
    return (p.approx ? 'vers ' : '') + a;
  }
  // « Né en 1451 », « Née vers 1412 », « Né en 52 av. J.-C. » (minuscule : « né en 1451 »)
  const ne = (p, minuscule) => (p.sexe === 'F' ? 'Née ' : 'Né ').replace('N', minuscule ? 'n' : 'N') + (p.approx ? '' : 'en ') + annee(p);
  function periodesTexte(epoques) {
    const noms = EPOQUES();
    return epoques.length === Object.keys(noms).length ? 'Toutes les périodes' : epoques.map((e) => noms[e]).join(', ');
  }

  /* ---------- Portrait : HISTEHORY.PORTRAITS[id] = fichier dans img/ (personne ou image générique) */
  function portrait(p) {
    const f = H.PORTRAITS && H.PORTRAITS[p.id];
    // URL absolue : dans une variable CSS, une URL relative partirait du dossier css/
    return f ? new URL('img/' + f, document.baseURI).href : '';
  }
  function precharger(p) {
    const url = p && portrait(p);
    if (url) new Image().src = url;
  }

  /* ---------- Sélection et tirage ---------- */
  function compatibles(a, b) {
    const d = Math.abs(a.naissance - b.naissance);
    if (d === 0) return false;
    return !(a.approx || b.approx) || d >= ECART_APPROX;
  }
  const passe = (p, niveau, epoques) => p.difficulte <= NIVEAUX[niveau].max && epoques.has(p.epoque);
  const selection = () => PERSONNES.filter((p) => passe(p, reglages.niveau, reglages.epoques));
  // Au moins une paire qu'on peut départager (sinon, impossible de jouer)
  function unePaire(liste) {
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) if (compatibles(liste[i], liste[j])) return true;
    }
    return false;
  }

  // Remet dans la pioche, mélangés, ceux qui n'y sont plus (sauf les personnages à l'écran). Les derniers
  // entrés (partie.recents : la moitié de la sélection) passent après les autres : d'un tour de pioche au
  // suivant, personne ne revient aussitôt.
  function remplir(exclus) {
    const dedans = new Set(partie.pioche.concat(exclus)), recents = new Set(partie.recents);
    const neufs = melanger(partie.vivier.filter((p) => !dedans.has(p)));
    partie.pioche = partie.pioche.concat(neufs.filter((p) => !recents.has(p)), neufs.filter((p) => recents.has(p)));
  }
  // Un personnage entre à l'écran : il rejoint les derniers entrés
  function entrer(p) {
    partie.recents.push(p);
    if (partie.recents.length > partie.nbRecents) partie.recents.shift();
    return p;
  }
  // Place dans la pioche du premier personnage qui se départage d'avec « avec » (-1 : aucun)
  const chercher = (exclus, avec) => partie.pioche.findIndex((p) => !exclus.includes(p) && compatibles(p, avec));

  // Après une bonne réponse : qui reste (au hasard, moins de MAX_MANCHES manches), et qui arrive.
  // On prend d'abord dans ce qui reste de la pioche ; sinon on la remplit ; sinon, deux nouveaux.
  function preparerSuite() {
    const { a, b } = partie.cadres, ecran = [a.p, b.p];
    const restants = melanger(['a', 'b'].filter((c) => partie.cadres[c].manches < MAX_MANCHES));
    for (let tour = 0; tour < 2; tour++) {
      if (tour) remplir(ecran);
      for (const c of restants) {
        const i = chercher(ecran, partie.cadres[c].p);
        if (i >= 0) return { reste: c, nouveaux: [entrer(partie.pioche.splice(i, 1)[0])] };
      }
    }
    const paire = nouvellePaire(ecran) || nouvellePaire([]);
    return paire && { reste: null, nouveaux: paire };
  }

  // Deux personnages qu'on peut départager, pris dans la pioche (remplie si besoin)
  function nouvellePaire(exclus) {
    for (let tour = 0; tour < 2; tour++) {
      if (tour || !partie.pioche.length) remplir(exclus);
      for (const x of partie.pioche) {
        if (exclus.includes(x)) continue;
        const y = partie.pioche.find((p) => p !== x && !exclus.includes(p) && compatibles(x, p));
        if (y) { partie.pioche = partie.pioche.filter((p) => p !== x && p !== y); return [entrer(x), entrer(y)]; }
      }
    }
    return null;
  }

  /* ---------- Réglages mémorisés ---------- */
  function lireReglages() {
    try { const t = JSON.parse(localStorage.getItem(CLE) || 'null'); return t && typeof t === 'object' ? t : null; }
    catch (e) { return null; }
  }
  function sauverReglages() {
    try { localStorage.setItem(CLE, JSON.stringify({ niveau: reglages.niveau, epoques: Array.from(reglages.epoques) })); }
    catch (e) { /* stockage bloqué */ }
  }

  /* ---------- Écran de préphase ---------- */
  // Une case : icône facultative, nom et aide, nombre de personnages à droite
  function caseCarte(classe, icone, nom, aide) {
    const b = el('button', 'puce puce--carte ' + classe);
    b.type = 'button';
    if (icone) b.append(el('span', 'puce__icone', icone));
    const texte = el('span', 'puce__texte');
    texte.append(el('span', 'puce__nom', nom), el('span', 'puce__aide', aide));
    const n = el('span', 'puce__n', '0');
    b.append(texte, n);
    return { bouton: b, n };
  }

  function construirePreparation() {
    const lu = lireReglages() || {};
    if (NIVEAUX[lu.niveau]) reglages.niveau = lu.niveau;
    const cles = Object.keys(EPOQUES());
    const garde = Array.isArray(lu.epoques) ? lu.epoques.filter((e) => cles.includes(e)) : null;
    reglages.epoques = new Set(garde || cles);

    // Période : « Tout ◯ Aucun » (un interrupteur entre les deux mots) et quatre cartes
    const groupe = $('premier-periodes');
    const tete = el('div', 'chrono-groupe__tete');
    const outils = el('span', 'chrono-groupe__outils bascule');
    const toutOuRien = (tout) => { reglages.epoques = new Set(tout ? cles : []); majPreparation(); };
    const bTout = el('button', 'btn-link', 'Tout');
    const bAucun = el('button', 'btn-link', 'Aucun');
    bascule = el('button', 'bascule__interrupteur');
    [bTout, bAucun, bascule].forEach((b) => { b.type = 'button'; });
    bascule.setAttribute('role', 'switch');
    bascule.setAttribute('aria-label', 'Période : tout cocher');
    bTout.addEventListener('click', () => toutOuRien(true));
    bAucun.addEventListener('click', () => toutOuRien(false));
    bascule.addEventListener('click', () => toutOuRien(bascule.dataset.etat !== 'tout'));
    outils.append(bTout, bascule, bAucun);
    tete.append(el('h2', 'config__titre', 'Période'), outils);
    const liste = el('div', 'puces-cartes');
    Object.entries(EPOQUES()).forEach(([e, nom]) => {
      const c = caseCarte('', ICONES_EPOQUE[e], nom, AIDE_EPOQUE[e] || '');
      c.bouton.addEventListener('click', () => {
        if (reglages.epoques.has(e)) reglages.epoques.delete(e); else reglages.epoques.add(e);
        majPreparation();
      });
      cases.epoques[e] = c;
      liste.append(c.bouton);
    });
    groupe.replaceChildren(tete, liste);

    // Difficulté : trois cartes, une seule choisie
    $('premier-niveaux').replaceChildren(...Object.entries(NIVEAUX).map(([k, n]) => {
      const c = caseCarte('puce--niveau', '', n.titre, n.aide);
      c.bouton.addEventListener('click', () => { reglages.niveau = k; majPreparation(); });
      cases.niveaux[k] = c;
      return c.bouton;
    }));
  }

  function majPreparation() {
    // Le nombre d'une case tient compte de l'autre filtre
    const toutes = new Set(Object.keys(EPOQUES()));
    Object.entries(cases.epoques).forEach(([e, c]) => {
      const n = PERSONNES.filter((p) => p.epoque === e && passe(p, reglages.niveau, toutes)).length;
      const actif = reglages.epoques.has(e);
      c.n.textContent = nombre(n);
      c.bouton.classList.toggle('is-active', actif);
      c.bouton.classList.toggle('is-vide', n === 0);
      c.bouton.setAttribute('aria-pressed', actif);
    });
    const coches = reglages.epoques.size;
    const etat = coches === 0 ? 'aucun' : coches === toutes.size ? 'tout' : 'partiel';
    bascule.dataset.etat = etat;
    bascule.setAttribute('aria-checked', etat === 'tout');
    Object.entries(cases.niveaux).forEach(([k, c]) => {
      const n = PERSONNES.filter((p) => passe(p, k, reglages.epoques)).length;
      const actif = k === reglages.niveau;
      c.n.textContent = nombre(n);
      c.bouton.classList.toggle('is-active', actif);
      c.bouton.classList.toggle('is-vide', n === 0);
      c.bouton.setAttribute('aria-pressed', actif);
    });

    const v = selection();
    const jouable = v.length >= MIN_PERSONNES && unePaire(v);
    const r = record(reglages.niveau);
    let texte;
    if (!coches) texte = 'Choisissez au moins une période.';
    else if (!jouable) texte = (v.length ? 'Seulement ' + pluriel(v.length, 'personnage') : 'Aucun personnage') + ' pour ces choix : il en faut au moins ' + MIN_PERSONNES + '.';
    else texte = pluriel(v.length, 'personnage') + ' à tirer' + (r ? ' · votre record en ' + NIVEAUX[reglages.niveau].titre.toLowerCase() + ' : ' + nombre(r) : '') + '.';
    const ligne = $('premier-etat');
    ligne.textContent = texte;
    ligne.classList.toggle('chrono-etat--non', !jouable);
    $('premier-commencer').disabled = !jouable;
    sauverReglages();
  }

  function ouvrir() {
    arreterMinuterie();
    partie = null;
    if (!bascule) construirePreparation();
    majPreparation();
    Histehory.afficher('screen-premier-config');
  }

  /* ---------- Partie ---------- */
  function arreterMinuterie() {
    clearTimeout(minuterie);
    minuterie = null;
    $('premier-suite').classList.remove('btn-auto');
  }

  function demarrer() {
    const vivier = selection();
    if (vivier.length < MIN_PERSONNES) return;
    partie = {
      niveau: reglages.niveau, epoques: Array.from(reglages.epoques), vivier, pioche: [],
      recents: [], nbRecents: Math.floor(vivier.length / 2),
      cadres: {}, score: 0, ancienRecord: record(reglages.niveau), debut: Date.now(),
      repondu: false, suite: null, erreur: null
    };
    const paire = nouvellePaire([]);
    if (!paire) { partie = null; return; }
    partie.cadres.a = { p: paire[0], manches: 1, connu: false };
    partie.cadres.b = { p: paire[1], manches: 1, connu: false };
    Histehory.afficher('screen-premier-jeu');
    manche(['a', 'b']);
  }

  // Le score, et le record à battre (rien s'il n'y en a pas encore) ; dépassé : « Nouveau record ! »
  function majScore() {
    $('premier-score').replaceChildren('Score : ', el('strong', '', nombre(partie.score)));
    const ancien = partie.ancienRecord, battu = ancien > 0 && partie.score > ancien;
    const rec = $('premier-record');
    rec.textContent = battu ? '🏆 Nouveau record !' : ancien ? 'Record : ' + nombre(ancien) : '';
    rec.classList.toggle('is-battu', battu);
  }

  function remplirCadre(cadre, p) {
    const img = portrait(p);
    cadre.style.setProperty('--portrait', img ? 'url("' + img + '")' : 'none');
    cadre.querySelector('.cadre__nom').textContent = p.nom;
    cadre.querySelector('.cadre__info').textContent =
      [p.pays, (H.DOMAINES || {})[p.domaine], (H.EPOQUES || {})[p.epoque]].filter(Boolean).join(' · ');
  }
  // La date : connue (celle de celui qui reste, ou révélée par la réponse), sinon « Né en ? »
  function afficherDate(cadre, x) {
    const date = cadre.querySelector('.cadre__date');
    date.textContent = x.connu ? ne(x.p) : (x.p.sexe === 'F' ? 'Née en ?' : 'Né en ?');
    date.classList.toggle('cadre__date--inconnue', !x.connu);
  }

  // nouveaux : les cadres qui changent de personnage (les deux au départ, puis un seul)
  function manche(nouveaux) {
    arreterMinuterie();
    partie.repondu = false;
    partie.suite = null;
    ['a', 'b'].forEach((c) => {
      const cadre = $('premier-' + c), x = partie.cadres[c];
      cadre.className = 'cadre';
      cadre.disabled = false;
      cadre.querySelector('.cadre__badge').textContent = '';
      if (nouveaux.includes(c)) {
        remplirCadre(cadre, x.p);
        void cadre.offsetWidth;          // relance l'animation d'arrivée
        cadre.classList.add('cadre--arrive');
      }
      afficherDate(cadre, x);
    });
    // Aide à la première manche seulement (sa place reste réservée : rien ne bouge ensuite)
    const souris = window.matchMedia && matchMedia('(hover: hover) and (pointer: fine)').matches;
    const aide = $('premier-aide');
    aide.textContent = souris ? 'Cliquez sur le plus ancien des deux (ou ← / →)' : 'Touchez le plus ancien des deux';
    aide.classList.toggle('hidden', partie.score > 0);
    $('premier-verdict').textContent = '';
    $('premier-verdict').className = 'verdict';
    $('premier-frise').classList.add('hidden');
    $('premier-suite').classList.add('hidden');
    majScore();
  }

  // Mini-frise : la plus ancienne naissance à gauche, l'écart au milieu
  function frise(a, b) {
    const [x, y] = a.naissance < b.naissance ? [a, b] : [b, a];
    const f = $('premier-frise');
    f.querySelector('.frise__debut').textContent = annee(x);
    f.querySelector('.frise__fin').textContent = annee(y);
    // Pas d'année 0 : de 1 av. J.-C. à 1 apr. J.-C., il y a un an
    const ecart = y.naissance - x.naissance - (x.naissance < 0 && y.naissance > 0 ? 1 : 0);
    f.querySelector('.frise__ecart').textContent = pluriel(ecart, 'an');
    f.classList.remove('hidden');
    return ecart;
  }

  function repondre(cote) {
    if (!partie || partie.repondu) return;
    partie.repondu = true;
    const { a, b } = partie.cadres;
    const bon = a.p.naissance < b.p.naissance ? 'a' : 'b';
    const juste = cote === bon;
    a.connu = true;
    b.connu = true;
    ['a', 'b'].forEach((c) => {
      const cadre = $('premier-' + c);
      cadre.disabled = true;
      cadre.classList.remove('cadre--arrive');
      cadre.classList.add(c === bon ? 'cadre--bon' : (c === cote ? 'cadre--faux' : 'cadre--autre'));
      cadre.querySelector('.cadre__badge').textContent = c === bon ? '✓' : (c === cote ? '✗' : '');
      afficherDate(cadre, partie.cadres[c]);
    });
    $('premier-aide').classList.add('hidden');
    const ecart = frise(a.p, b.p);
    const v = $('premier-verdict');
    const suite = $('premier-suite');
    if (juste) {
      partie.score++;
      v.textContent = '✓ Bonne réponse !';
      v.className = 'verdict verdict--bon';
      partie.suite = preparerSuite();
      if (partie.suite) partie.suite.nouveaux.forEach(precharger);
      suite.textContent = partie.suite ? 'Suivant →' : 'Voir le résultat';
    } else {
      const autre = cote === 'a' ? 'b' : 'a';
      partie.erreur = { choisi: partie.cadres[cote].p, bon: partie.cadres[autre].p, ecart };
      v.textContent = '✗ Raté ! La partie s\'arrête.';
      v.className = 'verdict verdict--faux';
      suite.textContent = 'Voir le résultat';
    }
    majScore();
    suite.classList.remove('hidden');
    suite.focus({ preventScroll: true });
    // Bonne réponse : on enchaîne seul (le bouton se remplit pendant l'attente) ; erreur : on lit la frise
    if (juste && partie.suite) {
      suite.style.setProperty('--delai', DELAI_AUTO + 'ms');
      void suite.offsetWidth;
      suite.classList.add('btn-auto');
      minuterie = setTimeout(suivant, DELAI_AUTO);
    }
  }

  function suivant() {
    if (!partie || !partie.repondu) return;
    arreterMinuterie();
    const s = partie.suite;
    if (partie.erreur || !s) { terminer(); return; }
    if (s.reste) {
      const autre = s.reste === 'a' ? 'b' : 'a';
      partie.cadres[s.reste].manches++;
      partie.cadres[autre] = { p: s.nouveaux[0], manches: 1, connu: false };
      manche([autre]);
    } else {
      partie.cadres.a = { p: s.nouveaux[0], manches: 1, connu: false };
      partie.cadres.b = { p: s.nouveaux[1], manches: 1, connu: false };
      manche(['a', 'b']);
    }
  }

  // « Quitter » : la série en cours compte (résultat) ; sans aucune bonne réponse, retour aux réglages
  function quitter() {
    if (partie && (partie.score > 0 || partie.erreur)) terminer();
    else ouvrir();
  }

  /* ---------- Fin ---------- */
  function terminer() {
    arreterMinuterie();
    const p = partie, tempsMs = Date.now() - p.debut;
    const niveau = NIVEAUX[p.niveau].titre, periodes = periodesTexte(p.epoques);
    const toutes = p.epoques.length === Object.keys(EPOQUES()).length;
    const titre = 'Qui est venu en premier ? (' + niveau + (toutes ? '' : ', ' + periodes) + ')';
    const total = p.score + (p.erreur ? 1 : 0);
    if (window.HistProfils && total > 0) {
      HistProfils.enregistrerPartie({ mode: 'premier', titre, score: p.score, total, tempsMs, record: 'premier.' + p.niveau });
    }

    const s = p.score;
    $('premier-fin-titre').textContent = p.erreur ? 'Partie terminée' : 'Partie arrêtée';
    $('premier-fin-score').textContent = nombre(s);
    $('premier-fin-unite').textContent = s > 1 ? 'bonnes réponses d\'affilée' : 'bonne réponse';
    const nouveau = s > p.ancienRecord;
    const rec = $('premier-fin-record');
    rec.textContent = nouveau ? '🏆 Nouveau record' + (p.ancienRecord ? ' (l\'ancien : ' + nombre(p.ancienRecord) + ')' : '') + ' !'
      : 'Votre record : ' + nombre(p.ancienRecord);
    rec.classList.toggle('is-battu', nouveau);
    rec.classList.toggle('hidden', !nouveau && !p.ancienRecord);
    $('premier-fin-message').textContent = s >= 30 ? 'Un vrai historien !' : s >= 20 ? 'Excellent !' : s >= 10 ? 'Bien joué !'
      : s >= 5 ? 'Pas mal, encore un effort.' : 'L\'histoire n\'attend que vous : rejouez !';
    const err = $('premier-fin-erreur');
    // « Vous avez choisi Fernand de Magellan, né en 1480 ; Christophe Colomb est né 29 ans plus tôt (en 1451). »
    if (p.erreur) {
      const e = p.erreur;
      err.textContent = 'Vous avez choisi ' + e.choisi.nom + ', ' + ne(e.choisi, true) + ' ; ' + e.bon.nom + ' est ' +
        (e.bon.sexe === 'F' ? 'née ' : 'né ') + pluriel(e.ecart, 'an') + ' plus tôt (' + (e.bon.approx ? '' : 'en ') + annee(e.bon) + ').';
    }
    err.classList.toggle('hidden', !p.erreur);
    const sec = Math.round(tempsMs / 1000);
    $('premier-fin-detail').textContent = niveau + ' · ' + periodes + ' · ' +
      Math.floor(sec / 60) + ' min ' + String(sec % 60).padStart(2, '0') + ' s';
    partie = null;
    Histehory.afficher('screen-premier-fin');
  }

  /* ---------- Branchements ---------- */
  function init() {
    $('premier-commencer').addEventListener('click', demarrer);
    $('premier-rejouer').addEventListener('click', () => { if (!bascule) construirePreparation(); demarrer(); });
    $('premier-reglages').addEventListener('click', ouvrir);
    $('premier-a').addEventListener('click', () => repondre('a'));
    $('premier-b').addEventListener('click', () => repondre('b'));
    $('premier-suite').addEventListener('click', suivant);
    $('premier-quitter').addEventListener('click', quitter);
    document.addEventListener('keydown', (e) => {
      if (!partie || document.body.dataset.ecran !== 'screen-premier-jeu') return;
      if (!partie.repondu && (e.key === 'ArrowLeft' || e.key === '1')) repondre('a');
      else if (!partie.repondu && (e.key === 'ArrowRight' || e.key === '2')) repondre('b');
      else if (partie.repondu && (e.key === 'Enter' || e.key === ' ') && e.target.id !== 'premier-suite') { e.preventDefault(); suivant(); }
    });
  }

  Histehory.registerMode({
    id: 'premier',
    icone: '🥇',
    titre: 'Qui est venu en premier ?',
    description: 'Deux personnages : lequel est né en premier ? Jusqu\'à la première erreur.',
    ouvrir
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
