import json,urllib.request,urllib.parse,time,sys,os,re,html
S=sys.argv[1]; os.makedirs(S+'/src',exist_ok=True)
UA={'User-Agent':'HistehoryQuizz/0.1 (jeu educatif personnel; contact via github.com/mustangshoei)'}
def req(u):
    for i in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(u,headers=UA),timeout=60) as r: return r.read()
        except Exception as e:
            # 429 (trop de requêtes) : attendre ce que Commons demande, sinon de plus en plus longtemps
            ra=getattr(e,'headers',None) and e.headers.get('Retry-After')
            attente=int(ra) if ra and ra.isdigit() else 20*(i+1)
            print('retry',e,attente,'s',flush=True); time.sleep(attente)
W=json.load(open(S+'/wiki.json',encoding='utf-8'))
todo=[o for o in W if o['ok'] and o['image']]
strip=lambda s: html.unescape(re.sub('<[^>]+>','',s or '')).strip()
for i in range(0,len(todo),50):
    ch=todo[i:i+50]
    # 960 px : une largeur standard de Commons (les autres sont vite limitées, erreur 429)
    d=json.loads(req('https://commons.wikimedia.org/w/api.php?'+urllib.parse.urlencode({'action':'query','format':'json','titles':'|'.join('File:'+o['image'] for o in ch),'prop':'imageinfo','iiprop':'url|extmetadata|size|mime','iiurlwidth':960})))
    q=d['query']; norm={x['to']:x['from'] for x in q.get('normalized',[])}
    info={}
    for p in q['pages'].values():
        if 'imageinfo' in p: info[norm.get(p['title'],p['title'])]=p['imageinfo'][0]
    for o in ch:
        ii=info.get('File:'+o['image'])
        if not ii: print('pas info',o['id']); continue
        m=ii.get('extmetadata',{})
        o['licence']=strip(m.get('LicenseShortName',{}).get('value'))
        o['auteur']=strip(m.get('Artist',{}).get('value'))[:200]
        o['page']=ii.get('descriptionurl'); o['thumb']=ii.get('thumburl'); o['largeur']=ii.get('width')
json.dump(W,open(S+'/wiki.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
STANDARD=(250,330,500)   # tailles standard de Commons sous 960 (https://w.wiki/GHai)
def vignette(o):
    """Image plus étroite que 960 px : l'API renvoie l'ORIGINAL, que Commons limite très vite (429,
    10 min d'attente). On prend plutôt la plus grande vignette standard qui tient dans l'image."""
    u=o['thumb'].split('?')[0]
    if '/thumb/' in u or not o.get('largeur'): return o['thumb']
    m=re.match(r'(https://upload\.wikimedia\.org/wikipedia/commons/)(\w/\w\w/)([^/]+\.(?:jpe?g|png|gif))$',u,re.I)
    t=[s for s in STANDARD if s<o['largeur']]
    if not m or not t: return o['thumb']
    # thumb.wikimedia.org (comme les vignettes de l'API) : upload.wikimedia.org refuse vite (429)
    return 'https://thumb.wikimedia.org/wikipedia/commons/thumb/'+m.group(2)+m.group(3)+'/'+str(t[-1])+'px-'+m.group(3)
for n,o in enumerate(todo):
    if not o.get('thumb'): continue
    if n%25==0: print(n,'/',len(todo),flush=True)
    ext=os.path.splitext(urllib.parse.urlparse(o['thumb']).path)[1].lower() or '.jpg'   # sans « ?utm_… »
    f=S+'/src/'+o['id']+ext; o['fichier']=f
    if os.path.exists(f) and os.path.getsize(f): continue
    u=vignette(o)
    # Originaux plus étroits que 250 px (une dizaine) : seul upload.wikimedia.org les sert, et il bloque
    # vite. Ils viennent à la fin, une fois tout le reste téléchargé (« --petits » pour ne faire qu'eux).
    if ('upload.wikimedia' in u) != ('--petits' in sys.argv): continue
    b=req(u)
    if b: open(f,'wb').write(b)
    time.sleep(2)
json.dump(W,open(S+'/wiki.json','w',encoding='utf-8'),ensure_ascii=False,indent=0)
from collections import Counter
print(len(os.listdir(S+'/src')),Counter(o.get('licence') for o in todo).most_common(30))
