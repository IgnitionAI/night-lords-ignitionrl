"""Original deterministic mechanical layers; no audio copied from the reference."""
import math, random, struct, wave, subprocess, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
bank=root/'web/sfx/nightlords'
rng=random.Random(41)
for name,duration in [('armor-tread',.65),('armor-lock',.4),('armor-vibro',.8)]:
    samples=[]
    for i in range(int(48000*duration)):
        t=i/48000
        if name=='armor-tread':
            v=.65*math.sin(2*math.pi*(63*t-12*t*t))*math.exp(-t*9)
            v+=.23*math.sin(2*math.pi*147*t)*math.exp(-t*17)
            v+=.13*rng.uniform(-1,1)*math.exp(-t*36)
            if t>.045: v+=.12*math.sin(2*math.pi*413*(t-.045))*math.exp(-(t-.045)*30)
        elif name=='armor-lock':
            v=.4*math.sin(2*math.pi*87*t)*math.exp(-t*17)
            v+=.24*math.sin(2*math.pi*670*t)*math.exp(-t*42)
            v+=.13*rng.uniform(-1,1)*math.exp(-t*30)
        else:
            env=min(1,t/.04)*min(1,(duration-t)/.08)
            pulse=.7+.3*math.sin(2*math.pi*32*t)
            v=env*pulse*(.25*math.sin(2*math.pi*(82*t+45*t*t))+.12*math.sin(2*math.pi*(164*t+90*t*t))+.05*rng.uniform(-1,1))
        v*=min(1,t/.002)
        samples.append(struct.pack('<h',int(max(-.95,min(.95,v))*32767)))
    tmp=pathlib.Path('/tmp')/(name+'.wav')
    with wave.open(str(tmp),'wb') as w:
        w.setparams((1,2,48000,0,'NONE','not compressed')); w.writeframes(b''.join(samples))
    subprocess.run(['ffmpeg','-y','-v','error','-i',str(tmp),'-c:a','libvorbis','-q:a','5',str(bank/(name+'.ogg'))],check=True)
