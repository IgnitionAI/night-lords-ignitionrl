"""Offline Chaos whisper through a narrow helmet radio. Original takes are preserved."""
from pathlib import Path
import hashlib
import subprocess
import numpy as np

PROFILE = {'version': 'chaos-vox3', 'pitch': .82, 'tempo': 1.17,
           'whisper_mix': .78, 'radio_highpass': 340, 'radio_lowpass': 2650}

def ffmpeg_pcm(source, filters):
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(source), '-ac', '1',
                                   '-af', filters, '-ar', '24000', '-f', 'f32le', '-'])
    return np.frombuffer(raw, dtype='<f4').copy()

def whisper(source, rng):
    # Noise excitation follows each short-time spectral envelope. This removes
    # most voiced pitch while retaining formants, consonants and spoken timing.
    n, hop = 1024, 256
    pad = np.pad(source, (n, n))
    win = np.hanning(n)
    result = np.zeros(len(pad)); weight = np.zeros(len(pad))
    for start in range(0, len(pad)-n+1, hop):
        frame = pad[start:start+n] * win
        spectrum = np.fft.rfft(frame)
        cepstrum = np.fft.irfft(np.log(np.abs(spectrum)+1e-7), n=n)
        cepstrum[24:-23] = 0
        envelope = np.exp(np.fft.rfft(cepstrum).real)
        phase = np.angle(np.fft.rfft(rng.normal(0, 1, n)*win))
        noise = np.fft.irfft(envelope*np.exp(1j*phase), n=n)
        noise *= np.sqrt(np.mean(frame*frame)/max(1e-12, np.mean(noise*noise)))
        result[start:start+n] += noise * win
        weight[start:start+n] += win*win
    return (result/np.maximum(weight, .001))[n:n+len(source)]

def render(source: Path, dest: Path):
    if dest.exists(): return
    sr = 24000
    voice = ffmpeg_pcm(source, 'aresample=24000,asetrate=19680,aresample=24000,atempo=1.17,'
                       'silenceremove=start_periods=1:start_duration=0.01:start_threshold=-48dB,'
                       'highpass=f=100,lowpass=f=7000')
    rng = np.random.default_rng(int(hashlib.sha256(source.read_bytes()).hexdigest()[:8], 16))
    breath = whisper(voice, rng)
    # A restrained voiced layer keeps the words intelligible and the character low.
    speech = .78*breath + .22*voice
    speech *= .11/max(.001, np.sqrt(np.mean(speech*speech)))
    speech = np.tanh(speech*2.0)/2.0
    prefix, suffix = int(.075*sr), int(.105*sr)
    x = np.zeros(prefix+len(speech)+suffix)
    x[prefix:prefix+len(speech)] = speech
    # Radio carrier only while transmitting, with a distinct opening/closing squelch.
    x[prefix:prefix+len(speech)] += rng.normal(0, .003, len(speech))
    for start, length, level in [(0, prefix, .12), (prefix+len(speech), suffix, .09)]:
        noise = rng.normal(0, 1, length)
        x[start:start+length] += noise * (np.sin(np.linspace(0, np.pi, length))**2) * level
    filters=('highpass=f=340,lowpass=f=2650,equalizer=f=1550:t=q:w=1:g=3,'
             'acompressor=threshold=0.065:ratio=6:attack=2:release=65:makeup=1.7,'
             'acrusher=bits=10:mix=0.16,'
             'aeval=tanh(val(0)*2.3)/1.8*(0.93+0.07*sin(2*PI*93*t)),'
             'aecho=0.9:0.7:13|29:0.16|0.07,'
             'loudnorm=I=-18:TP=-3:LRA=4,aresample=48000')
    subprocess.run(['ffmpeg', '-v', 'error', '-f', 'f32le', '-ar', str(sr), '-ac', '1',
                    '-i', '-', '-af', filters, '-codec:a', 'libmp3lame', '-q:a', '3', str(dest)],
                   input=x.astype('<f4').tobytes(), check=True)
