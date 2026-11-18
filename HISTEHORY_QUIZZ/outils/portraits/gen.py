"""Images génériques (souverain, dame, guerrier, religieux, savant) : gen.py ../../img/generiques
Télécharge chaque source de gen/meta.json (960 px, dans gen/src/, non versionné) et la convertit comme
les portraits, avec son recadrage « coupe » [cx, cy, largeur] (même sens que dans reglages.json).
Sans « coupe » dans meta.json : visage détecté."""
import sys, os, json, time, urllib.request, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from portrait import traite, charge, enregistre
S = os.path.dirname(os.path.abspath(__file__)); DEST = sys.argv[1]; os.makedirs(DEST, exist_ok=True)
UA = {'User-Agent': 'HistehoryQuizz/0.1 (jeu educatif personnel; contact via github.com/mustangshoei)'}
G = json.load(open(S + '/gen/meta.json', encoding='utf-8'))
os.makedirs(S + '/gen/src', exist_ok=True)


def req(u):
    for i in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=60) as r: return r.read()
        except Exception as e:
            print('nouvel essai', e); time.sleep(5 * (i + 1))


for k, m in G.items():
    f = S + '/gen/src/' + k + '.jpg'
    if not (os.path.exists(f) and os.path.getsize(f)):
        d = json.loads(req('https://commons.wikimedia.org/w/api.php?' + urllib.parse.urlencode({
            'action': 'query', 'format': 'json', 'titles': m['titre'], 'prop': 'imageinfo', 'iiprop': 'url|size', 'iiurlwidth': 960})))
        ii = list(d['query']['pages'].values())[0]['imageinfo'][0]
        u = ii.get('thumburl') or ii['url']
        if '/thumb/' not in u:
            # image plus étroite que 960 px : l'API donne l'original, que Commons refuse vite (429) ;
            # on prend la plus grande vignette standard qui y tient, sur thumb.wikimedia.org (voir f3_dl.py)
            s = [x for x in (250, 330, 500) if x < ii['width']]
            chemin = urllib.parse.urlparse(u).path.split('/commons/')[1]            # a/ab/Nom.jpg
            nom = chemin.split('/')[-1]
            if s: u = 'https://thumb.wikimedia.org/wikipedia/commons/thumb/' + chemin + '/' + str(s[-1]) + 'px-' + nom
        open(f, 'wb').write(req(u)); time.sleep(1)
    if len(sys.argv) > 2 and sys.argv[2] == 'telecharger': continue
    out, _, v = traite(charge(f), None, m.get('coupe'))
    enregistre(out, DEST + '/' + k + '.webp'); print(k, 'coupe' if m.get('coupe') else ('visage' if v else 'centre'))
