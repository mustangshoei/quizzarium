// ==========================================================================
// MeshFix.cs - réparation et finition des maillages d'organes
// --------------------------------------------------------------------------
//  - Orientation : faces remises vers l'extérieur (volume signé) ;
//  - Holes : bords libres d'un maillage (boucles), et bouchage d'un trou par
//    une pièce en anneaux concentriques, lissée par « fairing » bilaplacien
//    (Kobbelt, 1998) : la pièce prolonge la courbure de la surface autour du
//    trou au lieu de rester plate ;
//  - Subdiv : une étape de subdivision de Loop (1987) : 4 fois plus de
//    triangles, surface lissée (bords conservés) ;
//  - Occlusion : occlusion ambiante par sommet, calculée en lançant des
//    rayons sur l'organe lui-même (arbre de volumes englobants) ; le rendu
//    assombrit ainsi les creux (sillons, replis, entre les anses).
// C# 5 (compilateur de Windows PowerShell 5.1 via Add-Type).
// ==========================================================================
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;

public static class Holes
{
    static long Key(int a, int b) { return ((long)a << 32) | (uint)b; }

    // boucles de bord, chacune dans le sens où la parcourent les triangles qui la bordent
    public static List<List<int>> Loops(Mesh m)
    {
        var dir = new HashSet<long>(Key64.Instance);
        for (int t = 0; t + 2 < m.T.Count; t += 3)
            for (int k = 0; k < 3; k++) dir.Add(Key(m.T[t + k], m.T[t + (k + 1) % 3]));
        var outE = new Dictionary<int, List<int>>();
        for (int t = 0; t + 2 < m.T.Count; t += 3)
            for (int k = 0; k < 3; k++)
            {
                int a = m.T[t + k], b = m.T[t + (k + 1) % 3];
                if (dir.Contains(Key(b, a))) continue;
                List<int> l;
                if (!outE.TryGetValue(a, out l)) { l = new List<int>(); outE[a] = l; }
                l.Add(b);
            }
        var used = new HashSet<long>(Key64.Instance);
        var loops = new List<List<int>>();
        foreach (var kv in outE)
            foreach (int b0 in kv.Value)
            {
                int a0 = kv.Key;
                if (used.Contains(Key(a0, b0))) continue;
                var loop = new List<int>();
                int a = a0, b = b0;
                bool ok = true;
                while (true)
                {
                    used.Add(Key(a, b)); loop.Add(a);
                    if (b == a0) break;
                    List<int> nx; int c = -1;
                    if (outE.TryGetValue(b, out nx)) foreach (int x in nx) if (!used.Contains(Key(b, x))) { c = x; break; }
                    if (c < 0 || loop.Count > 200000) { ok = false; break; }
                    a = b; b = c;
                }
                if (ok && loop.Count >= 3) loops.Add(loop);
            }
        return loops;
    }

    static double Dist(Mesh m, int a, int b)
    {
        double dx = m.P[3 * a] - m.P[3 * b], dy = m.P[3 * a + 1] - m.P[3 * b + 1], dz = m.P[3 * a + 2] - m.P[3 * b + 2];
        return Math.Sqrt(dx * dx + dy * dy + dz * dz);
    }

    // centre d'une boucle et son rayon (plus grande distance d'un de ses sommets au centre)
    public static double Radius(Mesh m, List<int> loop, out double[] c)
    {
        c = new double[3];
        foreach (int v in loop) for (int k = 0; k < 3; k++) c[k] += m.P[3 * v + k];
        for (int k = 0; k < 3; k++) c[k] /= loop.Count;
        double r = 0;
        foreach (int v in loop)
        {
            double dx = m.P[3 * v] - c[0], dy = m.P[3 * v + 1] - c[1], dz = m.P[3 * v + 2] - c[2];
            r = Math.Max(r, Math.Sqrt(dx * dx + dy * dy + dz * dz));
        }
        return r;
    }

    // description des bords libres (journal) : nombre de boucles et rayons des plus grandes
    public static string Describe(Mesh m)
    {
        var loops = Loops(m);
        var rs = new List<double>();
        foreach (var l in loops) { double[] c; rs.Add(Radius(m, l, out c)); }
        rs.Sort(); rs.Reverse();
        var sb = new System.Text.StringBuilder();
        sb.Append(loops.Count);
        for (int i = 0; i < Math.Min(4, rs.Count); i++) sb.Append(string.Format(CultureInfo.InvariantCulture, " {0:0.0}", rs[i]));
        return sb.ToString();
    }

    // bouche les trous dont le rayon est compris entre minR et maxR (mm) ; renvoie leur nombre
    public static int Fill(Mesh m, double minR, double maxR)
    {
        int n = 0;
        foreach (var loop in Loops(m))
        {
            double[] c; double r = Radius(m, loop, out c);
            if (r < minR || r > maxR) continue;
            FillLoop(m, loop, c);
            n++;
        }
        return n;
    }

    static void AddTri(Mesh m, int a, int b, int c) { m.T.Add(a); m.T.Add(b); m.T.Add(c); if (m.Tag.Count > 0) m.Tag.Add(0); }

    // bande de triangles entre deux anneaux fermés A (extérieur) et B (intérieur), paramétrés de 0 à 1 ;
    // A est parcouru à rebours (comme le bord du trou par la pièce), B dans son sens
    static void Zip(Mesh m, int[] A, double[] uA, int[] B, double[] uB)
    {
        int nA = A.Length, nB = B.Length, i = 0, j = 0;
        while (i < nA || j < nB)
        {
            double ta = i < nA ? (i + 1 < nA ? uA[i + 1] : 1.0) : 2.0;
            double tb = j < nB ? (j + 1 < nB ? uB[j + 1] : 1.0) : 2.0;
            if (ta <= tb) { AddTri(m, A[(i + 1) % nA], A[i % nA], B[j % nB]); i++; }
            else { AddTri(m, A[i % nA], B[j % nB], B[(j + 1) % nB]); j++; }
        }
    }

    static void FillLoop(Mesh m, List<int> loop, double[] c)
    {
        int nb = loop.Count;
        var cum = new double[nb + 1];
        for (int i = 0; i < nb; i++) cum[i + 1] = cum[i] + Dist(m, loop[i], loop[(i + 1) % nb]);
        double per = cum[nb], edge = per / nb, R = 0;
        foreach (int v in loop)
        {
            double dx = m.P[3 * v] - c[0], dy = m.P[3 * v + 1] - c[1], dz = m.P[3 * v + 2] - c[2];
            R += Math.Sqrt(dx * dx + dy * dy + dz * dz);
        }
        R /= nb;
        int K = Math.Max(1, Math.Min(40, (int)Math.Round(R / edge)));
        int first = m.VertexCount;
        var rings = new List<int[]>(); var us = new List<double[]>();
        rings.Add(loop.ToArray());
        var u0 = new double[nb];
        for (int i = 0; i < nb; i++) u0[i] = cum[i] / per;
        us.Add(u0);
        for (int k = 1; k < K; k++)
        {
            double s = 1 - (double)k / K;
            int nk = Math.Max(3, (int)Math.Round(nb * s));
            var ring = new int[nk]; var u = new double[nk];
            int seg = 0;
            for (int i = 0; i < nk; i++)
            {
                double t = per * i / nk;
                while (seg < nb - 1 && cum[seg + 1] < t) seg++;
                double f = cum[seg + 1] > cum[seg] ? (t - cum[seg]) / (cum[seg + 1] - cum[seg]) : 0;
                int a = loop[seg], b = loop[(seg + 1) % nb];
                ring[i] = m.VertexCount; u[i] = (double)i / nk;
                for (int q = 0; q < 3; q++)
                {
                    double p = m.P[3 * a + q] + (m.P[3 * b + q] - m.P[3 * a + q]) * f;
                    m.P.Add(c[q] + (p - c[q]) * s);
                }
            }
            rings.Add(ring); us.Add(u);
        }
        int center = m.VertexCount;
        m.P.Add(c[0]); m.P.Add(c[1]); m.P.Add(c[2]);
        for (int k = 0; k + 1 < rings.Count; k++) Zip(m, rings[k], us[k], rings[k + 1], us[k + 1]);
        var last = rings[rings.Count - 1];
        for (int i = 0; i < last.Length; i++) AddTri(m, last[(i + 1) % last.Length], last[i], center);
        Fair(m, loop, first);
    }

    // lissage bilaplacien des sommets ajoutés (first ...) : bord du trou et reste du maillage fixes
    static void Fair(Mesh m, List<int> loop, int first)
    {
        int nv = m.VertexCount;
        var need = new HashSet<int>(loop);
        for (int v = first; v < nv; v++) need.Add(v);
        var adj = new Dictionary<int, HashSet<int>>();
        foreach (int v in need) adj[v] = new HashSet<int>();
        for (int t = 0; t + 2 < m.T.Count; t += 3)
            for (int k = 0; k < 3; k++)
            {
                int a = m.T[t + k];
                if (!need.Contains(a)) continue;
                adj[a].Add(m.T[t + (k + 1) % 3]); adj[a].Add(m.T[t + (k + 2) % 3]);
            }
        var ids = new List<int>(need);
        var nbr = new Dictionary<int, int[]>();
        foreach (int v in ids) nbr[v] = new List<int>(adj[v]).ToArray();
        var U = new Dictionary<int, double[]>();
        foreach (int v in ids) U[v] = new double[3];
        var nu = new Dictionary<int, double>();
        for (int v = first; v < nv; v++)
        {
            double s = 0;
            foreach (int w in nbr[v]) s += 1.0 / Math.Max(1, nbr.ContainsKey(w) ? nbr[w].Length : 6);
            nu[v] = 1 + s / nbr[v].Length;
        }
        for (int it = 0; it < 2500; it++)
        {
            foreach (int v in ids)
            {
                var n = nbr[v]; double x = 0, y = 0, z = 0;
                foreach (int w in n) { x += m.P[3 * w]; y += m.P[3 * w + 1]; z += m.P[3 * w + 2]; }
                var u = U[v];
                u[0] = x / n.Length - m.P[3 * v]; u[1] = y / n.Length - m.P[3 * v + 1]; u[2] = z / n.Length - m.P[3 * v + 2];
            }
            double move = 0;
            for (int v = first; v < nv; v++)
            {
                var n = nbr[v]; double x = 0, y = 0, z = 0;
                foreach (int w in n) { var uw = U[w]; x += uw[0]; y += uw[1]; z += uw[2]; }
                var u = U[v];
                double k = 0.8 / nu[v];
                double dx = (x / n.Length - u[0]) * k, dy = (y / n.Length - u[1]) * k, dz = (z / n.Length - u[2]) * k;
                m.P[3 * v] -= dx; m.P[3 * v + 1] -= dy; m.P[3 * v + 2] -= dz;
                move = Math.Max(move, Math.Abs(dx) + Math.Abs(dy) + Math.Abs(dz));
            }
            if (move < 1e-4) break;
        }
    }
}

public static class Orientation
{
    // volume signé (mm³) du maillage, mesuré depuis son centre : négatif si ses faces regardent vers
    // l'intérieur (cavités de Z-Anatomy modélisées « à l'envers » : canal central, cochlée, vestibule)
    public static double SignedVolume(Mesh m)
    {
        double cx = 0, cy = 0, cz = 0; int n = m.VertexCount;
        for (int i = 0; i < m.P.Count; i += 3) { cx += m.P[i]; cy += m.P[i + 1]; cz += m.P[i + 2]; }
        if (n == 0) return 0;
        cx /= n; cy /= n; cz /= n;
        double v = 0;
        for (int t = 0; t + 2 < m.T.Count; t += 3)
        {
            int a = m.T[t], b = m.T[t + 1], c = m.T[t + 2];
            double ax = m.P[3 * a] - cx, ay = m.P[3 * a + 1] - cy, az = m.P[3 * a + 2] - cz;
            double bx = m.P[3 * b] - cx, by = m.P[3 * b + 1] - cy, bz = m.P[3 * b + 2] - cz;
            double qx = m.P[3 * c] - cx, qy = m.P[3 * c + 1] - cy, qz = m.P[3 * c + 2] - cz;
            v += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx);
        }
        return v / 6;
    }

    // remet les faces vers l'extérieur si besoin ; renvoie true si le maillage a été retourné
    public static bool Outward(Mesh m)
    {
        if (SignedVolume(m) >= 0) return false;
        for (int t = 0; t + 2 < m.T.Count; t += 3) { int x = m.T[t + 1]; m.T[t + 1] = m.T[t + 2]; m.T[t + 2] = x; }
        return true;
    }
}

public static class Subdiv
{
    static long Key(int a, int b) { return a < b ? ((long)a << 32) | (uint)b : ((long)b << 32) | (uint)a; }

    // longueur moyenne des arêtes (mm)
    public static double MeanEdge(Mesh m)
    {
        double s = 0; int n = 0;
        for (int t = 0; t + 2 < m.T.Count; t += 3)
            for (int k = 0; k < 3; k++)
            {
                int a = m.T[t + k], b = m.T[t + (k + 1) % 3];
                double dx = m.P[3 * a] - m.P[3 * b], dy = m.P[3 * a + 1] - m.P[3 * b + 1], dz = m.P[3 * a + 2] - m.P[3 * b + 2];
                s += Math.Sqrt(dx * dx + dy * dy + dz * dz); n++;
            }
        return n > 0 ? s / n : 0;
    }

    // une étape de subdivision de Loop ; arêtes de bord (ou partagées par plus de deux triangles) : règles
    // des courbes (milieu, et sommet 3/4 - 1/8 - 1/8), donc bords et ouvertures conservés
    public static Mesh Loop(Mesh m)
    {
        int nv = m.VertexCount, nt = m.TriCount;
        var edgeId = new Dictionary<long, int>(Key64.Instance);
        var eA = new List<int>(); var eB = new List<int>(); var eC = new List<int>(); var eD = new List<int>(); var eN = new List<int>();
        var triE = new int[nt * 3];
        for (int t = 0; t < nt; t++)
            for (int k = 0; k < 3; k++)
            {
                int a = m.T[3 * t + k], b = m.T[3 * t + (k + 1) % 3], c = m.T[3 * t + (k + 2) % 3];
                long key = Key(a, b); int e;
                if (!edgeId.TryGetValue(key, out e))
                {
                    e = eA.Count; edgeId[key] = e;
                    eA.Add(a); eB.Add(b); eC.Add(c); eD.Add(-1); eN.Add(1);
                }
                else { eN[e]++; if (eN[e] == 2) eD[e] = c; }
                triE[3 * t + k] = e;
            }
        var nbr = new List<int>[nv]; var crease = new List<int>[nv];
        for (int v = 0; v < nv; v++) { nbr[v] = new List<int>(); crease[v] = new List<int>(); }
        for (int e = 0; e < eA.Count; e++)
        {
            nbr[eA[e]].Add(eB[e]); nbr[eB[e]].Add(eA[e]);
            if (eN[e] != 2) { crease[eA[e]].Add(eB[e]); crease[eB[e]].Add(eA[e]); }
        }
        var r = new Mesh();
        for (int v = 0; v < nv; v++)
        {
            double x = m.P[3 * v], y = m.P[3 * v + 1], z = m.P[3 * v + 2];
            if (crease[v].Count == 2)
            {
                int a = crease[v][0], b = crease[v][1];
                x = 0.75 * x + 0.125 * (m.P[3 * a] + m.P[3 * b]);
                y = 0.75 * y + 0.125 * (m.P[3 * a + 1] + m.P[3 * b + 1]);
                z = 0.75 * z + 0.125 * (m.P[3 * a + 2] + m.P[3 * b + 2]);
            }
            else if (crease[v].Count == 0 && nbr[v].Count >= 3)
            {
                int n = nbr[v].Count;
                double beta = n == 3 ? 3.0 / 16 : 3.0 / (8.0 * n);
                double sx = 0, sy = 0, sz = 0;
                foreach (int w in nbr[v]) { sx += m.P[3 * w]; sy += m.P[3 * w + 1]; sz += m.P[3 * w + 2]; }
                x = (1 - n * beta) * x + beta * sx; y = (1 - n * beta) * y + beta * sy; z = (1 - n * beta) * z + beta * sz;
            }
            r.P.Add(x); r.P.Add(y); r.P.Add(z);
        }
        for (int e = 0; e < eA.Count; e++)
        {
            int a = eA[e], b = eB[e];
            for (int k = 0; k < 3; k++)
            {
                double val = eN[e] == 2
                    ? 0.375 * (m.P[3 * a + k] + m.P[3 * b + k]) + 0.125 * (m.P[3 * eC[e] + k] + m.P[3 * eD[e] + k])
                    : 0.5 * (m.P[3 * a + k] + m.P[3 * b + k]);
                r.P.Add(val);
            }
        }
        for (int t = 0; t < nt; t++)
        {
            int a = m.T[3 * t], b = m.T[3 * t + 1], c = m.T[3 * t + 2];
            int ab = nv + triE[3 * t], bc = nv + triE[3 * t + 1], ca = nv + triE[3 * t + 2];
            r.T.Add(a); r.T.Add(ab); r.T.Add(ca);
            r.T.Add(b); r.T.Add(bc); r.T.Add(ab);
            r.T.Add(c); r.T.Add(ca); r.T.Add(bc);
            r.T.Add(ab); r.T.Add(bc); r.T.Add(ca);
        }
        return r;
    }
}

// --------------------------------------------------------------------------
// Occlusion ambiante par sommet
// --------------------------------------------------------------------------
public class Bvh
{
    readonly float[] V; readonly int[] Tr;      // sommets, triangles (indices)
    int[] order;                                 // triangles réordonnés
    float[] bmin, bmax; int[] left, right, start, count;
    int nodes;

    public Bvh(Mesh m)
    {
        V = new float[m.P.Count]; for (int i = 0; i < V.Length; i++) V[i] = (float)m.P[i];
        Tr = m.T.ToArray();
        int nt = Tr.Length / 3;
        order = new int[nt]; for (int i = 0; i < nt; i++) order[i] = i;
        int cap = Math.Max(1, 2 * nt);
        bmin = new float[cap * 3]; bmax = new float[cap * 3]; left = new int[cap]; right = new int[cap]; start = new int[cap]; count = new int[cap];
        var cen = new float[nt * 3];
        for (int t = 0; t < nt; t++)
            for (int k = 0; k < 3; k++) cen[3 * t + k] = (V[3 * Tr[3 * t] + k] + V[3 * Tr[3 * t + 1] + k] + V[3 * Tr[3 * t + 2] + k]) / 3f;
        nodes = 0;
        if (nt > 0) Build(0, nt, cen);
    }

    int Build(int lo, int hi, float[] cen)
    {
        int n = nodes++;
        float x0 = float.MaxValue, y0 = float.MaxValue, z0 = float.MaxValue, x1 = float.MinValue, y1 = float.MinValue, z1 = float.MinValue;
        float cx0 = float.MaxValue, cy0 = float.MaxValue, cz0 = float.MaxValue, cx1 = float.MinValue, cy1 = float.MinValue, cz1 = float.MinValue;
        for (int i = lo; i < hi; i++)
        {
            int t = order[i];
            for (int k = 0; k < 3; k++)
            {
                int v = Tr[3 * t + k];
                float x = V[3 * v], y = V[3 * v + 1], z = V[3 * v + 2];
                if (x < x0) x0 = x; if (y < y0) y0 = y; if (z < z0) z0 = z;
                if (x > x1) x1 = x; if (y > y1) y1 = y; if (z > z1) z1 = z;
            }
            float a = cen[3 * t], b = cen[3 * t + 1], c = cen[3 * t + 2];
            if (a < cx0) cx0 = a; if (b < cy0) cy0 = b; if (c < cz0) cz0 = c;
            if (a > cx1) cx1 = a; if (b > cy1) cy1 = b; if (c > cz1) cz1 = c;
        }
        bmin[3 * n] = x0; bmin[3 * n + 1] = y0; bmin[3 * n + 2] = z0; bmax[3 * n] = x1; bmax[3 * n + 1] = y1; bmax[3 * n + 2] = z1;
        if (hi - lo <= 4) { left[n] = -1; start[n] = lo; count[n] = hi - lo; return n; }
        int ax = 0; float ext = cx1 - cx0;
        if (cy1 - cy0 > ext) { ax = 1; ext = cy1 - cy0; }
        if (cz1 - cz0 > ext) { ax = 2; }
        var keys = new float[hi - lo]; var sub = new int[hi - lo];
        for (int i = lo; i < hi; i++) { keys[i - lo] = cen[3 * order[i] + ax]; sub[i - lo] = order[i]; }
        Array.Sort(keys, sub);
        for (int i = lo; i < hi; i++) order[i] = sub[i - lo];
        int mid = (lo + hi) / 2;
        left[n] = Build(lo, mid, cen);
        right[n] = Build(mid, hi, cen);
        return n;
    }

    // distance du premier triangle touché (rayon o + t d, t dans ]0, tmax]) ; -1 si aucun
    public double Hit(double ox, double oy, double oz, double dx, double dy, double dz, double tmax)
    {
        if (nodes == 0) return -1;
        double best = tmax; bool hit = false;
        double ix = 1 / (Math.Abs(dx) < 1e-12 ? 1e-12 : dx), iy = 1 / (Math.Abs(dy) < 1e-12 ? 1e-12 : dy), iz = 1 / (Math.Abs(dz) < 1e-12 ? 1e-12 : dz);
        var stack = new int[128]; int sp = 0; stack[sp++] = 0;
        while (sp > 0)
        {
            int n = stack[--sp];
            double t0 = (bmin[3 * n] - ox) * ix, t1 = (bmax[3 * n] - ox) * ix;
            double tn = Math.Min(t0, t1), tf = Math.Max(t0, t1);
            t0 = (bmin[3 * n + 1] - oy) * iy; t1 = (bmax[3 * n + 1] - oy) * iy;
            tn = Math.Max(tn, Math.Min(t0, t1)); tf = Math.Min(tf, Math.Max(t0, t1));
            t0 = (bmin[3 * n + 2] - oz) * iz; t1 = (bmax[3 * n + 2] - oz) * iz;
            tn = Math.Max(tn, Math.Min(t0, t1)); tf = Math.Min(tf, Math.Max(t0, t1));
            if (tf < Math.Max(tn, 0) || tn > best) continue;
            if (left[n] < 0)
            {
                for (int i = start[n]; i < start[n] + count[n]; i++)
                {
                    int t = order[i];
                    int a = Tr[3 * t], b = Tr[3 * t + 1], c = Tr[3 * t + 2];
                    double e1x = V[3 * b] - V[3 * a], e1y = V[3 * b + 1] - V[3 * a + 1], e1z = V[3 * b + 2] - V[3 * a + 2];
                    double e2x = V[3 * c] - V[3 * a], e2y = V[3 * c + 1] - V[3 * a + 1], e2z = V[3 * c + 2] - V[3 * a + 2];
                    double px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
                    double det = e1x * px + e1y * py + e1z * pz;
                    if (Math.Abs(det) < 1e-12) continue;
                    double inv = 1 / det;
                    double sx = ox - V[3 * a], sy = oy - V[3 * a + 1], sz = oz - V[3 * a + 2];
                    double u = (sx * px + sy * py + sz * pz) * inv;
                    if (u < 0 || u > 1) continue;
                    double qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
                    double v = (dx * qx + dy * qy + dz * qz) * inv;
                    if (v < 0 || u + v > 1) continue;
                    double t2 = (e2x * qx + e2y * qy + e2z * qz) * inv;
                    if (t2 > 1e-6 && t2 < best) { best = t2; hit = true; }
                }
            }
            else if (sp + 2 <= stack.Length) { stack[sp++] = left[n]; stack[sp++] = right[n]; }
        }
        return hit ? best : -1;
    }
}

public static class Occlusion
{
    // normales des sommets (moyenne des faces, pondérée par l'aire)
    public static double[] Normals(Mesh m)
    {
        var N = new double[m.P.Count];
        for (int t = 0; t + 2 < m.T.Count; t += 3)
        {
            int a = m.T[t], b = m.T[t + 1], c = m.T[t + 2];
            double ux = m.P[3 * b] - m.P[3 * a], uy = m.P[3 * b + 1] - m.P[3 * a + 1], uz = m.P[3 * b + 2] - m.P[3 * a + 2];
            double vx = m.P[3 * c] - m.P[3 * a], vy = m.P[3 * c + 1] - m.P[3 * a + 1], vz = m.P[3 * c + 2] - m.P[3 * a + 2];
            double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            foreach (int v in new[] { a, b, c }) { N[3 * v] += nx; N[3 * v + 1] += ny; N[3 * v + 2] += nz; }
        }
        for (int v = 0; v < N.Length; v += 3)
        {
            double l = Math.Sqrt(N[v] * N[v] + N[v + 1] * N[v + 1] + N[v + 2] * N[v + 2]);
            if (l > 0) { N[v] /= l; N[v + 1] /= l; N[v + 2] /= l; }
        }
        return N;
    }

    // occlusion ambiante de chaque sommet par l'organe lui-même : 0 (creux fermé) à 255 (dégagé).
    // rays : rayons par sommet (hémisphère, répartition en cosinus) ; maxDist : portée (mm)
    public static byte[] Compute(Mesh m, int rays, double maxDist)
    {
        int nv = m.VertexCount;
        var res = new byte[nv];
        if (nv == 0 || m.TriCount == 0) { for (int i = 0; i < nv; i++) res[i] = 255; return res; }
        var bvh = new Bvh(m);
        var N = Normals(m);
        var dirs = new double[rays * 3];
        double golden = Math.PI * (3 - Math.Sqrt(5));
        for (int i = 0; i < rays; i++)
        {
            double u = (i + 0.5) / rays, r = Math.Sqrt(u), phi = i * golden;
            dirs[3 * i] = r * Math.Cos(phi); dirs[3 * i + 1] = r * Math.Sin(phi); dirs[3 * i + 2] = Math.Sqrt(1 - u);
        }
        var ao = new double[nv];
        Parallel.For(0, nv, v =>
        {
            double nx = N[3 * v], ny = N[3 * v + 1], nz = N[3 * v + 2];
            if (nx == 0 && ny == 0 && nz == 0) { ao[v] = 1; return; }
            // repère tangent, tourné d'un angle propre au sommet (décorrèle les rayons)
            double tx, ty, tz;
            if (Math.Abs(nx) < 0.9) { tx = 0; ty = nz; tz = -ny; } else { tx = -nz; ty = 0; tz = nx; }
            double tl = Math.Sqrt(tx * tx + ty * ty + tz * tz); tx /= tl; ty /= tl; tz /= tl;
            double bx = ny * tz - nz * ty, by = nz * tx - nx * tz, bz = nx * ty - ny * tx;
            double ang = (v * 0.61803398875 % 1.0) * 2 * Math.PI, ca = Math.Cos(ang), sa = Math.Sin(ang);
            double ox = m.P[3 * v] + nx * 0.02, oy = m.P[3 * v + 1] + ny * 0.02, oz = m.P[3 * v + 2] + nz * 0.02;
            double occ = 0;
            for (int i = 0; i < rays; i++)
            {
                double lx = dirs[3 * i] * ca - dirs[3 * i + 1] * sa, ly = dirs[3 * i] * sa + dirs[3 * i + 1] * ca, lz = dirs[3 * i + 2];
                double dx = tx * lx + bx * ly + nx * lz, dy = ty * lx + by * ly + ny * lz, dz = tz * lx + bz * ly + nz * lz;
                double t = bvh.Hit(ox, oy, oz, dx, dy, dz, maxDist);
                if (t >= 0) { double f = 1 - t / maxDist; occ += 0.35 + 0.65 * f; }
            }
            ao[v] = 1 - occ / rays;
        });
        // léger lissage le long du maillage (bruit des rayons)
        var nb = new List<int>[nv];
        for (int v = 0; v < nv; v++) nb[v] = new List<int>();
        for (int t = 0; t + 2 < m.T.Count; t += 3)
            for (int k = 0; k < 3; k++) { int a = m.T[t + k], b = m.T[t + (k + 1) % 3]; nb[a].Add(b); nb[b].Add(a); }
        for (int pass = 0; pass < 2; pass++)
        {
            var nx2 = new double[nv];
            for (int v = 0; v < nv; v++)
            {
                if (nb[v].Count == 0) { nx2[v] = ao[v]; continue; }
                double s = 0; foreach (int w in nb[v]) s += ao[w];
                nx2[v] = 0.5 * ao[v] + 0.5 * s / nb[v].Count;
            }
            ao = nx2;
        }
        for (int v = 0; v < nv; v++) res[v] = (byte)Math.Max(0, Math.Min(255, Math.Round(ao[v] * 255)));
        return res;
    }
}
