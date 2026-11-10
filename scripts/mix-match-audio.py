#!/usr/bin/env python3
"""Mix cue list + baked OGGs into a loudnormed WAV (then AAC-ready)."""
from __future__ import annotations

import json
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANK = ROOT / "web/sfx/nightlords"
SR = 48000


def decode_ogg(path: Path, tmp: Path) -> tuple[int, list[float]]:
    wav = tmp / (path.stem + ".wav")
    subprocess.check_call(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(path),
         "-ac", "1", "-ar", str(SR), str(wav)],
    )
    import wave
    with wave.open(str(wav), "r") as w:
        nch = w.getnchannels()
        sw = w.getsampwidth()
        n = w.getnframes()
        raw = w.readframes(n)
    assert sw == 2
    samples = []
    for i in range(0, len(raw), 2 * nch):
        (v,) = struct.unpack_from("<h", raw, i)
        samples.append(v / 32768.0)
    return SR, samples


def main() -> int:
    cues_path = Path(sys.argv[1])
    out_wav = Path(sys.argv[2])
    data = json.loads(cues_path.read_text())
    cues = data["cues"]
    duration = float(data.get("duration") or 0) + 2.5
    if cues:
        duration = max(duration, max(c["t"] for c in cues) + 2.5)
    n = int(duration * SR) + 1
    mix = [0.0] * n
    cache: dict[str, list[float]] = {}
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        for c in cues:
            name = c["name"]
            ogg = BANK / f"{name}.ogg"
            if not ogg.exists():
                continue
            if name not in cache:
                _, cache[name] = decode_ogg(ogg, tmp)
            src = cache[name]
            gain = float(c.get("gain") or 1) * 0.55
            at = int(float(c["t"]) * SR)
            for i, s in enumerate(src):
                j = at + i
                if j >= n:
                    break
                mix[j] += s * gain
        # bed: tile amb-drone quietly
        drone = BANK / "amb-drone.ogg"
        if drone.exists():
            _, d = decode_ogg(drone, tmp)
            if d:
                for i in range(n):
                    mix[i] += d[i % len(d)] * 0.22
        music = BANK / "music-explore.ogg"
        if music.exists():
            _, m = decode_ogg(music, tmp)
            if m:
                for i in range(n):
                    mix[i] += m[i % len(m)] * 0.18
    peak = max((abs(x) for x in mix), default=1.0)
    g = 0.89 / peak if peak > 0.89 else 1.0
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    raw_wav = out_wav.with_suffix(".pre.wav")
    import wave
    with wave.open(str(raw_wav), "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        buf = bytearray()
        for s in mix:
            v = int(max(-1.0, min(1.0, s * g)) * 32767)
            buf += struct.pack("<h", v)
        w.writeframes(buf)
    measure = subprocess.check_output(
        ["ffmpeg", "-hide_banner", "-i", str(raw_wav),
         "-af", "loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json",
         "-f", "null", "-"],
        stderr=subprocess.STDOUT, text=True,
    )
    start = measure.rfind("{")
    end = measure.rfind("}")
    stats = json.loads(measure[start:end + 1]) if start >= 0 and end > start else {}
    ln = (
        "loudnorm=I=-15:TP=-1.5:LRA=11"
        + f":measured_I={stats.get('input_i', -18)}"
        + f":measured_LRA={stats.get('input_lra', 5)}"
        + f":measured_TP={stats.get('input_tp', -2)}"
        + f":measured_thresh={stats.get('input_thresh', -28)}"
        + f":offset={stats.get('target_offset', 0)}"
        + ":linear=true"
    )
    subprocess.check_call(
        ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(raw_wav),
         "-af", ln, "-ac", "2", "-ar", str(SR), str(out_wav)],
    )
    raw_wav.unlink(missing_ok=True)
    print(f"wrote {out_wav} duration={duration:.2f}s cues={len(cues)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
