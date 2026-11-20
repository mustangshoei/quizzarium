/* ==========================================================================
   Anotehomy Quizz - engine/tissue.js
   MATÉRIAU DES ORGANES (jeux « Les organes » et « Splanchnologie descriptive ») :
   un MeshPhysicalMaterial de Three.js, retouché (onBeforeCompile) pour donner
   l'aspect d'un tissu vivant, sans aucune texture à charger :
     - vernis (clearcoat) : surface humide, avec les reflets d'un petit studio
       lumineux (carte d'environnement calculée une seule fois, PMREM) ;
     - occlusion ambiante par sommet (attribut « ao » des organes,
       js/data/organ-model.js, calculé par tools/MeshFix.cs) : creux, sillons,
       replis et espaces entre les anses assombris ;
     - grain : relief très fin et légères variations de teinte, tirés d'un
       bruit 3D dans le repère du modèle ; le relief s'estompe quand on
       s'éloigne (pas de scintillement) ;
     - liseré : bord des silhouettes un peu éclairci, comme un tissu
       légèrement translucide.
   Visible des deux côtés : une cavité ouverte (cœur, cardia, bouts des
   conduits) montre sa paroi intérieure au lieu d'un trou.
   tissueMaterial(couleur, ao) : un matériau partagé par couleur (ao : la
   géométrie porte l'attribut « ao » ; sans lui, l'occlusion vaut 1).
   ========================================================================== */
(function (NS) {
  'use strict';

  /* bruit de valeur 3D (hachage sans texture) et perturbation de la normale (comme le relief de Three.js) */
  const GLSL = [
    'varying float vAqAo;',
    'varying vec3 vAqPos;',
    'float aqHash( vec3 p ) {',
    '  p = fract( p * 0.3183099 + 0.1 ); p *= 17.0;',
    '  return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );',
    '}',
    'float aqNoise( vec3 x ) {',
    '  vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );',
    '  return mix( mix( mix( aqHash( i ), aqHash( i + vec3( 1, 0, 0 ) ), f.x ),',
    '                   mix( aqHash( i + vec3( 0, 1, 0 ) ), aqHash( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),',
    '              mix( mix( aqHash( i + vec3( 0, 0, 1 ) ), aqHash( i + vec3( 1, 0, 1 ) ), f.x ),',
    '                   mix( aqHash( i + vec3( 0, 1, 1 ) ), aqHash( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );',
    '}',
    '#ifdef AQ_GRAIN',
    'vec3 aqPerturb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {',
    '  vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );',
    '  vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );',
    '  vec3 R1 = cross( vSigmaY, surf_norm );',
    '  vec3 R2 = cross( surf_norm, vSigmaX );',
    '  float fDet = dot( vSigmaX, R1 ) * faceDirection;',
    '  vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );',
    '  return normalize( abs( fDet ) * surf_norm - vGrad );',
    '}',
    '#endif'
  ].join('\n');

  function patch(shader) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n#ifdef AQ_AO\nattribute float ao;\n#endif\nvarying float vAqAo;\nvarying vec3 vAqPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef AQ_AO\nvAqAo = ao;\n#else\nvAqAo = 1.0;\n#endif\nvAqPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL)
      /* teinte : marbrure douce (± 7 %), creux assombris aussi sous la lumière directe */
      .replace('#include <color_fragment>', [
        '#include <color_fragment>',
        'float aqM = aqNoise( vAqPos * 0.045 ) * 0.6 + aqNoise( vAqPos * 0.13 ) * 0.4;',
        'diffuseColor.rgb *= ( 0.93 + 0.14 * aqM ) * mix( 0.58, 1.0, vAqAo );'].join('\n'))
      /* grain : relief de quelques dixièmes de millimètre, effacé au-delà de 1,2 mm par pixel */
      .replace('#include <normal_fragment_maps>', [
        '#include <normal_fragment_maps>',
        '#ifdef AQ_GRAIN',
        '{',
        '  vec3 aqW = fwidth( vAqPos );',
        '  float aqFade = 1.0 - smoothstep( 0.3, 1.2, max( aqW.x, max( aqW.y, aqW.z ) ) );',
        '  if ( aqFade > 0.0 ) {',
        '    float aqH = aqNoise( vAqPos * 0.55 ) * 0.75 + aqNoise( vAqPos * 1.4 ) * 0.25;',
        '    vec2 aqD = vec2( dFdx( aqH ), dFdy( aqH ) ) * 0.3 * aqFade;',
        '    normal = aqPerturb( - vViewPosition, normal, aqD, faceDirection );',
        '  }',
        '}',
        '#endif'].join('\n'))
      /* liseré : bord des silhouettes légèrement lumineux, de la couleur du tissu */
      .replace('#include <emissivemap_fragment>', [
        '#include <emissivemap_fragment>',
        '{',
        '  float aqRim = 1.0 - abs( dot( normal, normalize( vViewPosition ) ) );',
        '  totalEmissiveRadiance += diffuseColor.rgb * 0.22 * pow( aqRim, 2.5 );',
        '}'].join('\n'))
      /* environnement : surtout des reflets (la lumière d'ambiance vient déjà de l'éclairage de la scène) */
      .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\niblIrradiance *= 0.3;')
      /* occlusion ambiante sur la lumière indirecte et les reflets, comme une carte d'occlusion */
      .replace('#include <aomap_fragment>', [
        '#include <aomap_fragment>',
        'reflectedLight.indirectDiffuse *= vAqAo;',
        '#if defined( USE_CLEARCOAT )',
        '  clearcoatSpecularIndirect *= vAqAo;',
        '#endif',
        '#if defined( USE_ENVMAP ) && defined( STANDARD )',
        '  reflectedLight.indirectSpecular *= computeSpecularOcclusion( saturate( dot( geometryNormal, geometryViewDir ) ), vAqAo, material.roughness );',
        '#endif'].join('\n'));
  }

  /* studio : dôme dégradé (clair en haut, sombre en bas) et trois panneaux lumineux, flouté (PMREM) */
  let env;
  function environment() {
    if (env !== undefined) return env;
    env = null;
    const renderer = NS.renderer && NS.renderer();
    if (!renderer || !THREE.PMREMGenerator) return env;
    try {
      const scene = new THREE.Scene();
      const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
        fragmentShader: 'varying vec3 vP; void main() { float h = normalize( vP ).y;' +
          ' vec3 c = h > 0.0 ? mix( vec3( 0.32, 0.27, 0.30 ), vec3( 1.0, 0.95, 0.9 ), pow( h, 0.8 ) )' +
          ' : mix( vec3( 0.32, 0.27, 0.30 ), vec3( 0.05, 0.04, 0.07 ), pow( - h, 0.6 ) ); gl_FragColor = vec4( c, 1.0 ); }'
      }));
      scene.add(dome);
      const panels = [[7, 5, -8, 10, 8, 7], [5, 4, 11, 3, 6, 3], [10, 3, 0, 5, -12, 3]];
      panels.forEach(([w, h, x, y, z, k]) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
        m.position.set(x, y, z);
        m.lookAt(0, 0, 0);
        scene.add(m);
      });
      const pm = new THREE.PMREMGenerator(renderer);
      env = pm.fromScene(scene, 0.04).texture;
      pm.dispose();
      scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    } catch (e) {
      env = null;
    }
    return env;
  }

  const mats = {};
  function tissueMaterial(color, ao) {
    const key = color + (ao ? ':ao' : '');
    if (mats[key]) return mats[key];
    const renderer = NS.renderer && NS.renderer();
    const grain = !!(renderer && renderer.capabilities.isWebGL2);   /* dérivées (dFdx) : WebGL 2 */
    const m = new THREE.MeshPhysicalMaterial({
      color, roughness: 0.5, metalness: 0,
      clearcoat: 0.5, clearcoatRoughness: 0.32,
      envMap: environment(), envMapIntensity: 0.65,
      side: THREE.DoubleSide
    });
    if (ao) m.defines.AQ_AO = '';         /* defines contient déjà STANDARD et PHYSICAL */
    if (grain) m.defines.AQ_GRAIN = '';
    m.onBeforeCompile = patch;
    m.customProgramCacheKey = () => 'aq-tissue' + (ao ? '-ao' : '') + (grain ? '-g' : '');
    mats[key] = m;
    return m;
  }

  Object.assign(NS, { tissueMaterial });
})(AQ.engine);
