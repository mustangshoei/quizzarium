"""Photo, tableau, buste ou gravure -> portrait rectangulaire (3:4) en traits blancs sur fond transparent,
entouré d'un double filet (depuis Histehory 2.2.1 ; avant : médaillon rond de 256 px, voir l'historique git).

traite(rgb, mode, manuel, pleine) -> (image RGBA W x H, mode, visage trouvé ?)
  manuel = [cx, cy, largeur] : centre de la tête en fractions de la largeur (cx) et de la hauteur (cy),
  largeur du cadrage en fraction de la largeur de l'image ; le cadrage 3:4 garde le haut d'un carré de ce
  côté centré sur (cx, cy) et descend plus bas (épaules). Sans réglage : visage détecté (OpenCV).
"""
import cv2, numpy as np, sys, os
from PIL import Image
W, H = 384, 512          # 3:4 ; les cadres du jeu sont grands
MARGE, ECART = 16, 7     # filet épais à MARGE px du bord, filet fin ECART px plus à l'extérieur
DEDANS = MARGE + 8       # la gravure s'arrête à l'intérieur du filet
WEBP = dict(quality=75, alpha_quality=60, method=6)   # ~45 Ko (la transparence compressée suffit)
sm = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))


def court(p):
    """Nom court Windows (sans accent) : OpenCV n'ouvre pas un chemin qui contient « é » (C:\\Users\\Théo…)."""
    if os.name != 'nt': return p
    import ctypes
    b = ctypes.create_unicode_buffer(1024); ctypes.windll.kernel32.GetShortPathNameW(p, b, 1024)
    return b.value or p


casc = [cv2.CascadeClassifier(court(cv2.data.haarcascades + n)) for n in ('haarcascade_frontalface_default.xml', 'haarcascade_profileface.xml')]


def charge(f):
    im = Image.open(f)
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA'); bg = Image.new('RGBA', im.size, (255, 255, 255, 255)); bg.alpha_composite(im); im = bg
    return np.array(im.convert('RGB'))


def visage(g, pleine=False):
    """Le plus grand visage, cherché sur une copie de 500 px de large au plus (la taille pour laquelle les
    réglages ont été faits ; en 960 px, le détecteur prend des oreilles et des drapés pour des visages).
    pleine : sur l'image entière (« pleine »: true dans reglages.json, quand c'est mieux ainsi)."""
    k = 1 if pleine else min(1, 500 / g.shape[1])
    if k < 1: g = cv2.resize(g, (int(g.shape[1] * k), int(g.shape[0] * k)), interpolation=cv2.INTER_AREA)
    h, w = g.shape; best = None
    g2 = cv2.equalizeHist(g)
    for c in casc:
        for im, mn in ((g, 5), (g2, 5), (g, 3)):
            for f in c.detectMultiScale(im, 1.08, mn, minSize=(int(min(h, w) * .07),) * 2):
                if best is None or f[2] > best[2]: best = f
            if best is not None: return best / k
    return best


def coupe(rgb, manuel=None, pleine=False):
    """Découpe 3:4, la tête dans le tiers haut."""
    h, w = rgb.shape[:2]; vis = True
    if manuel:
        lw = manuel[2] * w; cx = manuel[0] * w; cy = manuel[1] * h
    else:
        v = visage(cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY), pleine)
        if v is not None:
            x, y, fw, fh = v; cx = x + fw / 2; cy = y + fh * .5; lw = fw * 2.3
        else:
            vis = False; lw = min(w, h * W / H) * .8; cx = w / 2; cy = h * .32
    lh = lw * H / W; y0 = cy - lh * (.36 if manuel else .38)
    k = min(1, w / lw, h / lh); lw *= k; lh *= k        # rester dans l'image, toujours en 3:4
    x0 = int(np.clip(cx - lw / 2, 0, w - lw)); y0 = int(np.clip(y0, 0, h - lh))
    return rgb[y0:y0 + int(lh), x0:x0 + int(lw)], vis


def taille_douce(c):
    """Lignes obliques dont l'épaisseur suit la lumière, contours creusés, hautes lumières pleines."""
    g = cv2.cvtColor(c, cv2.COLOR_RGB2GRAY)
    g = cv2.createCLAHE(2.0, (4, 4)).apply(g).astype(float)
    lo, hi = np.percentile(g, (4, 99)); L = np.clip((g - lo) / max(1, hi - lo), 0, 1)
    yy, xx = np.mgrid[0:c.shape[0], 0:c.shape[1]] + .5
    Ls = cv2.GaussianBlur(L, (0, 0), 1.3)
    per = 4.4; u = ((xx * .87 + yy * .5) / per) % 1; larg = np.clip(Ls ** 1.1 * 1.05, 0, 1)
    hach = sm(-.18, .18, larg / 2 - np.abs(u - .5))
    hach = np.maximum(hach, sm(.82, .97, Ls))
    e1 = cv2.GaussianBlur(g, (0, 0), 1.3); e2 = cv2.GaussianBlur(g, (0, 0), 2.1)
    bord = sm(.012, .05, (e2 - e1) / 255.)
    return hach * (1 - .85 * bord) * sm(.03, .12, Ls)


def filet(m, ep):
    """Trait rectangulaire à m px du bord, d'épaisseur ep (dessiné 4 fois plus grand : anticrénelé)."""
    k = 4; t = np.zeros((H * k, W * k), np.uint8)
    cv2.rectangle(t, (int(m * k), int(m * k)), (int((W - m) * k), int((H - m) * k)), 255, max(1, int(ep * k)))
    return cv2.resize(t, (W, H), interpolation=cv2.INTER_AREA) / 255.


def traite(rgb, mode=None, manuel=None, pleine=False):
    c, vis = coupe(rgb, manuel, pleine)
    iw, ih = W - 2 * DEDANS, H - 2 * DEDANS
    c = cv2.resize(c, (iw, ih), interpolation=cv2.INTER_AREA)
    a = np.zeros((H, W)); a[DEDANS:DEDANS + ih, DEDANS:DEDANS + iw] = taille_douce(c)
    a = np.maximum(a, .9 * np.maximum(filet(MARGE - ECART, 1.2), filet(MARGE, 2.6)))
    out = np.zeros((H, W, 4), np.uint8); out[..., :3] = 255
    out[..., 3] = np.round(np.clip(a, 0, 1) * 255).astype(np.uint8)
    return out, 'lumiere', vis


def enregistre(out, f):
    Image.fromarray(out).save(f, 'WEBP', **WEBP)


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    o, m, v = traite(charge(src)); enregistre(o, dst); print(m, v)
