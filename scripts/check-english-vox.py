"""Verify the bilingual catalog, delivered takes, processed audio and packaged files."""
from pathlib import Path
import json,hashlib
root=Path(__file__).resolve().parents[1]
def catalog(name):
 s=(root/name).read_text();return json.loads(s[s.index('= [')+2:].strip().rstrip(';'))
fr=catalog('web/strategy/vox-assets.ts');en=catalog('web/strategy/vox-assets-en.ts')
assert len(fr)==len(en)==50
assets=[]
for a,b in zip(fr,en):
 for k in ['id','event','faction','unit']:assert a.get(k)==b.get(k),(a['id'],k)
 assert b['text']
 assert a['sources'].keys()==b['sources'].keys()
 for unit,url in b['sources'].items():
  assert '/vox/en/' in url
  source=root/url.lstrip('/');built=root/'web/dist/assets/sfx/vox/en'/source.name
  assert source.exists() and built.exists(),url
  assert hashlib.sha256(source.read_bytes()).digest()==hashlib.sha256(built.read_bytes()).digest()
  assets.append(str(source.relative_to(root)))
manifest=json.loads((root/'docs/i18n/voice/processed-assets.json').read_text())
assert len(manifest)==168
assert all(0.2<a['seconds']<8.5 for a in manifest)
assert all(a['bytes']>1000 for a in manifest)
ledger=json.loads((root/'docs/i18n/voice/generations.json').read_text())
assert len(ledger)==48 and all(row.get('delivery') for row in ledger)
result={'spokenLines':48,'reusedVocalisations':2,'catalogEntries':len(en),'processedAudioFiles':len(assets),'rawGenerations':len(ledger),'maxSeconds':max(a['seconds'] for a in manifest),'nightLordsProfile':'chaos-vox3','builtFilesIdentical':True,'idsAndEventsPreserved':True,'englishTextMatchesScript':all(next((x['text'] for x in ledger if x['id']==l['id']),l['text'])==l['text'] for l in en)}
(root/'docs/i18n/voice-validation.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
