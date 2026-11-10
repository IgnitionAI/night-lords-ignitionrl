#!/usr/bin/env python3
"""Download CC0 *recorded* sources (Freesound HQ previews + OpenGameArt zips).

Freesound original WAV downloads require a login; HQ OGG/MP3 previews are the
same recordings under the sound's licence (verified CC0 1.0 on each page).
Sonniss GDC is *not* fetched: its licence forbids redistributing the files in
an asset pack / open-source repo.
"""
from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = Path("/tmp/nl-sfx-src")
FS = SRC / "freesound"
OGA = SRC / "oga"
UA = "Mozilla/5.0 (compatible; NightLordsSfx/1.0; +https://github.com/IgnitionAI/night-lords-ignitionrl)"

QUERIES = [
    "gunshot",
    "shotgun close",
    "rifle shot",
    "pistol shot",
    "explosion",
    "cannon boom",
    "metal impact hit",
    "anvil hit",
    "sword slash",
    "sword hit",
    "bullet shell casing",
    "brass casing",
    "electric spark",
    "electricity arc",
    "tesla coil",
    "hydraulic piston",
    "pneumatic",
    "servo motor",
    "gear mechanical",
    "footstep metal grate",
    "boot walk metal",
    "heavy footstep",
    "jet whoosh",
    "rocket whoosh",
    "flame burst",
    "scream horror male",
    "death scream",
    "whisper horror",
    "radio static voice",
    "walkie talkie",
    "water drip cave",
    "industrial ambience loop",
    "factory drone",
    "dark drone rumble",
    "thunder rumble",
    "punch impact body",
    "alarm siren",
    "klaxon",
    "air raid siren",
    "corridor reverb bang",
]


def get(url: str, binary: bool = False, retries: int = 4):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            return data if binary else data.decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(0.6 * (i + 1))
    raise last  # type: ignore[misc]


def search_ids(query: str, limit: int = 8) -> list[tuple[str, str]]:
    q = urllib.parse.quote(query)
    f = urllib.parse.quote('license:"Creative Commons 0"')
    url = f"https://freesound.org/search/?q={q}&f={f}&s=score+desc"
    html = get(url)
    seen: list[tuple[str, str]] = []
    got = set()
    for user, sid in re.findall(r"/people/([^/]+)/sounds/(\d+)/", html):
        if sid in got:
            continue
        got.add(sid)
        seen.append((urllib.parse.unquote(user), sid))
        if len(seen) >= limit:
            break
    return seen


def sound_meta(user: str, sid: str) -> dict | None:
    page = f"https://freesound.org/people/{urllib.parse.quote(user)}/sounds/{sid}/"
    html = get(page)
    if "creativecommons.org/publicdomain/zero/1.0/" not in html:
        return None
    previews = re.findall(r"https://cdn\.freesound\.org/previews/\d+/\d+_[^\"']+", html)
    hq_ogg = None
    hq_mp3 = None
    lq_ogg = None
    for p in previews:
        if p.endswith("-hq.ogg"):
            hq_ogg = p
        elif p.endswith("-hq.mp3"):
            hq_mp3 = p
        elif p.endswith("-lq.ogg"):
            lq_ogg = p
    token = None
    m = re.search(r"/previews/\d+/(\d+_\d+)-", " ".join(previews))
    if m:
        token = m.group(1)
        folder = token.split("_")[0]
        if len(folder) > 3:
            folder = folder[:-3] if len(folder) > 3 else folder
        # preview path uses first digits: 128302 -> 128
        stem = token.split("_")[0]
        prefix = stem[:-3] if len(stem) > 3 else stem
        hq_ogg = hq_ogg or f"https://cdn.freesound.org/previews/{prefix}/{token}-hq.ogg"
        hq_mp3 = hq_mp3 or f"https://cdn.freesound.org/previews/{prefix}/{token}-hq.mp3"
        lq_ogg = lq_ogg or f"https://cdn.freesound.org/previews/{prefix}/{token}-lq.ogg"
    title = re.search(r"<title>([^<]+)</title>", html)
    return {
        "id": sid,
        "user": user,
        "page": page,
        "title": (title.group(1).strip() if title else sid),
        "license": "CC0 1.0",
        "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
        "hq_ogg": hq_ogg,
        "hq_mp3": hq_mp3,
        "lq_ogg": lq_ogg,
    }


def download_sound(meta: dict) -> Path | None:
    dest_dir = FS / meta["id"]
    dest_dir.mkdir(parents=True, exist_ok=True)
    (dest_dir / "meta.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    for key in ("hq_ogg", "hq_mp3", "lq_ogg"):
        url = meta.get(key)
        if not url:
            continue
        ext = ".ogg" if "ogg" in key else ".mp3"
        out = dest_dir / f"preview{ext}"
        if out.exists() and out.stat().st_size > 400:
            return out
        try:
            data = get(url, binary=True)
            if len(data) < 400:
                continue
            out.write_bytes(data)
            return out
        except Exception:
            continue
    return None


def fetch_oga(name: str, path: str) -> Path | None:
    url = "https://opengameart.org" + path
    out = OGA / name
    if out.exists() and out.stat().st_size > 1000:
        return out
    try:
        data = get(url, binary=True)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        return out
    except Exception as e:
        print("oga fail", name, e)
        return None


def unzip(zpath: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(zpath) as z:
            z.extractall(dest)
    except zipfile.BadZipFile:
        print("bad zip", zpath)


def main() -> int:
    FS.mkdir(parents=True, exist_ok=True)
    OGA.mkdir(parents=True, exist_ok=True)
    index: list[dict] = []
    seen = set()
    for q in QUERIES:
        try:
            ids = search_ids(q, limit=6)
        except Exception as e:
            print("search fail", q, e)
            continue
        print(f"query {q!r} -> {len(ids)}")
        for user, sid in ids:
            if sid in seen:
                continue
            seen.add(sid)
            try:
                meta = sound_meta(user, sid)
            except Exception as e:
                print("meta fail", user, sid, e)
                continue
            if not meta:
                continue
            meta["query"] = q
            path = download_sound(meta)
            if path:
                meta["local"] = str(path)
                index.append(meta)
                print("  ok", sid, meta["title"][:60], path.name)
            time.sleep(0.15)

    oga_files = [
        ("100-CC0-SFX.zip", "/sites/default/files/100-CC0-SFX_0.zip", "https://opengameart.org/content/100-cc0-sfx", "rubberduck"),
        ("sci-fi-sfx.zip", "/sites/default/files/sci-fi-sfx.zip", "https://opengameart.org/content/50-cc0-sci-fi-sfx", "yd"),
        ("battle_sound_effects.zip", "/sites/default/files/battle_sound_effects_0.zip", "https://opengameart.org/content/battle-sound-effects", "artisticdude"),
    ]
    for name, path, page, author in oga_files:
        p = fetch_oga(name, path)
        if p:
            unzip(p, OGA / p.stem)
            index.append({
                "id": name,
                "user": author,
                "page": page,
                "title": name,
                "license": "CC0 1.0",
                "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
                "local": str(p),
                "query": "opengameart",
            })
            print("oga", name, p.stat().st_size)

    for i in range(1, 7):
        rel = f"/sites/default/files/0{i}-footstep.ogg" if i < 10 else ""
        # pages list 01-footstep.ogg through 06
        rel = f"/sites/default/files/0{i}-footstep.ogg"
        p = fetch_oga(f"footstep-{i:02d}.ogg", rel)
        if p:
            index.append({
                "id": f"oga-foot-{i}",
                "user": "Vinrax",
                "page": "https://opengameart.org/content/footsteps-0",
                "title": f"footstep {i}",
                "license": "CC0 1.0",
                "license_url": "https://creativecommons.org/publicdomain/zero/1.0/",
                "local": str(p),
                "query": "footstep",
            })

    (SRC / "index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")
    print("wrote", SRC / "index.json", "n=", len(index))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
