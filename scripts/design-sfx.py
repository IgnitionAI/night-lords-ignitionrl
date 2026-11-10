#!/usr/bin/env python3
"""Layer CC0 *recorded* Freesound previews into the Night Lords bank.

Sources live in /tmp/nl-sfx-src/freesound/<id>/preview.{ogg,mp3} with meta.json
(CC0 1.0 verified on the Freesound page). Output: OGG Opus under
web/sfx/nightlords/, CREDITS.md, manifest.json.
"""
from __future__ import annotations

import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "web" / "sfx" / "nightlords"
SRC = Path("/tmp/nl-sfx-src/freesound")
SR = 48000

USED: dict[str, dict] = {}


def src_path(sid: str) -> Path | None:
    d = SRC / str(sid)
    for name in ("preview.ogg", "preview.mp3"):
        p = d / name
        if p.exists() and p.stat().st_size > 400:
            return p
    return None


def meta(sid: str) -> dict:
    p = SRC / str(sid) / "meta.json"
    if p.exists():
        return json.loads(p.read_text())
    return {"id": sid, "user": "unknown", "page": f"https://freesound.org/s/{sid}/", "title": sid, "license": "CC0 1.0"}


def mark(sid: str) -> Path:
    p = src_path(sid)
    if not p:
        raise FileNotFoundError(sid)
    USED[str(sid)] = meta(sid)
    return p


def ff(*args: str) -> None:
    subprocess.check_call(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args])


def to_wav(sid: str, wav: Path, start: float = 0.0, dur: float | None = None, pitch: float = 1.0, hp: float = 0, lp: float = 0, vol: float = 1.0) -> None:
    src = mark(sid)
    grab = (dur or 8.0) * max(pitch, 0.25) + start + 0.05
    filt = [f"atrim={start}:{grab}", "asetpts=PTS-STARTPTS"]
    if pitch != 1.0:
        filt.append(f"asetrate={SR}*{pitch}")
    filt.append(f"aresample={SR}")
    filt.append("aformat=channel_layouts=mono")
    if hp:
        filt.append(f"highpass=f={hp}")
    if lp:
        filt.append(f"lowpass=f={lp}")
    if vol != 1.0:
        filt.append(f"volume={vol}")
    if dur:
        fade = min(0.08, dur * 0.15)
        filt.append(f"atrim=0:{dur}")
        filt.append("asetpts=PTS-STARTPTS")
        filt.append(f"afade=t=out:st={max(0, dur - fade)}:d={fade}")
    ff("-i", str(src), "-af", ",".join(filt), "-ac", "1", "-ar", str(SR), str(wav))


def mix(wavs: list[Path], out_wav: Path, weights: list[float] | None = None) -> None:
    n = len(wavs)
    w = weights or [1.0] * n
    inputs: list[str] = []
    for p in wavs:
        inputs += ["-i", str(p)]
    chains = "".join(f"[{i}]volume={w[i]}[a{i}];" for i in range(n))
    mixn = "".join(f"[a{i}]" for i in range(n))
    filt = chains + f"{mixn}amix=inputs={n}:duration=longest:normalize=0,volume=0.85,alimiter=limit=0.89:attack=2:release=50"
    ff(*inputs, "-filter_complex", filt, "-ac", "1", "-ar", str(SR), str(out_wav))


def encode(wav: Path, ogg: Path, br: str = "48k") -> None:
    ff("-i", str(wav), "-c:a", "libopus", "-b:a", br, "-ac", "1", "-ar", str(SR), str(ogg))


def layer(name: str, parts: list[tuple[str, dict]], br: str = "48k") -> Path:
    """parts: (id, {start,dur,pitch,hp,lp,vol})"""
    BANK.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        wavs: list[Path] = []
        weights: list[float] = []
        for i, (sid, opt) in enumerate(parts):
            if src_path(sid) is None:
                continue
            w = tmp / f"{i}.wav"
            to_wav(
                sid, w,
                start=float(opt.get("start", 0)),
                dur=opt.get("dur"),
                pitch=float(opt.get("pitch", 1)),
                hp=float(opt.get("hp", 0)),
                lp=float(opt.get("lp", 0)),
                vol=1.0,
            )
            wavs.append(w)
            weights.append(float(opt.get("vol", 1)))
        if not wavs:
            raise RuntimeError(f"no sources for {name}")
        mixed = tmp / "mix.wav"
        mix(wavs, mixed, weights)
        ogg = BANK / name
        encode(mixed, ogg, br)
        print(f"  {name:28} {ogg.stat().st_size:7} B  layers={len(wavs)}")
        return ogg


def first(*ids: str) -> str:
    for i in ids:
        if src_path(i):
            return i
    raise FileNotFoundError(ids)


def main() -> int:
    BANK.mkdir(parents=True, exist_ok=True)
    print("designing Night Lords bank from CC0 recordings")

    g1 = first("128301", "433858", "163456")
    g2 = first("438576", "108794", "433858")
    g3 = first("524739", "524738", "331240", "855653")
    ex1 = first("336011", "366091", "482993")
    ex2 = first("366091", "187767", "758072")
    met = first("406562", "270589", "795432")
    anv = first("270589", "270588", "434339")
    cas = first("205126", "620929", "210102", "777922")
    cas2 = first("620929", "318964", "778028")
    spark = first("449719", "536793", "189630", "675755")
    # 675760 tesla coil: recorded, but stacked harmonics — not used.
    # 441666 sword slash has a ~1.3 s harmonic ring (~2.5 kHz + partials).
    slash = first("442903", "426322", "868049")
    swo2 = first("342984", "568834")
    sword = first("426322", "364531", "442769")
    sword2 = first("326795", "547041", "475416")
    # 837389 « Heavy Robot Footsteps » is CC0 but the author describes it as
    # « fully synthesized » — skip it, use recorded metal/boot steps.
    step_h = first("383724", "106394", "562195")
    step_m = first("562195", "394036", "253735")
    step_n = first("398554", "421151", "19310")
    jet = first("534856", "622406", "152509")
    # 256911 « Whoosh,Metal,Alien » is a tonal pack — skip.
    whoosh = first("568834", "342984")
    rocket = first("774245", "854476", "591146")
    scream = first("169628", "556976", "243382")
    scream2 = first("173942", "173945", "320740")
    grunt = first("547209", "169628")
    whisper = first("193818", "193812", "211872")
    radio = first("125392", "766954", "701330")
    drip = first("166324", "683778", "389541")
    drone = first("258341", "867585", "776446")
    punch = first("454383", "270589", "336011")
    siren = first("382611", "336640", "607382")

    layer("bolter-shot.ogg", [
        (g1, {"dur": 0.55, "pitch": 0.78, "vol": 1.15, "hp": 80}),
        (g2, {"dur": 0.45, "pitch": 0.62, "vol": 0.85, "lp": 900}),
        (met, {"dur": 0.18, "pitch": 1.35, "vol": 0.55, "hp": 2500}),
        (ex1, {"dur": 0.4, "pitch": 0.55, "vol": 0.7, "lp": 280}),
    ], "56k")
    layer("bolter-shot-02.ogg", [
        (g2, {"dur": 0.6, "pitch": 0.72, "vol": 1.1}),
        (g3, {"dur": 0.5, "pitch": 0.84, "vol": 0.8, "hp": 200}),
        (anv, {"dur": 0.2, "pitch": 0.9, "vol": 0.45, "hp": 1800}),
        (ex2, {"dur": 0.35, "pitch": 0.5, "vol": 0.65, "lp": 220}),
    ], "56k")
    layer("bolter-shot-03.ogg", [
        (g3, {"dur": 0.5, "pitch": 0.7, "vol": 1.05}),
        (g1, {"dur": 0.35, "pitch": 0.9, "vol": 0.7, "hp": 400}),
        (cas, {"dur": 0.12, "start": 0.0, "pitch": 1.4, "vol": 0.4, "hp": 3000}),
        (ex1, {"dur": 0.45, "pitch": 0.48, "vol": 0.75, "lp": 180}),
    ], "56k")
    layer("bolter-echo.ogg", [
        (g1, {"dur": 1.4, "pitch": 0.7, "vol": 0.7, "lp": 1400}),
        (ex2, {"dur": 1.6, "pitch": 0.6, "vol": 0.55, "lp": 700}),
        (drone, {"dur": 1.8, "pitch": 0.8, "vol": 0.25, "lp": 400}),
    ], "40k")
    layer("bolter-casing.ogg", [
        (cas, {"dur": 0.7, "pitch": 1.0, "vol": 1.1, "hp": 800}),
        (cas2, {"dur": 0.55, "pitch": 1.15, "vol": 0.6, "hp": 1200}),
    ], "32k")
    layer("bolter-casing-02.ogg", [(cas2, {"dur": 0.65, "pitch": 0.92, "vol": 1.0, "hp": 600})], "32k")
    layer("bolter-casing-03.ogg", [(cas, {"dur": 0.5, "start": 0.05, "pitch": 1.2, "vol": 1.0, "hp": 1000})], "32k")
    layer("bolter-explode.ogg", [
        (ex1, {"dur": 0.9, "pitch": 0.72, "vol": 1.1}),
        (met, {"dur": 0.35, "pitch": 0.65, "vol": 0.8}),
        (anv, {"dur": 0.3, "pitch": 0.55, "vol": 0.5, "lp": 600}),
    ], "56k")
    layer("bolter-explode-02.ogg", [
        (ex2, {"dur": 1.0, "pitch": 0.68, "vol": 1.05}),
        (sword, {"dur": 0.25, "pitch": 0.5, "vol": 0.45}),
    ], "48k")
    layer("bolter-explode-03.ogg", [
        (ex1, {"dur": 0.7, "pitch": 0.85, "vol": 0.9, "hp": 120}),
        (anv, {"dur": 0.4, "pitch": 0.7, "vol": 0.7}),
    ], "48k")

    layer("claw-crackle.ogg", [
        (spark, {"dur": 0.7, "pitch": 1.05, "vol": 1.0, "hp": 400}),
        (spark, {"dur": 0.55, "start": 0.2, "pitch": 0.88, "vol": 0.5, "hp": 900}),
    ], "40k")
    layer("claw-crackle-02.ogg", [(spark, {"dur": 0.65, "pitch": 0.95, "vol": 1.0}), (spark, {"dur": 0.4, "pitch": 1.4, "vol": 0.5})], "40k")
    layer("claw-crackle-03.ogg", [(spark, {"dur": 0.55, "start": 0.1, "pitch": 0.88, "vol": 1.05})], "40k")
    layer("claw-swoosh.ogg", [
        (slash, {"dur": 0.22, "pitch": 0.9, "vol": 1.0}),
        (whoosh, {"dur": 0.2, "pitch": 1.05, "vol": 0.7}),
    ], "36k")
    layer("claw-swoosh-02.ogg", [
        (swo2, {"start": 8.2, "dur": 0.24, "pitch": 0.95, "vol": 1.0}),
        (slash, {"dur": 0.16, "pitch": 1.15, "vol": 0.4}),
    ], "36k")
    layer("claw-swoosh-03.ogg", [
        (whoosh, {"dur": 0.2, "pitch": 0.8, "vol": 1.0}),
        (swo2, {"start": 9.8, "dur": 0.2, "pitch": 1.2, "vol": 0.45}),
    ], "36k")
    layer("claw-metal.ogg", [
        (sword, {"dur": 0.5, "pitch": 0.82, "vol": 1.1}),
        (met, {"dur": 0.3, "pitch": 0.7, "vol": 0.7}),
        (spark, {"dur": 0.25, "pitch": 1.5, "vol": 0.35, "hp": 2000}),
    ], "48k")
    layer("claw-metal-02.ogg", [(sword2, {"dur": 0.55, "pitch": 0.75, "vol": 1.05}), (anv, {"dur": 0.25, "pitch": 0.9, "vol": 0.5})], "48k")
    layer("claw-metal-03.ogg", [(met, {"dur": 0.4, "pitch": 0.6, "vol": 1.0}), (sword, {"dur": 0.3, "pitch": 1.05, "vol": 0.6})], "48k")

    layer("fist-impact.ogg", [
        (ex2, {"dur": 0.85, "pitch": 0.52, "vol": 1.35, "lp": 400}),
        (anv, {"dur": 0.45, "pitch": 0.58, "vol": 1.15}),
        (met, {"dur": 0.35, "pitch": 0.7, "vol": 0.8, "hp": 80}),
        (spark, {"dur": 0.5, "pitch": 0.65, "vol": 0.35, "lp": 700}),
    ], "72k")
    layer("fist-impact-02.ogg", [
        (ex1, {"dur": 0.75, "pitch": 0.48, "vol": 1.25, "lp": 350}),
        (anv, {"dur": 0.4, "pitch": 0.62, "vol": 1.0}),
        (g2, {"dur": 0.28, "pitch": 0.5, "vol": 0.5, "lp": 500}),
    ], "64k")
    layer("fist-impact-03.ogg", [
        (anv, {"dur": 0.5, "pitch": 0.5, "vol": 1.3}),
        (ex2, {"dur": 0.8, "pitch": 0.42, "vol": 1.1, "lp": 220}),
        (met, {"dur": 0.25, "pitch": 0.8, "vol": 0.6}),
    ], "64k")
    layer("fist-hum.ogg", [
        (jet, {"dur": 1.1, "pitch": 0.55, "vol": 0.7, "lp": 400}),
        (drone, {"dur": 1.1, "pitch": 0.9, "vol": 0.55, "lp": 180}),
    ], "40k")

    layer("term-step-01.ogg", [
        (step_h, {"dur": 0.45, "pitch": 0.7, "vol": 1.1, "lp": 1800}),
        (anv, {"dur": 0.25, "pitch": 0.55, "vol": 0.45, "lp": 400}),
        (met, {"dur": 0.2, "pitch": 0.75, "vol": 0.3, "lp": 800}),
    ], "40k")
    layer("term-step-02.ogg", [
        (step_m, {"dur": 0.5, "pitch": 0.68, "vol": 1.05}),
        (met, {"dur": 0.2, "pitch": 0.5, "vol": 0.4, "lp": 500}),
    ], "40k")
    layer("term-step-03.ogg", [
        (step_h, {"start": 0.2, "dur": 0.45, "pitch": 0.74, "vol": 1.0}),
        (step_m, {"dur": 0.3, "pitch": 0.6, "vol": 0.45, "lp": 600}),
    ], "40k")
    layer("term-servo.ogg", [
        (first("833468", "534856"), {"dur": 0.9, "pitch": 0.85, "vol": 0.85, "lp": 1400}),
        (jet, {"dur": 0.8, "pitch": 1.2, "vol": 0.3, "hp": 200, "lp": 1800}),
    ], "36k")
    layer("term-hydraulic.ogg", [
        (first("833468", "580718", "534856"), {"dur": 0.7, "pitch": 0.75, "vol": 0.9, "lp": 900}),
        (jet, {"dur": 0.5, "pitch": 0.6, "vol": 0.35, "lp": 500}),
    ], "36k")

    layer("nl-step-01.ogg", [(step_n, {"dur": 0.42, "pitch": 1.05, "vol": 1.0}), (step_m, {"dur": 0.28, "pitch": 1.15, "vol": 0.45})], "36k")
    layer("nl-step-02.ogg", [(step_m, {"dur": 0.4, "pitch": 1.08, "vol": 1.0, "hp": 180}), (met, {"dur": 0.15, "pitch": 1.4, "vol": 0.25, "hp": 2500})], "36k")
    layer("nl-step-03.ogg", [(step_h, {"dur": 0.4, "pitch": 1.18, "vol": 0.9}), (step_n, {"dur": 0.35, "pitch": 1.0, "vol": 0.5})], "36k")
    layer("nl-jump.ogg", [
        (rocket, {"dur": 0.7, "pitch": 1.05, "vol": 0.9}),
        (whoosh, {"dur": 0.22, "pitch": 0.85, "vol": 0.7}),
        (jet, {"dur": 0.55, "pitch": 1.3, "vol": 0.35, "hp": 300}),
    ], "48k")

    layer("nl-vox-come-for-you.ogg", [
        (whisper, {"dur": 2.4, "pitch": 0.78, "vol": 1.05, "lp": 2200}),
        (radio, {"dur": 2.4, "pitch": 1.0, "vol": 0.45, "hp": 400}),
        (scream, {"dur": 1.6, "pitch": 0.55, "vol": 0.35, "lp": 1600}),
    ], "48k")
    layer("nl-scream.ogg", [
        (scream, {"dur": 1.2, "pitch": 0.82, "vol": 1.0}),
        (radio, {"dur": 1.0, "pitch": 1.1, "vol": 0.3, "hp": 800}),
    ], "40k")
    layer("nl-death.ogg", [
        (scream2, {"dur": 1.4, "pitch": 0.7, "vol": 1.05}),
        (grunt, {"dur": 0.6, "pitch": 0.6, "vol": 0.5}),
        (ex1, {"dur": 0.5, "pitch": 0.8, "vol": 0.3, "lp": 500}),
    ], "48k")

    layer("alarm-klaxon.ogg", [
        (siren, {"dur": 1.2, "pitch": 1.05, "vol": 0.75, "hp": 300, "lp": 1800}),
        (met, {"dur": 0.25, "pitch": 0.8, "vol": 0.3}),
    ], "40k")

    layer("amb-drone.ogg", [
        (drone, {"dur": 8.0, "pitch": 0.7, "vol": 0.9, "lp": 400}),
        (jet, {"dur": 8.0, "pitch": 0.35, "vol": 0.28, "lp": 160}),
    ], "36k")
    layer("amb-drip.ogg", [(drip, {"dur": 0.6, "pitch": 0.95, "vol": 1.0, "hp": 200})], "24k")
    layer("amb-duct.ogg", [
        (jet, {"dur": 7.0, "pitch": 0.55, "vol": 0.7, "lp": 800}),
        (drone, {"dur": 7.0, "pitch": 1.1, "vol": 0.35, "hp": 200, "lp": 1200}),
    ], "32k")

    layer("music-explore.ogg", [
        (drone, {"dur": 8.0, "pitch": 0.55, "vol": 0.85, "lp": 280}),
        (whisper, {"dur": 8.0, "pitch": 0.4, "vol": 0.12, "lp": 500}),
        (jet, {"dur": 8.0, "pitch": 0.28, "vol": 0.12, "lp": 140}),
    ], "48k")
    layer("music-tension.ogg", [
        (drone, {"dur": 8.0, "pitch": 0.65, "vol": 0.75, "lp": 320}),
        (ex2, {"dur": 8.0, "pitch": 0.35, "vol": 0.22, "lp": 200}),
        (jet, {"dur": 8.0, "pitch": 0.4, "vol": 0.12, "lp": 180}),
    ], "48k")
    layer("music-combat.ogg", [
        (ex2, {"dur": 7.0, "pitch": 0.4, "vol": 0.45, "lp": 250}),
        (drone, {"dur": 7.0, "pitch": 0.8, "vol": 0.7, "lp": 500}),
        (anv, {"dur": 7.0, "pitch": 0.5, "vol": 0.2, "lp": 400}),
        (jet, {"dur": 7.0, "pitch": 0.55, "vol": 0.15, "lp": 220}),
    ], "56k")
    layer("stinger-victory.ogg", [
        (ex1, {"dur": 1.8, "pitch": 0.7, "vol": 0.7}),
        (anv, {"dur": 1.2, "pitch": 0.8, "vol": 0.5}),
        (g1, {"dur": 0.4, "pitch": 0.6, "vol": 0.35}),
    ], "48k")
    layer("stinger-defeat.ogg", [
        (scream2, {"dur": 2.0, "pitch": 0.55, "vol": 0.7, "lp": 1800}),
        (drone, {"dur": 2.2, "pitch": 0.5, "vol": 0.6, "lp": 300}),
        (ex1, {"dur": 2.0, "pitch": 0.45, "vol": 0.25, "lp": 250}),
    ], "48k")
    layer("ir-corridor.ogg", [
        (ex2, {"dur": 1.8, "pitch": 0.7, "vol": 0.9, "lp": 4000}),
        (met, {"dur": 1.2, "pitch": 0.6, "vol": 0.5}),
    ], "32k")

    samples = [
        ("bolter-shot", "bolter-shot.ogg", ["bolter-shot-02.ogg", "bolter-shot-03.ogg"], "sfx", 0.95, False, True, 9),
        ("bolter-echo", "bolter-echo.ogg", [], "sfx", 0.58, False, True, 6),
        ("bolter-casing", "bolter-casing.ogg", ["bolter-casing-02.ogg", "bolter-casing-03.ogg"], "sfx", 0.48, False, True, 4),
        ("bolter-explode", "bolter-explode.ogg", ["bolter-explode-02.ogg", "bolter-explode-03.ogg"], "sfx", 0.82, False, True, 8),
        ("claw-crackle", "claw-crackle.ogg", ["claw-crackle-02.ogg", "claw-crackle-03.ogg"], "sfx", 0.64, False, True, 7),
        ("claw-swoosh", "claw-swoosh.ogg", ["claw-swoosh-02.ogg", "claw-swoosh-03.ogg"], "sfx", 0.52, False, True, 6),
        ("claw-metal", "claw-metal.ogg", ["claw-metal-02.ogg", "claw-metal-03.ogg"], "sfx", 0.84, False, True, 8),
        ("fist-impact", "fist-impact.ogg", ["fist-impact-02.ogg", "fist-impact-03.ogg"], "sfx", 0.96, False, True, 10),
        ("fist-hum", "fist-hum.ogg", [], "sfx", 0.55, False, True, 6),
        ("term-step-01", "term-step-01.ogg", [], "sfx", 0.74, False, True, 4),
        ("term-step-02", "term-step-02.ogg", [], "sfx", 0.74, False, True, 4),
        ("term-step-03", "term-step-03.ogg", [], "sfx", 0.74, False, True, 4),
        ("term-servo", "term-servo.ogg", [], "sfx", 0.4, False, True, 3),
        ("term-hydraulic", "term-hydraulic.ogg", [], "sfx", 0.42, False, True, 3),
        ("nl-step-01", "nl-step-01.ogg", [], "sfx", 0.5, False, True, 3),
        ("nl-step-02", "nl-step-02.ogg", [], "sfx", 0.5, False, True, 3),
        ("nl-step-03", "nl-step-03.ogg", [], "sfx", 0.5, False, True, 3),
        ("nl-jump", "nl-jump.ogg", [], "sfx", 0.62, False, True, 6),
        ("nl-vox-come-for-you", "nl-vox-come-for-you.ogg", [], "voice", 0.72, False, True, 7),
        ("nl-scream", "nl-scream.ogg", [], "voice", 0.58, False, True, 6),
        ("nl-death", "nl-death.ogg", [], "voice", 0.84, False, True, 9),
        ("alarm-klaxon", "alarm-klaxon.ogg", [], "ui", 0.5, False, False, 8),
        ("amb-drone", "amb-drone.ogg", [], "ambience", 0.42, True, False, 2),
        ("amb-drip", "amb-drip.ogg", [], "ambience", 0.28, False, True, 2),
        ("amb-duct", "amb-duct.ogg", [], "ambience", 0.3, True, False, 2),
        ("music-explore", "music-explore.ogg", [], "music", 0.38, True, False, 1),
        ("music-tension", "music-tension.ogg", [], "music", 0.44, True, False, 1),
        ("music-combat", "music-combat.ogg", [], "music", 0.5, True, False, 1),
        ("stinger-victory", "stinger-victory.ogg", [], "music", 0.68, False, False, 11),
        ("stinger-defeat", "stinger-defeat.ogg", [], "music", 0.66, False, False, 11),
        ("ir-corridor", "ir-corridor.ogg", [], "sfx", 0.01, False, False, 0),
    ]
    man = {
        "version": 1,
        "polyphony": 18,
        "samples": [
            {
                "name": n, "file": f, **({"variants": v} if v else {}),
                "bus": b, "gain": g, **({"loop": True} if loop else {}),
                "spatial": sp, "priority": p,
                "license": "CC0 1.0 (layered Freesound recordings)",
                "source": "see web/sfx/CREDITS.md",
            }
            for (n, f, v, b, g, loop, sp, p) in samples
        ],
    }
    (BANK / "manifest.json").write_text(json.dumps(man, indent=2) + "\n", encoding="utf-8")

    rows = []
    bytes_total = sum(p.stat().st_size for p in BANK.glob("*.ogg"))
    for sid, m in sorted(USED.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 0):
        rows.append(f"| {sid} | {m.get('title','').replace('|','/')} | {m.get('user')} | CC0 1.0 | {m.get('page')} |")
    credits = f"""# Banque sonore Night Lords — licences

Les fichiers sous `web/sfx/nightlords/` sont des **mixages de prises réelles**
publiées en **CC0 1.0** (Freesound). Aucun asset Games Workshop, aucun fichier
Genex, aucun échantillon Sonniss (la licence #GameAudioGDC **interdit** de
redistribuer les fichiers dans un dépôt / asset pack — citation :

> « Licensee may not distribute, publish, sub-license or otherwise supply the
> sound effects as sound effects to any other person […] This applies whether
> the sound effects are unmodified, modified or re-designed, and whether they
> are supplied on their own or as part of a sound effects library, sample pack,
> asset pack […] » — https://sonniss.com/gdc-bundle-license/

Encodage : OGG Opus, 48 kHz mono. Poids total visé ≤ 8 Mo (mesuré : {bytes_total} octets).

Kenney.nl n'a pas pu être téléchargé depuis cet environnement (HTTP 403).
OpenGameArt (packs CC0) est documenté comme source candidate ; le mix livré
s'appuie sur Freesound CC0, dont chaque page a été vérifiée
(`creativecommons.org/publicdomain/zero/1.0/`).

Les prévisualisations HQ Freesound sont utilisées parce que le WAV original
exige un compte. Ce sont les **mêmes enregistrements**, sous la même licence CC0.

837389 (Artem_Zaitsev, « Heavy Robot Footsteps ») est CC0 mais décrit par
l'auteur comme **fully synthesized** — non utilisé. 675760 (tesla coil) et
382611 (sirène de Prague) sont des prises réelles CC0 mais trop tonales en
boucle : retirés des lits. 441666 (sword slash, ring harmonique ~2,5 kHz)
et 256911 (Whoosh Metal Alien) : raies 8–20 s via claw-swoosh — remplacés
par 442903 / 568834 / 342984, transitoires courts.

| id Freesound | titre | auteur | licence | source |
|---|---|---|---|---|
""" + "\n".join(rows) + """

| fichier livré | rôle | licence | source |
|---|---|---|---|
| *.ogg sous nightlords/ | mixage Night Lords | CC0 1.0 | couches ci-dessus |
| manifest.json | index | MIT (code du dépôt) | ce dépôt |

Régénération :

```sh
python3 scripts/fetch-cc0-sfx.py
python3 scripts/design-sfx.py
```
"""
    (ROOT / "web" / "sfx" / "CREDITS.md").write_text(credits, encoding="utf-8")
    print(json.dumps({"bankBytes": bytes_total, "sources": len(USED), "oggs": len(list(BANK.glob('*.ogg')))}, indent=2))
    if bytes_total >= 8_000_000:
        raise SystemExit(f"budget dépassé: {bytes_total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
