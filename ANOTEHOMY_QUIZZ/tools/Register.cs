// ==========================================================================
// Register.cs - recalage d'un ensemble de maillages sur un autre
// --------------------------------------------------------------------------
// Similitude (rotation, échelle uniforme, translation) trouvée par ICP
// (Iterative Closest Point) symétrique : points tirés au hasard à la surface
// des deux ensembles (proportionnellement à l'aire), paires « plus proche
// voisin » dans les deux sens (arbre k-d), les 15 % de paires les plus
// éloignées écartées, puis meilleure similitude par la méthode de Horn
// (quaternions, 1987). Un rappel vers la rotation nulle évite de faire
// tourner un organe : les deux modèles sont déjà dans le même repère
// anatomique (x = gauche du sujet, y = haut, z = antérieur).
// Sert à poser des organes du Human Reference Atlas (HuBMAP) sur le modèle
// Z-Anatomy, en se fondant sur des repères durs (dents, os, cartilages).
// C# 5 (compilateur de Windows PowerShell 5.1 via Add-Type).
// ==========================================================================
using System;
using System.Collections.Generic;
using System.Globalization;

public static class Reg
{
    // ---------- transformations : 12 nombres [r00 r01 r02 tx ; r10 r11 r12 ty ; r20 r21 r22 tz] ----------
    public static void ApplyPt(double[] T, double x, double y, double z, out double ox, out double oy, out double oz)
    {
        ox = T[0] * x + T[1] * y + T[2] * z + T[3];
        oy = T[4] * x + T[5] * y + T[6] * z + T[7];
        oz = T[8] * x + T[9] * y + T[10] * z + T[11];
    }
    public static void Apply(Mesh m, double[] T)
    {
        for (int i = 0; i < m.P.Count; i += 3)
        {
            double x, y, z;
            ApplyPt(T, m.P[i], m.P[i + 1], m.P[i + 2], out x, out y, out z);
            m.P[i] = x; m.P[i + 1] = y; m.P[i + 2] = z;
        }
    }
    public static double[] ApplyPts(double[] T, double[] p)
    {
        var r = new double[p.Length];
        for (int i = 0; i < p.Length; i += 3) ApplyPt(T, p[i], p[i + 1], p[i + 2], out r[i], out r[i + 1], out r[i + 2]);
        return r;
    }
    public static double ScaleOf(double[] T)
    {
        double det = T[0] * (T[5] * T[10] - T[6] * T[9]) - T[1] * (T[4] * T[10] - T[6] * T[8]) + T[2] * (T[4] * T[9] - T[5] * T[8]);
        return Math.Pow(Math.Abs(det), 1.0 / 3);
    }
    public static double AngleOf(double[] T)
    {
        double s = ScaleOf(T), tr = (T[0] + T[5] + T[10]) / s;
        return Math.Acos(Math.Max(-1, Math.Min(1, (tr - 1) / 2))) * 180 / Math.PI;
    }
    public static string Describe(double[] T)
    {
        return string.Format(CultureInfo.InvariantCulture, "echelle {0:0.000}, rotation {1:0.0} degres", ScaleOf(T), AngleOf(T));
    }

    // ---------- points tirés à la surface (proportionnellement à l'aire), tirage reproductible ----------
    public static double[] Sample(IList<Mesh> ms, int n)
    {
        var cum = new List<double>(); var mi = new List<int>(); var ti = new List<int>();
        double total = 0;
        for (int k = 0; k < ms.Count; k++)
        {
            var m = ms[k];
            for (int t = 0; t + 2 < m.T.Count; t += 3)
            {
                int a = m.T[t], b = m.T[t + 1], c = m.T[t + 2];
                double ux = m.P[3 * b] - m.P[3 * a], uy = m.P[3 * b + 1] - m.P[3 * a + 1], uz = m.P[3 * b + 2] - m.P[3 * a + 2];
                double vx = m.P[3 * c] - m.P[3 * a], vy = m.P[3 * c + 1] - m.P[3 * a + 1], vz = m.P[3 * c + 2] - m.P[3 * a + 2];
                double nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
                total += 0.5 * Math.Sqrt(nx * nx + ny * ny + nz * nz);
                cum.Add(total); mi.Add(k); ti.Add(t);
            }
        }
        if (cum.Count == 0) return new double[0];
        var rnd = new Random(12345);
        var pts = new double[n * 3];
        for (int i = 0; i < n; i++)
        {
            double r = rnd.NextDouble() * total;
            int lo = 0, hi = cum.Count - 1;
            while (lo < hi) { int mid = (lo + hi) / 2; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
            var m = ms[mi[lo]]; int t = ti[lo];
            int a = m.T[t], b = m.T[t + 1], c = m.T[t + 2];
            double r1 = Math.Sqrt(rnd.NextDouble()), r2 = rnd.NextDouble();
            double wa = 1 - r1, wb = r1 * (1 - r2), wc = r1 * r2;
            for (int k = 0; k < 3; k++) pts[3 * i + k] = wa * m.P[3 * a + k] + wb * m.P[3 * b + k] + wc * m.P[3 * c + k];
        }
        return pts;
    }

    static double[] Centroid(double[] p)
    {
        double[] c = { 0, 0, 0 }; int n = p.Length / 3;
        for (int i = 0; i < p.Length; i += 3) { c[0] += p[i]; c[1] += p[i + 1]; c[2] += p[i + 2]; }
        if (n > 0) { c[0] /= n; c[1] /= n; c[2] /= n; }
        return c;
    }
    static double RmsRadius(double[] p)
    {
        var c = Centroid(p); double s = 0; int n = p.Length / 3;
        for (int i = 0; i < p.Length; i += 3) s += (p[i] - c[0]) * (p[i] - c[0]) + (p[i + 1] - c[1]) * (p[i + 1] - c[1]) + (p[i + 2] - c[2]) * (p[i + 2] - c[2]);
        return n > 0 ? Math.Sqrt(s / n) : 0;
    }

    // ---------- arbre k-d (plus proche voisin) ----------
    public class Kd
    {
        double[] p; int[] idx; int[] axis;
        public Kd(double[] pts)
        {
            p = pts; int n = pts.Length / 3; idx = new int[n]; axis = new int[n];
            for (int i = 0; i < n; i++) idx[i] = i;
            Build(0, n, 0);
        }
        void Build(int lo, int hi, int depth)
        {
            if (hi - lo <= 1) return;
            int ax = depth % 3;
            var keys = new double[hi - lo]; var sub = new int[hi - lo];
            for (int i = lo; i < hi; i++) { keys[i - lo] = p[3 * idx[i] + ax]; sub[i - lo] = idx[i]; }
            Array.Sort(keys, sub);
            for (int i = lo; i < hi; i++) idx[i] = sub[i - lo];
            int mid = (lo + hi) / 2;
            axis[mid] = ax;
            Build(lo, mid, depth + 1); Build(mid + 1, hi, depth + 1);
        }
        public int Nearest(double x, double y, double z, out double d2)
        {
            int best = -1; double bd = double.MaxValue;
            Search(0, idx.Length, x, y, z, ref best, ref bd);
            d2 = bd; return best;
        }
        void Search(int lo, int hi, double x, double y, double z, ref int best, ref double bd)
        {
            if (hi <= lo) return;
            int mid = (lo + hi) / 2, i = idx[mid];
            double dx = p[3 * i] - x, dy = p[3 * i + 1] - y, dz = p[3 * i + 2] - z, d = dx * dx + dy * dy + dz * dz;
            if (d < bd) { bd = d; best = i; }
            if (hi - lo == 1) return;
            int ax = axis[mid];
            double q = ax == 0 ? x : ax == 1 ? y : z, diff = q - p[3 * i + ax];
            if (diff < 0) { Search(lo, mid, x, y, z, ref best, ref bd); if (diff * diff < bd) Search(mid + 1, hi, x, y, z, ref best, ref bd); }
            else { Search(mid + 1, hi, x, y, z, ref best, ref bd); if (diff * diff < bd) Search(lo, mid, x, y, z, ref best, ref bd); }
        }
    }

    // ---------- vecteur propre de la plus grande valeur propre d'une matrice symétrique 4 x 4 (Jacobi) ----------
    static double[] TopEigen4(double[,] A)
    {
        var a = (double[,])A.Clone();
        var v = new double[4, 4];
        for (int i = 0; i < 4; i++) v[i, i] = 1;
        for (int sweep = 0; sweep < 60; sweep++)
        {
            double off = 0;
            for (int i = 0; i < 4; i++) for (int j = i + 1; j < 4; j++) off += a[i, j] * a[i, j];
            if (off < 1e-22) break;
            for (int p = 0; p < 4; p++)
                for (int q = p + 1; q < 4; q++)
                {
                    if (Math.Abs(a[p, q]) < 1e-300) continue;
                    double theta = (a[q, q] - a[p, p]) / (2 * a[p, q]);
                    double t = theta == 0 ? 1 : Math.Sign(theta) / (Math.Abs(theta) + Math.Sqrt(theta * theta + 1));
                    double c = 1 / Math.Sqrt(t * t + 1), s = t * c;
                    for (int k = 0; k < 4; k++) { double akp = a[k, p], akq = a[k, q]; a[k, p] = c * akp - s * akq; a[k, q] = s * akp + c * akq; }
                    for (int k = 0; k < 4; k++) { double apk = a[p, k], aqk = a[q, k]; a[p, k] = c * apk - s * aqk; a[q, k] = s * apk + c * aqk; }
                    for (int k = 0; k < 4; k++) { double vkp = v[k, p], vkq = v[k, q]; v[k, p] = c * vkp - s * vkq; v[k, q] = s * vkp + c * vkq; }
                }
        }
        int bi = 0;
        for (int i = 1; i < 4; i++) if (a[i, i] > a[bi, bi]) bi = i;
        return new[] { v[0, bi], v[1, bi], v[2, bi], v[3, bi] };
    }

    // ---------- similitude amenant a[i] sur b[i] (moindres carrés pondérés ; Horn 1987) ----------
    // prior : rappel vers la rotation nulle ; fixedScale > 0 : échelle imposée
    public static double[] Similarity(double[] a, double[] b, double[] w, double prior, double fixedScale)
    {
        int n = a.Length / 3; double sw = 0;
        double[] ca = { 0, 0, 0 }, cb = { 0, 0, 0 };
        for (int i = 0; i < n; i++) { double wi = w == null ? 1 : w[i]; sw += wi; for (int k = 0; k < 3; k++) { ca[k] += wi * a[3 * i + k]; cb[k] += wi * b[3 * i + k]; } }
        for (int k = 0; k < 3; k++) { ca[k] /= sw; cb[k] /= sw; }
        var S = new double[3, 3]; double sa = 0, sb = 0;
        for (int i = 0; i < n; i++)
        {
            double wi = w == null ? 1 : w[i];
            if (wi == 0) continue;
            double ax = a[3 * i] - ca[0], ay = a[3 * i + 1] - ca[1], az = a[3 * i + 2] - ca[2];
            double bx = b[3 * i] - cb[0], by = b[3 * i + 1] - cb[1], bz = b[3 * i + 2] - cb[2];
            S[0, 0] += wi * ax * bx; S[0, 1] += wi * ax * by; S[0, 2] += wi * ax * bz;
            S[1, 0] += wi * ay * bx; S[1, 1] += wi * ay * by; S[1, 2] += wi * ay * bz;
            S[2, 0] += wi * az * bx; S[2, 1] += wi * az * by; S[2, 2] += wi * az * bz;
            sa += wi * (ax * ax + ay * ay + az * az); sb += wi * (bx * bx + by * by + bz * bz);
        }
        var N = new double[4, 4];
        N[0, 0] = S[0, 0] + S[1, 1] + S[2, 2]; N[0, 1] = S[1, 2] - S[2, 1]; N[0, 2] = S[2, 0] - S[0, 2]; N[0, 3] = S[0, 1] - S[1, 0];
        N[1, 1] = S[0, 0] - S[1, 1] - S[2, 2]; N[1, 2] = S[0, 1] + S[1, 0]; N[1, 3] = S[2, 0] + S[0, 2];
        N[2, 2] = -S[0, 0] + S[1, 1] - S[2, 2]; N[2, 3] = S[1, 2] + S[2, 1];
        N[3, 3] = -S[0, 0] - S[1, 1] + S[2, 2];
        for (int i = 0; i < 4; i++) for (int j = 0; j < i; j++) N[i, j] = N[j, i];
        N[0, 0] += prior * Math.Sqrt(sa * sb);
        var q = TopEigen4(N);
        double qw = q[0], qx = q[1], qy = q[2], qz = q[3];
        double[] R = {
            qw * qw + qx * qx - qy * qy - qz * qz, 2 * (qx * qy - qw * qz), 2 * (qx * qz + qw * qy),
            2 * (qx * qy + qw * qz), qw * qw - qx * qx + qy * qy - qz * qz, 2 * (qy * qz - qw * qx),
            2 * (qx * qz - qw * qy), 2 * (qy * qz + qw * qx), qw * qw - qx * qx - qy * qy + qz * qz };
        double s = fixedScale;
        if (s <= 0)
        {
            double num = 0;
            for (int i = 0; i < n; i++)
            {
                double wi = w == null ? 1 : w[i];
                if (wi == 0) continue;
                double ax = a[3 * i] - ca[0], ay = a[3 * i + 1] - ca[1], az = a[3 * i + 2] - ca[2];
                double bx = b[3 * i] - cb[0], by = b[3 * i + 1] - cb[1], bz = b[3 * i + 2] - cb[2];
                num += wi * (bx * (R[0] * ax + R[1] * ay + R[2] * az) + by * (R[3] * ax + R[4] * ay + R[5] * az) + bz * (R[6] * ax + R[7] * ay + R[8] * az));
            }
            s = num / sa;
        }
        var T = new double[12];
        for (int i = 0; i < 3; i++)
        {
            for (int j = 0; j < 3; j++) T[4 * i + j] = s * R[3 * i + j];
            T[4 * i + 3] = cb[i] - (T[4 * i] * ca[0] + T[4 * i + 1] * ca[1] + T[4 * i + 2] * ca[2]);
        }
        return T;
    }

    // ---------- recalage : similitude amenant les maillages src sur les maillages dst ----------
    // prior : rappel vers la rotation nulle (0,2 : faible) ; scaleMin / scaleMax : bornes de l'échelle ;
    // fit : écart moyen final (mm) entre les deux surfaces
    public static double[] Fit(IList<Mesh> src, IList<Mesh> dst, double prior, double scaleMin, double scaleMax, out double fit)
    {
        var a = Sample(src, 8000); var b = Sample(dst, 8000);
        var ca = Centroid(a); var cb = Centroid(b);
        double s0 = Math.Max(scaleMin, Math.Min(scaleMax, RmsRadius(b) / Math.Max(1e-9, RmsRadius(a))));
        var T = new double[] { s0, 0, 0, cb[0] - s0 * ca[0], 0, s0, 0, cb[1] - s0 * ca[1], 0, 0, s0, cb[2] - s0 * ca[2] };
        var kdB = new Kd(b);
        int na = a.Length / 3, nb = b.Length / 3;
        fit = 0;
        for (int it = 0; it < 50; it++)
        {
            var cur = ApplyPts(T, a);
            var kdA = new Kd(cur);
            var pa = new double[(na + nb) * 3]; var pb = new double[(na + nb) * 3]; var dd = new double[na + nb];
            for (int i = 0; i < na; i++)
            {
                double d2; int j = kdB.Nearest(cur[3 * i], cur[3 * i + 1], cur[3 * i + 2], out d2);
                for (int k = 0; k < 3; k++) { pa[3 * i + k] = a[3 * i + k]; pb[3 * i + k] = b[3 * j + k]; }
                dd[i] = d2;
            }
            for (int j = 0; j < nb; j++)
            {
                double d2; int i = kdA.Nearest(b[3 * j], b[3 * j + 1], b[3 * j + 2], out d2);
                for (int k = 0; k < 3; k++) { pa[3 * (na + j) + k] = a[3 * i + k]; pb[3 * (na + j) + k] = b[3 * j + k]; }
                dd[na + j] = d2;
            }
            var sorted = (double[])dd.Clone(); Array.Sort(sorted);
            double cut = sorted[(int)(sorted.Length * 0.85)];
            var w = new double[dd.Length]; double sum = 0;
            for (int i = 0; i < dd.Length; i++) { w[i] = dd[i] <= cut ? 1 : 0; sum += Math.Sqrt(dd[i]); }
            fit = sum / dd.Length;
            var Tn = Similarity(pa, pb, w, prior, 0);
            double s = ScaleOf(Tn);
            if (s < scaleMin || s > scaleMax) Tn = Similarity(pa, pb, w, prior, Math.Max(scaleMin, Math.Min(scaleMax, s)));
            T = Tn;
        }
        return T;
    }
}
