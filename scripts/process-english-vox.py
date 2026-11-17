"""Bake the helmet/VOX sound into the assets, including previews and game playback.
Original Genex takes stay untouched. No runtime speech service is required.
"""
from pathlib import Path
import json, subprocess, wave, io, hashlib
import numpy as np
from nightlords_vox import render as render_hostile, PROFILE as hostile_profile

root=Path(__file__).resolve().parents[1]
lines=json.loads((root/'docs/i18n/voice/lines.json').read_text())
profiles={
 't0':dict(pitch=.78,tempo=1.28,high=105,low=2900,ring=67,delay=8),
 't1':dict(pitch=.72,tempo=1.37,high=95,low=2700,ring=61,delay=10),
 't2':dict(pitch=.84,tempo=1.19,high=130,low=3150,ring=79,delay=7),
 't3':dict(pitch=.76,tempo=1.30,high=100,low=2800,ring=71,delay=9),
 'command':dict(pitch=.80,tempo=1.25,high=170,low=2900,ring=67,delay=8),
}
out=root/'web/sfx/vox/en';out.mkdir(parents=True,exist_ok=True)
manifest=[];catalog=[]
for line in lines:
 delivery=root/f"docs/i18n/voice/delivery-{line['id']}.json"
 if not delivery.exists(): continue
 delivered=json.loads(delivery.read_text())
 if not delivered.get('files'):continue
 source=root/delivered['files'][0]
 entry={**line,'faction':line.get('faction','imperium'),'sources':{}}
 for unit in (['nightlords'] if line.get('faction')=='nightlords' else [line['unit']] if 'unit' in line else profiles):
  p=hostile_profile if unit=='nightlords' else profiles[unit]
  version='chaos-vox3' if unit=='nightlords' else 'vox2'
  dest=out/f"{unit}-{line['id']}-{version}.mp3"
  if unit=='nightlords': render_hostile(source,dest)
  if not dest.exists():
   # Low resonant voice, compressed radio band, mild nonlinear amplifier,
   # amplitude-modulated metallic layer and short helmet reflections.
   filt=(f"aresample=48000,asetrate={int(48000*p['pitch'])},aresample=48000,atempo={p['tempo']},"
      "silenceremove=start_periods=1:start_duration=0.01:start_threshold=-48dB,"
      f"highpass=f={p['high']},lowpass=f={p['low']},equalizer=f=460:t=q:w=0.8:g=3,"
      "acompressor=threshold=0.1:ratio=5:attack=3:release=80:makeup=2,"
      f"aeval=tanh(val(0)*3.1)/1.6*(0.72+0.28*sin(2*PI*{p['ring']}*t)),"
      f"aecho=0.9:0.7:{p['delay']}|{p['delay']*2}:0.24|0.1,"
      "loudnorm=I=-18:TP=-2:LRA=5,aresample=48000")
   raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(source),'-ac','1','-af',filt,'-f','f32le','-'])
   speech=np.frombuffer(raw,dtype='<f4').copy();sr=48000
   # Fixed squelch opening/closing, not an electronic notification beep.
   prefix=int(.055*sr);suffix=int(.075*sr);x=np.zeros(prefix+len(speech)+suffix,dtype=np.float32)
   x[prefix:prefix+len(speech)]=speech
   rng=np.random.default_rng(int(hashlib.sha256(unit.encode()).hexdigest()[:8],16))
   for start,n,level in [(0,prefix,.055),(prefix+len(speech),suffix,.040)]:
    noise=rng.normal(0,1,n);noise=noise-np.roll(noise,1);noise=np.convolve(noise,np.ones(5)/5,'same')
    env=np.sin(np.linspace(0,np.pi,n))**2
    x[start:start+n]+=noise*env*level
   # Quiet static under the gated transmission, not a permanent background hiss.
   static=rng.normal(0,.0014,len(speech)).astype(np.float32)
   x[prefix:prefix+len(speech)]+=static
   peak=float(np.max(np.abs(x)));x*=min(1,.82/max(.001,peak))
   result=subprocess.run(['ffmpeg','-v','error','-f','f32le','-ar',str(sr),'-ac','1','-i','-','-codec:a','libmp3lame','-q:a','3',str(dest)],input=x.astype('<f4').tobytes(),capture_output=True)
   if result.returncode:raise RuntimeError(result.stderr.decode())
  probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration,size','-of','json',str(dest)]))['format']
  entry['sources'][unit]='/web/sfx/vox/en/'+dest.name
  manifest.append({'id':line['id'],'unit':unit,'text':line['text'],'source':str(source.relative_to(root)),'output':str(dest.relative_to(root)),'deliveryId':delivered['id'],'seconds':float(probe['duration']),'bytes':int(probe['size']),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'profile':p})
 catalog.append(entry)
(root/'docs/i18n/voice/processed-assets.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
# These helmet vocalisations already belong to the game. No new generation.
for id,event,text,file in [('nl-attack-growl','nl-attack','[Battle cry]','armored-growl.ogg'),('nl-death-growl','nl-death','[Muffled death rattle]','armored-death.ogg')]:
 source=root/'web/sfx/nightlords'/file
 if not source.exists(): raise FileNotFoundError(source)
 dest=out/f'nightlords-{id}-chaos-vox3.mp3'
 render_hostile(source,dest)
 catalog.append(dict(id=id,event=event,text=text,faction='nightlords',sources={'nightlords':'/web/sfx/vox/en/'+dest.name}))
code="import type {VoxEvent} from './vox-cues';\nexport const VOX_LINES_EN: {id:string;text:string;unit?:string;faction:'imperium'|'nightlords';event:VoxEvent;sources:Record<string,string>}[] = "+json.dumps(catalog,ensure_ascii=False,indent=2)+";\n"
(root/'web/strategy/vox-assets-en.ts').write_text(code)
print(f'{len(catalog)} lines, {len(manifest)} helmet renders')
