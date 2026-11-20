/* ==========================================================================
   Anotehomy Quizz - engine/bvh.js
   LANCER DE RAYON ACCÉLÉRÉ : un arbre de volumes englobants (BVH) par
   géométrie, construit au premier lancer de rayon qui atteint l'objet, puis
   gardé avec elle. accelerate(mesh) remplace Mesh.raycast de Three.js par une
   version qui ne teste que les triangles des boîtes traversées ; le résultat
   est le même pour le jeu : le point touché le plus proche de chaque objet
   (faces arrière ignorées si le matériau n'a qu'une face, comme Three.js).
   Survol, clic et dégagement automatique (peelAmong, js/engine/muscles.js)
   restent ainsi instantanés malgré le million de triangles des organes.
   ========================================================================== */
(function (NS) {
  'use strict';

  const LEAF = 8;      /* triangles au plus par feuille */

  /* réordonne order[lo..hi) pour que order[k] soit le k-ième plus petit selon key (sélection rapide) */
  function select(order, key, lo, hi, k) {
    hi--;
    while (hi > lo) {
      const pivot = key[order[(lo + hi) >> 1]];
      let i = lo, j = hi;
      while (i <= j) {
        while (key[order[i]] < pivot) i++;
        while (key[order[j]] > pivot) j--;
        if (i <= j) { const s = order[i]; order[i] = order[j]; order[j] = s; i++; j--; }
      }
      if (k <= j) hi = j; else if (k >= i) lo = i; else return;
    }
  }

  function build(g) {
    const pos = g.attributes.position.array;
    const index = g.index ? g.index.array : null;
    const nt = index ? index.length / 3 : pos.length / 9;
    const tv = new Uint32Array(nt * 3);
    for (let i = 0; i < nt * 3; i++) tv[i] = index ? index[i] : i;
    const cen = [new Float32Array(nt), new Float32Array(nt), new Float32Array(nt)];
    const tb = new Float32Array(nt * 6);
    for (let t = 0; t < nt; t++) {
      for (let k = 0; k < 3; k++) {
        const a = pos[3 * tv[3 * t] + k], b = pos[3 * tv[3 * t + 1] + k], c = pos[3 * tv[3 * t + 2] + k];
        const lo = Math.min(a, b, c), hi = Math.max(a, b, c);
        tb[6 * t + k] = lo; tb[6 * t + 3 + k] = hi; cen[k][t] = (lo + hi) / 2;
      }
    }
    const order = new Uint32Array(nt);
    for (let i = 0; i < nt; i++) order[i] = i;
    const cap = 4 * Math.ceil(nt / LEAF) + 4;
    const box = new Float32Array(cap * 6), left = new Int32Array(cap), right = new Int32Array(cap);
    const start = new Uint32Array(cap), count = new Uint32Array(cap);
    let n = 0;
    function node(lo, hi) {
      const id = n++;
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      let cx0 = Infinity, cy0 = Infinity, cz0 = Infinity, cx1 = -Infinity, cy1 = -Infinity, cz1 = -Infinity;
      for (let i = lo; i < hi; i++) {
        const t = order[i], o = 6 * t;
        if (tb[o] < x0) x0 = tb[o]; if (tb[o + 1] < y0) y0 = tb[o + 1]; if (tb[o + 2] < z0) z0 = tb[o + 2];
        if (tb[o + 3] > x1) x1 = tb[o + 3]; if (tb[o + 4] > y1) y1 = tb[o + 4]; if (tb[o + 5] > z1) z1 = tb[o + 5];
        const a = cen[0][t], b = cen[1][t], c = cen[2][t];
        if (a < cx0) cx0 = a; if (a > cx1) cx1 = a; if (b < cy0) cy0 = b; if (b > cy1) cy1 = b; if (c < cz0) cz0 = c; if (c > cz1) cz1 = c;
      }
      const k = 6 * id;
      box[k] = x0; box[k + 1] = y0; box[k + 2] = z0; box[k + 3] = x1; box[k + 4] = y1; box[k + 5] = z1;
      if (hi - lo <= LEAF) { left[id] = -1; start[id] = lo; count[id] = hi - lo; return id; }
      const ex = cx1 - cx0, ey = cy1 - cy0, ez = cz1 - cz0;
      const axis = ex >= ey && ex >= ez ? 0 : ey >= ez ? 1 : 2;
      const mid = (lo + hi) >> 1;
      select(order, cen[axis], lo, hi, mid);
      left[id] = node(lo, mid);
      right[id] = node(mid, hi);
      return id;
    }
    if (nt) node(0, nt);
    return { pos, tv, order, box, left, right, start, count, nodes: n, stack: new Int32Array(256) };
  }

  /* triangle le plus proche touché par le rayon (repère de la géométrie) ; cull : 1 faces avant
     seulement, -1 faces arrière seulement, 0 les deux. Renvoie { t, tri } ou null */
  function closest(b, o, d, cull) {
    if (!b.nodes) return null;
    const ox = o.x, oy = o.y, oz = o.z, dx = d.x, dy = d.y, dz = d.z;
    const ix = 1 / dx, iy = 1 / dy, iz = 1 / dz;
    const { pos, tv, order, box, left, right, start, count, stack } = b;
    let best = Infinity, bestTri = -1, sp = 0;
    stack[sp++] = 0;
    while (sp > 0) {
      const id = stack[--sp], k = 6 * id;
      let t0 = (box[k] - ox) * ix, t1 = (box[k + 3] - ox) * ix;
      let tn = Math.min(t0, t1), tf = Math.max(t0, t1);
      t0 = (box[k + 1] - oy) * iy; t1 = (box[k + 4] - oy) * iy;
      tn = Math.max(tn, Math.min(t0, t1)); tf = Math.min(tf, Math.max(t0, t1));
      t0 = (box[k + 2] - oz) * iz; t1 = (box[k + 5] - oz) * iz;
      tn = Math.max(tn, Math.min(t0, t1)); tf = Math.min(tf, Math.max(t0, t1));
      if (tf < Math.max(tn, 0) || tn > best) continue;
      if (left[id] < 0) {
        for (let i = start[id], e = start[id] + count[id]; i < e; i++) {
          const t = order[i], a = 3 * tv[3 * t], bb = 3 * tv[3 * t + 1], c = 3 * tv[3 * t + 2];
          const e1x = pos[bb] - pos[a], e1y = pos[bb + 1] - pos[a + 1], e1z = pos[bb + 2] - pos[a + 2];
          const e2x = pos[c] - pos[a], e2y = pos[c + 1] - pos[a + 1], e2z = pos[c + 2] - pos[a + 2];
          const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
          const det = e1x * px + e1y * py + e1z * pz;
          if (cull === 1 ? det <= 1e-12 : cull === -1 ? det >= -1e-12 : Math.abs(det) < 1e-12) continue;
          const inv = 1 / det, sx = ox - pos[a], sy = oy - pos[a + 1], sz = oz - pos[a + 2];
          const u = (sx * px + sy * py + sz * pz) * inv;
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
          const v = (dx * qx + dy * qy + dz * qz) * inv;
          if (v < 0 || u + v > 1) continue;
          const tt = (e2x * qx + e2y * qy + e2z * qz) * inv;
          if (tt > 1e-9 && tt < best) { best = tt; bestTri = t; }
        }
      } else if (sp + 2 <= stack.length) {
        stack[sp++] = right[id];
        stack[sp++] = left[id];
      }
    }
    return bestTri < 0 ? null : { t: best, tri: bestTri };
  }

  const inv = new THREE.Matrix4(), ray = new THREE.Ray(), sphere = new THREE.Sphere();
  function raycast(raycaster, intersects) {
    const g = this.geometry, mat = this.material;
    if (!g || !g.attributes.position || !mat || Array.isArray(mat)) { THREE.Mesh.prototype.raycast.call(this, raycaster, intersects); return; }
    if (g.boundingSphere === null) g.computeBoundingSphere();
    sphere.copy(g.boundingSphere).applyMatrix4(this.matrixWorld);
    if (!raycaster.ray.intersectsSphere(sphere)) return;
    inv.copy(this.matrixWorld).invert();
    ray.copy(raycaster.ray).applyMatrix4(inv);
    const b = g.userData.bvh || (g.userData.bvh = build(g));
    const h = closest(b, ray.origin, ray.direction, mat.side === THREE.FrontSide ? 1 : mat.side === THREE.BackSide ? -1 : 0);
    if (!h) return;
    const point = ray.at(h.t, new THREE.Vector3()).applyMatrix4(this.matrixWorld);
    const distance = raycaster.ray.origin.distanceTo(point);
    if (distance < raycaster.near || distance > raycaster.far) return;
    intersects.push({ distance, point, object: this, face: null, faceIndex: h.tri });
  }

  /* lancer de rayon accéléré pour ce maillage */
  function accelerate(mesh) { mesh.raycast = raycast; return mesh; }

  Object.assign(NS, { accelerate });
})(AQ.engine);
