"""Build small public snapshots once per deployment, independent of visitor count."""
import csv, io, json, math, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor
ROOT=Path(__file__).resolve().parents[1]/'data'
BASE='https://data.gov.lv/dati/dataset/40d80be5-0c09-47c4-80f3-fad4bec19f33/resource/'
NOW=lambda:datetime.now(timezone.utc).isoformat()
def get(url):
    req=urllib.request.Request(url,headers={'User-Agent':'prognoze.lv public data cache'})
    with urllib.request.urlopen(req,timeout=25) as r:
        raw=r.read(12_000_001)
        if len(raw)>12_000_000:raise ValueError('Response too large')
        return raw.decode('utf-8-sig')
def rows(url):return list(csv.DictReader(io.StringIO(get(url))))
def num(v):
    try:
        n=float(v)
        return n if math.isfinite(n) else None
    except (ValueError,TypeError):return None
def hydro():
    stations=rows(BASE+'93fd5e2c-20c4-496e-a920-ff29bda20383/download/hidro_stacijas.csv')
    readings=rows(BASE+'de5f06e9-6f44-497d-8ec2-72a2483608e8/download/hidro_operativie_dati.csv')
    params=rows(BASE+'714ab60d-d93e-4403-b76d-2fb865d15d63/download/hidro_parametri.csv')
    meta={p['ABBREVIATION']:{'lv':p['LV_DESCRIPTION'],'en':p['EN_DESCRIPTION'],'unit':p['MEASUREMENT_UNIT']} for p in params}
    by={}
    for r in readings:
        value=num(r.get('VALUE'));code=r.get('ABBREVIATION')
        if value is None or code not in meta:continue
        time=datetime.strptime(r['DATETIME'],'%Y.%m.%d %H:%M:%S').isoformat()
        by.setdefault(r['STATION_ID'],{}).setdefault(code,[]).append([time,value])
    result=[]
    for st in stations:
        values=by.get(st['STATION_ID']);lat=num(st['GEOGR2']);lon=num(st['GEOGR1'])
        if not values or lat is None or lon is None:continue
        result.append({'id':st['STATION_ID'],'name':st['NAME'],'lat':lat,'lon':lon,'series':{k:sorted(v)[-48:] for k,v in values.items()}})
    if not result:raise ValueError('No hydrological readings')
    return {'stations':result,'parameters':meta,'timeZone':'Europe/Riga','source':'LVĢMC / data.gov.lv','license':'CC0-1.0'}
def warnings():
    root=ET.fromstring(get('https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-latvia'))
    if root.tag!='{http://www.w3.org/2005/Atom}feed':raise ValueError('Invalid warning feed')
    ns={'a':'http://www.w3.org/2005/Atom','c':'urn:oasis:names:tc:emergency:cap:1.2'}
    alerts=[]
    for entry in root.findall('a:entry',ns):
        item={k:entry.findtext('c:'+k,default='',namespaces=ns) for k in ['identifier','areaDesc','event','severity','onset','expires','status','message_type']}
        if item['status']!='Actual' or item['message_type']=='Cancel':continue
        if not item['expires'] or datetime.fromisoformat(item['expires'])<=datetime.now(timezone.utc):continue
        item['title']=entry.findtext('a:title',default='',namespaces=ns)
        # Never interpret an arbitrary feed link as a trusted navigation destination.
        item['url']='https://meteoalarm.org/en/live/'
        alerts.append(item)
    unique={tuple(a[k] for k in ['identifier','areaDesc','event']):a for a in alerts}
    return {'alerts':list(unique.values()),'sourceUpdated':root.findtext('a:updated',namespaces=ns),'source':'MeteoAlarm / EUMETNET members','license':'CC BY 4.0'}
def aurora():
    raw=json.loads(get('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'))
    if not isinstance(raw,list) or len(raw)<2:raise ValueError('Invalid Kp response')
    values=[]
    records=raw if isinstance(raw[0],dict) else [dict(zip(raw[0],r)) for r in raw[1:]]
    for r in records:
        kp=num(r.get('Kp'))
        if kp is not None:values.append({'time':r['time_tag'].replace(' ','T').rstrip('Z')+'Z','kp':kp})
    if not values:raise ValueError('No Kp measurements')
    return {'readings':values[-16:],'source':'NOAA SWPC','kind':'planetary Kp observations'}
def build(name,fn):
    path=ROOT/(name+'.json')
    try:
        result={'fetchedAt':NOW(),'ok':True,**fn()}
        tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8');tmp.replace(path)
        print(name+': OK ('+str(path.stat().st_size)+' bytes)')
    except Exception as e:
        print(name+': unavailable: '+str(e))
        # Do not erase a last successful snapshot or renew its original timestamp.
        if not path.exists():path.write_text(json.dumps({'ok':False,'fetchedAt':NOW(),'error':'Source unavailable'}),encoding='utf-8')
if __name__=='__main__':
    ROOT.mkdir(exist_ok=True)
    with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lambda pair:build(*pair),[('warnings',warnings),('hydro',hydro),('aurora',aurora)]))
