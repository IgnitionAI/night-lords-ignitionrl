#!/usr/bin/env python3
"""Bake grimdark Night Lords SFX as WAV, then ffmpeg → OGG Vorbis (+ optional MP3).

All material is original procedural synthesis (CC0 / public domain as published
in this repository). No third-party recordings.
"""
from __future__ import annotations

import math
import os
import random
import struct
import subprocess
import sys
import wave
from pathlib import Path

SR = 44100
ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "web" / "sfx" / "nightlords"
WAV_DIR = OUT_DIR / "_wav"


def clamp(x: float, lo: float = -1.0, hi: float = 1.0) -> float:
    return lo if x < lo else hi if x > hi else x


def env_ad(t: float, a: float, d: float) -> float:
    if t < 0:
        return 0.0
    if t < a:
        return t / a if a > 0 else 1.0
    if t < a + d:
        return 1.0 - (t - a) / d
    return 0.0


def env_exp(t: float, tau: float) -> float:
    return math.exp(-t / tau) if t >= 0 else 0.0


class Noise:
    def __init__(self, seed: int):
        self.rng = random.Random(seed)
        self.prev = 0.0

    def white(self) -> float:
        return self.rng.uniform(-1.0, 1.0)

    def brown(self) -> float:
        self.prev = clamp(self.prev + self.rng.uniform(-0.08, 0.08), -1.0, 1.0)
        return self.prev


def lowpass(x: list[float], alpha: float) -> list[float]:
    y = [0.0] * len(x)
    acc = 0.0
    for i, s in enumerate(x):
        acc += alpha * (s - acc)
        y[i] = acc
    return y


def highpass(x: list[float], alpha: float) -> list[float]:
    y = [0.0] * len(x)
    prev_x = prev_y = 0.0
    for i, s in enumerate(x):
        prev_y = alpha * (prev_y + s - prev_x)
        prev_x = s
        y[i] = prev_y
    return y


def bandpass(x: list[float], lo: float, hi: float) -> list[float]:
    return highpass(lowpass(x, lo), hi)


def saturate(x: float, drive: float = 1.6) -> float:
    return math.tanh(x * drive)


def mix_at(buf: list[float], src: list[float], at: int, gain: float = 1.0) -> None:
    for i, s in enumerate(src):
        j = at + i
        if 0 <= j < len(buf):
            buf[j] += s * gain


def render(seconds: float, fn, seed: int = 1) -> list[float]:
    n = int(seconds * SR)
    nse = Noise(seed)
    out = [0.0] * n
    phase = 0.0
    lfo = 0.0
    state = {"p": 0.0, "lp": 0.0, "hp": 0.0, "n": nse}
    for i in range(n):
        t = i / SR
        out[i] = fn(t, i, state)
    return out


def sine(phase: float) -> float:
    return math.sin(phase)


def osc(state: dict, freq: float, dt: float = 1.0 / SR) -> float:
    state["p"] = (state["p"] + freq * dt) % 1.0
    return math.sin(state["p"] * 2 * math.pi)


def normalize(buf: list[float], peak: float = 0.89) -> list[float]:
    m = max((abs(x) for x in buf), default=1.0)
    if m < 1e-9:
        return buf
    g = peak / m
    return [x * g for x in buf]


def fade(buf: list[float], inn: float = 0.004, out: float = 0.02) -> list[float]:
    ni, no = int(inn * SR), int(out * SR)
    n = len(buf)
    for i in range(min(ni, n)):
        buf[i] *= i / max(1, ni)
    for i in range(min(no, n)):
        buf[n - 1 - i] *= i / max(1, no)
    return buf


def stereo(mono: list[float], width: float = 0.15) -> tuple[list[float], list[float]]:
    nse = Noise(99)
    L, R = [], []
    d = int(0.0008 * SR)
    for i, s in enumerate(mono):
        w = nse.white() * width * 0.04
        L.append(s + w)
        j = i - d
        R.append((mono[j] if j >= 0 else s) - w)
    return L, R


def write_wav(path: Path, buf: list[float] | tuple[list[float], list[float]], stereo_pair: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if stereo_pair and isinstance(buf, tuple):
        L, R = buf
        n = min(len(L), len(R))
        with wave.open(str(path), "w") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            frames = bytearray()
            for i in range(n):
                frames += struct.pack("<hh", int(clamp(L[i]) * 32767), int(clamp(R[i]) * 32767))
            w.writeframes(frames)
    else:
        mono = buf if not isinstance(buf, tuple) else [(a + b) * 0.5 for a, b in zip(*buf)]
        with wave.open(str(path), "w") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            frames = bytearray()
            for s in mono:
                frames += struct.pack("<h", int(clamp(s) * 32767))
            w.writeframes(frames)


def encode(wav: Path, ogg: Path, mp3: Path | None = None) -> None:
    subprocess.check_call(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav),
         "-c:a", "libvorbis", "-q:a", "3", str(ogg)],
    )
    if mp3 is not None:
        subprocess.check_call(
            ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav),
             "-c:a", "libmp3lame", "-q:a", "6", str(mp3)],
        )


# --- instruments ----------------------------------------------------------------

def bolter_shot() -> list[float]:
    nse = Noise(7)
    n = int(0.55 * SR)
    buf = [0.0] * n
    # body: decaying body + click
    p1 = p2 = 0.0
    lp = 0.0
    for i in range(n):
        t = i / SR
        p1 += 118 * (1 - 0.55 * min(1, t / 0.08)) / SR
        p2 += 52 / SR
        body = math.sin(p1 * 2 * math.pi) * env_exp(t, 0.055) * 0.9
        sub = math.sin(p2 * 2 * math.pi) * env_exp(t, 0.09) * 0.7
        click = nse.white() * env_exp(t, 0.012) * 0.55
        lp += 0.22 * (body + sub + click - lp)
        buf[i] = saturate(lp * 1.8 + click * 0.4)
    # brass muzzle
    metal = [0.0] * n
    p = 0.0
    for i in range(n):
        t = i / SR
        p += (2100 + 400 * math.sin(t * 40)) / SR
        metal[i] = math.sin(p * 2 * math.pi) * env_exp(t, 0.035) * 0.22
        metal[i] += nse.white() * env_exp(t, 0.018) * 0.18
    mix_at(buf, metal, 0)
    return fade(normalize(buf, 0.95), 0.0005, 0.08)


def bolter_echo() -> list[float]:
    src = bolter_shot()
    n = int(1.35 * SR)
    buf = [0.0] * n
    delays = [(int(0.11 * SR), 0.42), (int(0.23 * SR), 0.28), (int(0.41 * SR), 0.16), (int(0.62 * SR), 0.09)]
    for d, g in delays:
        filtered = lowpass(src, 0.18 + g)
        mix_at(buf, filtered, d, g)
    # corridor slap
    nse = Noise(3)
    for i in range(int(0.04 * SR), min(n, int(0.9 * SR))):
        t = i / SR
        buf[i] += nse.white() * 0.03 * env_exp(t - 0.04, 0.25)
    return fade(normalize(lowpass(buf, 0.35), 0.7), 0.01, 0.12)


def bolter_casing() -> list[float]:
    nse = Noise(21)
    n = int(0.42 * SR)
    buf = [0.0] * n
    times = [0.0, 0.07, 0.13, 0.21]
    for k, t0 in enumerate(times):
        p = 0.0
        f0 = 2400 + k * 180
        for i in range(n):
            t = i / SR - t0
            if t < 0 or t > 0.12:
                continue
            p += (f0 * (1 - t * 4)) / SR
            ping = math.sin(p * 2 * math.pi) * env_exp(t, 0.028) * (0.35 - k * 0.05)
            buf[i] += ping + nse.white() * env_exp(t, 0.008) * 0.2
    return fade(normalize(highpass(buf, 0.92), 0.55), 0.001, 0.05)


def bolter_explode() -> list[float]:
    nse = Noise(44)
    n = int(0.85 * SR)
    buf = [0.0] * n
    lp = 0.0
    p = 0.0
    for i in range(n):
        t = i / SR
        p += (48 + 12 * env_exp(t, 0.12)) / SR
        boom = math.sin(p * 2 * math.pi) * env_exp(t, 0.14)
        grit = nse.brown() * env_exp(t, 0.09)
        crack = nse.white() * env_exp(t, 0.02)
        lp += 0.12 * (boom * 0.9 + grit * 0.7 + crack * 0.4 - lp)
        buf[i] = saturate(lp * 2.1)
    # shrapnel
    for k in range(8):
        t0 = 0.02 + k * 0.018
        f = 900 + k * 220
        p = 0.0
        for i in range(n):
            t = i / SR - t0
            if 0 <= t < 0.08:
                p += f / SR
                buf[i] += math.sin(p * 2 * math.pi) * env_exp(t, 0.02) * 0.08
    return fade(normalize(buf, 0.92), 0.001, 0.1)


def claw_crackle() -> list[float]:
    nse = Noise(90)
    n = int(0.55 * SR)
    buf = [0.0] * n
    for i in range(n):
        t = i / SR
        burst = 1.0 if nse.rng.random() < 0.08 * env_ad(t, 0.02, 0.4) else 0.0
        spark = nse.white() * burst
        buzz = math.sin(t * 2 * math.pi * 58) * 0.15 * env_ad(t, 0.01, 0.5)
        buf[i] = spark * 0.9 + buzz
    buf = bandpass(buf, 0.55, 0.86)
    return fade(normalize(buf, 0.7), 0.002, 0.08)


def claw_swoosh() -> list[float]:
    nse = Noise(12)
    n = int(0.38 * SR)
    buf = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        # rising then falling noise, Doppler-ish
        fshape = env_ad(t, 0.12, 0.22)
        lp += (0.08 + 0.5 * fshape) * (nse.white() - lp)
        buf[i] = lp * fshape
    return fade(normalize(buf, 0.62), 0.01, 0.04)


def claw_metal() -> list[float]:
    nse = Noise(5)
    n = int(0.5 * SR)
    buf = [0.0] * n
    freqs = [310, 467, 812, 1220, 1850]
    phases = [0.0] * len(freqs)
    for i in range(n):
        t = i / SR
        s = nse.white() * env_exp(t, 0.012) * 0.5
        for k, f in enumerate(freqs):
            phases[k] += f * (1 - 0.15 * t) / SR
            s += math.sin(phases[k] * 2 * math.pi) * env_exp(t, 0.07 + k * 0.01) * (0.28 / (k + 1))
        buf[i] = saturate(s, 1.3)
    return fade(normalize(buf, 0.85), 0.0008, 0.08)


def fist_impact() -> list[float]:
    nse = Noise(2)
    n = int(0.7 * SR)
    buf = [0.0] * n
    p = 0.0
    lp = 0.0
    for i in range(n):
        t = i / SR
        p += (32 + 8 * env_exp(t, 0.08)) / SR
        thud = math.sin(p * 2 * math.pi) * env_exp(t, 0.16)
        body = nse.brown() * env_exp(t, 0.12)
        click = nse.white() * env_exp(t, 0.008) * 0.25
        lp += 0.08 * (thud * 1.2 + body * 0.9 - lp)
        buf[i] = saturate(lp * 2.4 + click, 2.0)
    return fade(normalize(buf, 0.95), 0.0004, 0.12)


def term_step(variant: int) -> list[float]:
    nse = Noise(30 + variant)
    n = int(0.48 * SR)
    buf = [0.0] * n
    p = 0.0
    f0 = 70 + variant * 6
    for i in range(n):
        t = i / SR
        p += f0 / SR
        boot = math.sin(p * 2 * math.pi) * env_exp(t, 0.07)
        plate = nse.white() * env_exp(t, 0.018) * 0.45
        grit = nse.brown() * env_exp(t, 0.06) * 0.5
        buf[i] = saturate(boot * 1.1 + plate + grit, 1.5)
    # late plate rattle
    p2 = 0.0
    for i in range(n):
        t = i / SR - 0.05
        if t > 0:
            p2 += (420 + variant * 40) / SR
            buf[i] += math.sin(p2 * 2 * math.pi) * env_exp(t, 0.04) * 0.12
    return fade(normalize(buf, 0.8), 0.001, 0.08)


def term_servo() -> list[float]:
    nse = Noise(61)
    n = int(1.6 * SR)
    buf = [0.0] * n
    p = 0.0
    for i in range(n):
        t = i / SR
        load = 0.55 + 0.45 * math.sin(t * 2 * math.pi * 0.7)
        p += (38 + 22 * load) / SR
        whine = math.sin(p * 2 * math.pi) + 0.3 * math.sin(p * 4 * math.pi)
        grind = nse.brown() * 0.25
        buf[i] = (whine * 0.35 + grind) * (0.4 + 0.6 * load)
    return fade(normalize(lowpass(buf, 0.25), 0.45), 0.05, 0.12)


def term_hydraulic() -> list[float]:
    nse = Noise(8)
    n = int(0.55 * SR)
    buf = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        hiss = nse.white()
        lp += (0.08 + 0.35 * env_ad(t, 0.05, 0.4)) * (hiss - lp)
        buf[i] = lp * env_ad(t, 0.04, 0.45)
    return fade(normalize(buf, 0.4), 0.01, 0.06)


def nl_step(variant: int) -> list[float]:
    nse = Noise(80 + variant)
    n = int(0.32 * SR)
    buf = [0.0] * n
    p = 0.0
    f0 = 110 + variant * 12
    for i in range(n):
        t = i / SR
        p += f0 / SR
        boot = math.sin(p * 2 * math.pi) * env_exp(t, 0.045)
        claw = nse.white() * env_exp(t, 0.01) * 0.5
        buf[i] = boot * 0.7 + claw
    return fade(normalize(highpass(buf, 0.55), 0.62), 0.001, 0.05)


def nl_jump() -> list[float]:
    swoosh = claw_swoosh()
    land = nl_step(2)
    n = int(0.55 * SR)
    buf = [0.0] * n
    mix_at(buf, swoosh, 0, 0.9)
    mix_at(buf, land, int(0.28 * SR), 1.1)
    return fade(normalize(buf, 0.7), 0.005, 0.05)


def formant_vox(text_phones: list[tuple[float, float, float, float]]) -> list[float]:
    """Crude formant synth: list of (dur, f1, f2, voiced)."""
    nse = Noise(404)
    samples: list[float] = []
    p0 = p1 = p2 = 0.0
    for dur, f1, f2, voiced in text_phones:
        n = int(dur * SR)
        for i in range(n):
            t = i / SR
            glot = 0.0
            if voiced > 0:
                # 92 Hz glottal, slightly irregular
                p0 += (92 + nse.rng.uniform(-2, 2)) / SR
                glot = (p0 % 1.0) * 2 - 1
                glot = saturate(glot * 2.2, 1.8) * voiced
            else:
                glot = nse.white() * 0.35
            p1 += f1 / SR
            p2 += f2 / SR
            s = glot * 0.35
            s += math.sin(p1 * 2 * math.pi) * 0.22 * abs(glot)
            s += math.sin(p2 * 2 * math.pi) * 0.12 * abs(glot)
            samples.append(s)
    # radio vox: band-limit + distortion + carrier hiss
    bp = bandpass(samples, 0.28, 0.72)
    out = []
    for i, s in enumerate(bp):
        t = i / SR
        gate = 1.0
        if i < 0.02 * SR:
            gate = i / (0.02 * SR)
        if i > len(bp) - 0.05 * SR:
            gate *= (len(bp) - i) / (0.05 * SR)
        crushed = saturate(s * 3.2, 2.4)
        hiss = nse.white() * 0.04
        # AM "vox-caster" 50 Hz
        am = 0.75 + 0.25 * math.sin(t * 2 * math.pi * 50)
        out.append((crushed * am + hiss) * gate)
    return fade(normalize(out, 0.72), 0.01, 0.05)


def nl_vox_come() -> list[float]:
    # Approximate "We have come for you" with English-ish formants.
    phones = [
        (0.12, 300, 2200, 0.9),  # wi
        (0.10, 700, 1200, 0.8),  # hæ
        (0.14, 400, 900, 0.85),  # v
        (0.16, 500, 900, 1.0),   # kʌ
        (0.18, 400, 800, 0.95),  # m
        (0.12, 500, 1000, 0.7),  # fɔ
        (0.22, 300, 900, 0.95),  # ju
        (0.18, 280, 700, 0.5),   # trail
    ]
    v = formant_vox(phones)
    # slap delay, more cathedral
    n = len(v) + int(0.35 * SR)
    buf = [0.0] * n
    mix_at(buf, v, 0, 1.0)
    mix_at(buf, lowpass(v, 0.4), int(0.09 * SR), 0.35)
    mix_at(buf, lowpass(v, 0.25), int(0.21 * SR), 0.18)
    return fade(normalize(buf, 0.78), 0.01, 0.08)


def nl_scream() -> list[float]:
    nse = Noise(13)
    n = int(0.7 * SR)
    buf = [0.0] * n
    p = 0.0
    for i in range(n):
        t = i / SR
        f = 380 + 220 * math.sin(t * 9) + 80 * t
        p += f / SR
        harsh = saturate(math.sin(p * 2 * math.pi) * 2.5, 2.2)
        buf[i] = harsh * env_ad(t, 0.04, 0.6) + nse.white() * env_exp(t, 0.04) * 0.15
    return fade(normalize(bandpass(buf, 0.3, 0.7), 0.75), 0.005, 0.08)


def nl_death() -> list[float]:
    scream = nl_scream()
    metal = claw_metal()
    nse = Noise(1)
    n = int(1.1 * SR)
    buf = [0.0] * n
    mix_at(buf, scream[: int(0.25 * SR)], 0, 0.8)
    mix_at(buf, metal, int(0.08 * SR), 0.9)
    p = 0.0
    for i in range(n):
        t = i / SR
        p += (40 - 18 * min(1, t)) / SR
        buf[i] += math.sin(p * 2 * math.pi) * env_exp(t, 0.22) * 0.5
        buf[i] += nse.brown() * env_exp(t, 0.18) * 0.35
    return fade(normalize(buf, 0.88), 0.002, 0.15)


def alarm_klaxon() -> list[float]:
    n = int(2.4 * SR)
    buf = [0.0] * n
    for i in range(n):
        t = i / SR
        # two-tone 0.28s each
        cycle = t % 0.56
        f = 420 if cycle < 0.28 else 560
        tone = math.sin(2 * math.pi * f * t)
        harm = 0.25 * math.sin(2 * math.pi * f * 2 * t)
        gate = 1.0 if (cycle % 0.28) < 0.24 else 0.0
        buf[i] = (tone + harm) * 0.45 * gate
    return fade(normalize(buf, 0.7), 0.01, 0.04)


def amb_drone() -> tuple[list[float], list[float]]:
    nse = Noise(77)
    n = int(12.0 * SR)
    L = [0.0] * n
    R = [0.0] * n
    p1 = p2 = p3 = 0.0
    for i in range(n):
        t = i / SR
        p1 += (36.7 + 0.4 * math.sin(t * 0.21)) / SR
        p2 += (55.0 + 0.3 * math.sin(t * 0.13)) / SR
        p3 += (73.4) / SR
        d = (
            math.sin(p1 * 2 * math.pi) * 0.45
            + math.sin(p2 * 2 * math.pi) * 0.32
            + math.sin(p3 * 2 * math.pi) * 0.18
            + nse.brown() * 0.08
        )
        w = 0.12 * math.sin(t * 0.17)
        L[i] = d * (0.7 + w)
        R[i] = d * (0.7 - w)
    L = fade(normalize(lowpass(L, 0.12), 0.35), 0.4, 0.4)
    R = fade(normalize(lowpass(R, 0.12), 0.35), 0.4, 0.4)
    return L, R


def amb_drip() -> list[float]:
    nse = Noise(3)
    n = int(0.5 * SR)
    buf = [0.0] * n
    p = 0.0
    for i in range(n):
        t = i / SR
        p += (1750 * (1 - t * 1.8)) / SR
        buf[i] = math.sin(p * 2 * math.pi) * env_exp(t, 0.06) * 0.5
        buf[i] += nse.white() * env_exp(t, 0.008) * 0.12
    # tiny room
    mix_at(buf, [s * 0.25 for s in buf], int(0.04 * SR))
    return fade(normalize(buf, 0.4), 0.001, 0.08)


def amb_duct() -> tuple[list[float], list[float]]:
    nse = Noise(19)
    n = int(8.0 * SR)
    mono = [0.0] * n
    lp = 0.0
    for i in range(n):
        t = i / SR
        gust = 0.5 + 0.5 * math.sin(t * 0.4) * math.sin(t * 0.11)
        lp += 0.04 * (nse.white() * gust - lp)
        mono[i] = lp
    mono = fade(normalize(mono, 0.28), 0.3, 0.3)
    return stereo(mono, 0.35)


def music_layer(kind: str) -> tuple[list[float], list[float]]:
    nse = Noise({"explore": 1, "tension": 2, "combat": 3}[kind])
    seconds = 10.0
    n = int(seconds * SR)
    L = [0.0] * n
    R = [0.0] * n
    # grimdark: D minor / tritone
    roots = {
        "explore": [36.71, 55.0, 73.42],
        "tension": [36.71, 51.91, 73.42, 103.83],
        "combat": [36.71, 55.0, 73.42, 110.0, 146.83],
    }[kind]
    phases = [0.0] * len(roots)
    kick_p = 0.0
    for i in range(n):
        t = i / SR
        s = 0.0
        for k, f in enumerate(roots):
            wob = 1 + 0.003 * math.sin(t * (0.15 + k * 0.07) * 2 * math.pi)
            phases[k] += f * wob / SR
            s += math.sin(phases[k] * 2 * math.pi) * (0.22 / (1 + k * 0.35))
        s += nse.brown() * (0.04 if kind != "combat" else 0.07)
        if kind != "explore":
            # slow heartbeat / industrial pulse
            bpm = 72 if kind == "tension" else 118
            beat = (t * bpm / 60) % 1
            pulse = env_exp(beat * (60 / bpm), 0.08 if kind == "tension" else 0.05)
            kick_p += 42 / SR
            s += math.sin(kick_p * 2 * math.pi) * pulse * (0.35 if kind == "combat" else 0.18)
        if kind == "combat" and int(t * 8) % 2 == 0:
            s += nse.white() * env_exp((t * 8) % 1 / 8, 0.03) * 0.08
        w = 0.18 * math.sin(t * 0.23)
        L[i] = s * (0.75 + w)
        R[i] = s * (0.75 - w)
    peak = 0.28 if kind == "explore" else 0.34 if kind == "tension" else 0.42
    return fade(normalize(L, peak), 0.3, 0.3), fade(normalize(R, peak), 0.3, 0.3)


def stinger(win: bool) -> tuple[list[float], list[float]]:
    nse = Noise(5 if win else 9)
    n = int(2.4 * SR)
    freqs = [146.8, 220.0, 293.7, 349.2] if win else [155.6, 185.0, 196.0, 220.0]
    L = [0.0] * n
    phases = [0.0] * len(freqs)
    for i in range(n):
        t = i / SR
        s = 0.0
        for k, f in enumerate(freqs):
            phases[k] += (f * (1 - 0.04 * t if not win else 1 + 0.01 * t)) / SR
            amp = env_ad(t, 0.02, 2.1) * (0.28 / (k + 1))
            s += math.sin(phases[k] * 2 * math.pi) * amp
        s += nse.brown() * env_exp(t, 0.4) * (0.08 if win else 0.16)
        if not win:
            s = saturate(s * 1.4, 1.6)
        L[i] = s
    L = fade(normalize(L, 0.7 if win else 0.65), 0.01, 0.2)
    return stereo(L, 0.2)


SOUNDS = [
    ("bolter-shot", "bolter_shot", False),
    ("bolter-echo", "bolter_echo", False),
    ("bolter-casing", "bolter_casing", False),
    ("bolter-explode", "bolter_explode", False),
    ("claw-crackle", "claw_crackle", False),
    ("claw-swoosh", "claw_swoosh", False),
    ("claw-metal", "claw_metal", False),
    ("fist-impact", "fist_impact", False),
    ("term-step-01", "term_step", False, 0),
    ("term-step-02", "term_step", False, 1),
    ("term-step-03", "term_step", False, 2),
    ("term-servo", "term_servo", False),
    ("term-hydraulic", "term_hydraulic", False),
    ("nl-step-01", "nl_step", False, 0),
    ("nl-step-02", "nl_step", False, 1),
    ("nl-step-03", "nl_step", False, 2),
    ("nl-jump", "nl_jump", False),
    ("nl-vox-come-for-you", "nl_vox_come", False),
    ("nl-scream", "nl_scream", False),
    ("nl-death", "nl_death", False),
    ("alarm-klaxon", "alarm_klaxon", False),
    ("amb-drone", "amb_drone", True),
    ("amb-drip", "amb_drip", False),
    ("amb-duct", "amb_duct", True),
    ("music-explore", "music_explore", True),
    ("music-tension", "music_tension", True),
    ("music-combat", "music_combat", True),
    ("stinger-victory", "stinger_win", True),
    ("stinger-defeat", "stinger_lose", True),
]


def generate(name: str, extra=None):
    if name == "bolter_shot":
        return bolter_shot()
    if name == "bolter_echo":
        return bolter_echo()
    if name == "bolter_casing":
        return bolter_casing()
    if name == "bolter_explode":
        return bolter_explode()
    if name == "claw_crackle":
        return claw_crackle()
    if name == "claw_swoosh":
        return claw_swoosh()
    if name == "claw_metal":
        return claw_metal()
    if name == "fist_impact":
        return fist_impact()
    if name == "term_step":
        return term_step(extra)
    if name == "term_servo":
        return term_servo()
    if name == "term_hydraulic":
        return term_hydraulic()
    if name == "nl_step":
        return nl_step(extra)
    if name == "nl_jump":
        return nl_jump()
    if name == "nl_vox_come":
        return nl_vox_come()
    if name == "nl_scream":
        return nl_scream()
    if name == "nl_death":
        return nl_death()
    if name == "alarm_klaxon":
        return alarm_klaxon()
    if name == "amb_drone":
        return amb_drone()
    if name == "amb_drip":
        return amb_drip()
    if name == "amb_duct":
        return amb_duct()
    if name == "music_explore":
        return music_layer("explore")
    if name == "music_tension":
        return music_layer("tension")
    if name == "music_combat":
        return music_layer("combat")
    if name == "stinger_win":
        return stinger(True)
    if name == "stinger_lose":
        return stinger(False)
    raise KeyError(name)


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    WAV_DIR.mkdir(parents=True, exist_ok=True)
    for entry in SOUNDS:
        key, fn, stereo_flag = entry[0], entry[1], entry[2]
        extra = entry[3] if len(entry) > 3 else None
        print("bake", key, flush=True)
        buf = generate(fn, extra)
        wav = WAV_DIR / f"{key}.wav"
        ogg = OUT_DIR / f"{key}.ogg"
        if stereo_flag:
            write_wav(wav, buf, stereo_pair=True)
        else:
            write_wav(wav, buf, stereo_pair=False)
        encode(wav, ogg)
    # don't ship wavs
    for p in WAV_DIR.glob("*.wav"):
        p.unlink()
    WAV_DIR.rmdir()
    total = sum(p.stat().st_size for p in OUT_DIR.glob("*.ogg"))
    print(f"total ogg bytes: {total} ({total/1e6:.2f} MB)")
    if total > 8_000_000:
        print("WARNING: over 8 MB budget", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
