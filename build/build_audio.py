#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build every audio track + data.js for Yalla Saeed from content.py.

  python build/build_audio.py            # full build
  python build/build_audio.py --plan     # just print how many clips are needed

Needs: edge-tts>=7.3, numpy, imageio-ffmpeg (or an ffmpeg on PATH).
Voices are synthesised with Microsoft Edge neural voices through edge-tts and
cached in build/.cache so a rebuild only fetches what changed.
"""
import asyncio, hashlib, json, os, re, shutil, subprocess, sys, time, wave
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import content as C  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / ".cache" / "tts"
OUT_AUDIO = ROOT / "audio"
DIST = ROOT / "dist"
SR = 24000
VERSION = (ROOT / "VERSION").read_text().strip() if (ROOT / "VERSION").exists() else "1.0.0"


def ffmpeg_exe():
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


FF = ffmpeg_exe()
NAME = C.LEARNER
CASTMAP = {c[0]: c for c in C.CAST}
MALE = [c[0] for c in C.CAST if c[4] == "m"]
FEMALE = [c[0] for c in C.CAST if c[4] == "f"]
GULF_M = ["fahed", "hamdan", "moaz", "ali", "abdullah"]
GULF_F = ["noura", "fatima", "amal", "laila", "aysha"]


# ------------------------------------------------------------------ clips
class Clip:
    """One thing that makes sound (or silence) on a track."""
    def __init__(self, kind, text="", who="reem", mood="", part="", gap=0.4, show=None, gain_db=0.0):
        self.kind, self.text, self.who, self.mood, self.part = kind, text, who, mood, part
        self.gap, self.show, self.gain_db = gap, show, gain_db
        self.item = -1
        self.ep = -1

    def tts(self):
        """-> (voice, rate, pitch, text) or None for silence."""
        R = C.REEM
        if self.kind == "r":       # Reem, English
            return (R["voice"], R["rate_soft"] if self.mood == "soft" else R["rate_en"], "+0Hz", self.text)
        if self.kind == "ra":      # Reem, Arabic
            return (R["voice"], R["rate_ar"], "+0Hz", self.text)
        if self.kind == "v":
            label, emoji, rate, pitch, punct, gain = C.MOODS[self.mood]
            t = self.text
            if punct:
                t = re.sub(r"[؟!.،\s]+$", "", t) + punct
            return (CASTMAP[self.who][3], rate, pitch, t)
        return None

    def key(self):
        t = self.tts()
        return hashlib.sha1("|".join(t).encode("utf-8")).hexdigest()[:20] if t else None


def fmt(s):
    return s.replace("{name}", NAME)


def crew(gi):
    """Pick who speaks for item number gi so every word gets a different mix."""
    sa, sb = ("hamed", "zariyah") if gi % 2 == 0 else ("zariyah", "hamed")
    gm, gf = GULF_M[gi % 5], GULF_F[(gi * 2 + 1) % 5]
    gm2, gf2 = GULF_M[(gi + 2) % 5], GULF_F[(gi * 2 + 3) % 5]
    jo, jo2 = ("taim", "sana") if gi % 2 == 0 else ("sana", "taim")
    return dict(sa=sa, sb=sb, gm=gm, gf=gf, gm2=gm2, gf2=gf2, jo=jo, jo2=jo2)


def lesson_item(it, gi):
    k = crew(gi)
    v, ph = it["v"], it["ph"]
    m3 = "ask" if gi % 2 == 0 else "deep"
    m4 = "excited" if gi % 3 else "tiny"
    seq = [
        Clip("r", fmt(it["intro"]), gap=0.35),
        Clip("ra", v, part="w", gap=0.5),
        Clip("r", fmt(it["mean"]), gap=0.55),
        Clip("v", v, k["sa"], "slow", "w", gap=0.6),
        Clip("v", v, k["sb"], "normal", "w", gap=0.5),
        Clip("v", v, k["gm"], m3, "w", gap=0.5),
        Clip("v", v, k["gf"], m4, "w", gap=0.5),
        Clip("v", v, k["jo"], "fast", "w", gap=0.5),
        Clip("v", v, k["sa"], "normal", "w", gap=0.6),
        Clip("r", fmt(C.TURN_LINES[gi % len(C.TURN_LINES)]), gap=0.15),
        Clip("you", part="w", gap=2.4),
        Clip("ra", v, part="w", gap=0.8),
        Clip("r", fmt(it["phIntro"]), gap=0.4),
        Clip("ra", ph["v"], part="p", gap=0.6),
        Clip("v", ph["v"], k["sb"], "slow", "p", gap=0.65),
        Clip("v", ph["v"], k["gm2"], "normal", "p", gap=0.6),
        Clip("v", ph["v"], k["gf2"], "fast", "p", gap=0.6),
        Clip("r", fmt(C.PHRASE_TURN_LINES[gi % len(C.PHRASE_TURN_LINES)]), gap=0.15),
        Clip("you", part="p", gap=3.0),
        Clip("v", ph["v"], k["jo2"], "normal", "p", gap=0.6),
        Clip("r", fmt(it["outro"]), gap=1.3),
    ]
    return seq


def drift_item(it, gi):
    k = crew(gi)
    v, ph = it["v"], it["ph"]
    return [
        Clip("v", v, k["gf2"], "dreamy", "w", gap=1.0),
        Clip("r", it.get("den", it["en"]), mood="soft", gap=0.9, gain_db=-2),
        Clip("v", v, k["sa"], "slow", "w", gap=1.0),
        Clip("v", v, k["gm2"], "dreamy", "w", gap=1.5),
        Clip("v", ph["v"], k["sb"], "slow", "p", gap=0.8),
        Clip("r", ph.get("den", ph["en"]), mood="soft", gap=0.9, gain_db=-2),
        Clip("v", ph["v"], k["gf"], "dreamy", "p", gap=2.4),
    ]


def plan():
    lesson, drift = [], []
    gi = 0
    drift.append(Clip("r", fmt(C.DRIFT_INTRO), mood="soft", gap=2.0, gain_db=-2))
    for ei, ep in enumerate(C.EPISODES):
        a = Clip("r", fmt(ep["intro"]), gap=1.0); a.ep = ei
        lesson.append(a)
        for it in ep["items"]:
            for c in lesson_item(it, gi):
                c.item, c.ep = gi, ei
                lesson.append(c)
            for c in drift_item(it, gi):
                c.item, c.ep = gi, ei
                drift.append(c)
            gi += 1
        b = Clip("r", fmt(ep["outro"]), gap=2.2); b.ep = ei
        lesson.append(b)
        drift[-1].gap = 3.5
    z = Clip("r", fmt(C.LESSON_OUTRO), gap=3.0); z.ep = len(C.EPISODES) - 1
    lesson.append(z)
    y = Clip("r", fmt(C.DRIFT_OUTRO), mood="soft", gap=4.0, gain_db=-2); y.ep = len(C.EPISODES) - 1
    drift.append(y)
    return lesson, drift


# ------------------------------------------------------------------ TTS
async def fetch_all(jobs):
    import edge_tts
    CACHE.mkdir(parents=True, exist_ok=True)
    todo = {k: t for k, t in jobs.items() if not (CACHE / f"{k}.mp3").exists()}
    print(f"TTS: {len(jobs)} unique clips, {len(todo)} to fetch")
    sem = asyncio.Semaphore(5)
    done = 0

    async def one(k, t):
        nonlocal done
        voice, rate, pitch, text = t
        for attempt in range(6):
            try:
                async with sem:
                    com = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
                    buf = b""
                    async for ch in com.stream():
                        if ch["type"] == "audio":
                            buf += ch["data"]
                if len(buf) < 800:
                    raise RuntimeError("empty audio")
                (CACHE / f"{k}.mp3").write_bytes(buf)
                done += 1
                if done % 50 == 0:
                    print(f"  … {done}/{len(todo)}", flush=True)
                return
            except Exception as e:  # noqa: BLE001
                await asyncio.sleep(1.5 * (attempt + 1))
                err = e
        raise RuntimeError(f"TTS failed for {voice} {text!r}: {err!r}")

    await asyncio.gather(*(one(k, t) for k, t in todo.items()))


# ------------------------------------------------------------------ DSP
def decode(path):
    raw = subprocess.run([FF, "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768.0


def envelope(x, win=0.005):
    n = max(1, int(SR * win))
    pad = (-len(x)) % n
    a = np.abs(np.concatenate([x, np.zeros(pad, dtype=x.dtype)])).reshape(-1, n).max(axis=1)
    return np.repeat(a, n)[: len(x)]


def polish(x, target_db=-19.0, gain_db=0.0):
    """Trim silence, level to a common loudness, add tiny fades."""
    if len(x) == 0:
        return x
    env = envelope(x)
    peak = float(env.max()) or 1.0
    thr = max(0.02 * peak, 0.004)
    idx = np.nonzero(env > thr)[0]
    if len(idx) == 0:
        return np.zeros(0, dtype=np.float32)
    a = max(0, idx[0] - int(0.025 * SR))
    b = min(len(x), idx[-1] + int(0.07 * SR))
    x = x[a:b].copy()
    env = env[a:b]
    active = x[env > 0.06 * peak]
    rms = float(np.sqrt(np.mean(active ** 2))) if len(active) else 0.05
    g = min(8.0, (10 ** ((target_db + gain_db) / 20.0)) / max(rms, 1e-4))
    x *= g
    pk = float(np.abs(x).max())
    if pk > 0.9:
        x *= 0.9 / pk
    f = int(0.008 * SR)
    if len(x) > 2 * f:
        ramp = np.linspace(0, 1, f, dtype=np.float32)
        x[:f] *= ramp
        x[-f:] *= ramp[::-1]
    return x


def render(seq, wavs):
    """Lay clips on a timeline. Returns (samples, cues)."""
    parts, cues, t = [np.zeros(int(0.6 * SR), dtype=np.float32)], [], 0.6
    for c in seq:
        if c.kind == "you":
            n = int(c.gap * SR)
            cues.append(dict(a=round(t, 2), b=round(t + c.gap, 2), k="you", p=c.part, i=c.item, e=c.ep))
            parts.append(np.zeros(n, dtype=np.float32)); t += c.gap
            continue
        x = wavs[(c.key(), c.gain_db)]
        d = len(x) / SR
        cue = dict(a=round(t, 2), b=round(t + d, 2), k=c.kind, i=c.item, e=c.ep)
        if c.kind == "r":
            cue["x"] = c.text
        else:
            cue["p"] = c.part
        if c.kind == "v":
            cue["w"], cue["m"] = c.who, c.mood
        cues.append(cue)
        parts.append(x); t += d
        g = int(c.gap * SR)
        parts.append(np.zeros(g, dtype=np.float32)); t += c.gap
    return np.concatenate(parts), cues


def pad_bed(n, seed=7):
    """A soft, slowly breathing A-add9 drone to sit far under the voices."""
    rng = np.random.default_rng(seed)
    t = np.arange(n, dtype=np.float64) / SR
    out = np.zeros(n, dtype=np.float64)
    notes = [(110.00, 1.0), (164.81, 0.8), (220.00, 0.7), (246.94, 0.45), (277.18, 0.5), (329.63, 0.35), (440.0, 0.12)]
    for f, amp in notes:
        for det in (-0.21, 0.17):
            ph = rng.uniform(0, 2 * np.pi)
            lfo_p = rng.uniform(13, 29)
            lfo = 0.6 + 0.4 * np.sin(2 * np.pi * t / lfo_p + rng.uniform(0, 2 * np.pi))
            out += amp * lfo * np.sin(2 * np.pi * (f + det) * t + ph)
    out /= np.sqrt(np.mean(out ** 2))
    out *= 10 ** (-33 / 20.0)
    fade = int(4 * SR)
    ramp = np.linspace(0, 1, fade)
    out[:fade] *= ramp
    out[-fade:] *= ramp[::-1]
    return out.astype(np.float32)


def write_wav(path, x):
    y = np.clip(x, -1, 1)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((y * 32767).astype(np.int16).tobytes())


def encode_m4a(wav, out, kbps=48):
    for codec in ("aac_at", "aac"):
        r = subprocess.run([FF, "-v", "error", "-y", "-i", str(wav), "-c:a", codec, "-b:a", f"{kbps}k",
                            "-movflags", "+faststart", str(out)], capture_output=True)
        if r.returncode == 0 and out.exists() and out.stat().st_size > 1000:
            return codec
    raise RuntimeError(r.stderr.decode())


def encode_mp3(wav, out, title, track, kbps=64, ss=None, to=None):
    cmd = [FF, "-v", "error", "-y"]
    if ss is not None:
        cmd += ["-ss", f"{ss:.3f}", "-to", f"{to:.3f}"]
    cmd += ["-i", str(wav), "-c:a", "libmp3lame", "-b:a", f"{kbps}k",
            "-metadata", f"title={title}", "-metadata", "artist=Reem & friends",
            "-metadata", "album=Yalla Saeed", "-metadata", f"track={track}", str(out)]
    subprocess.run(cmd, check=True)


def strip_marks(s):
    return re.sub(r"[ً-ْٰـ]", "", s)


# ------------------------------------------------------------------ main
def main():
    lesson, drift = plan()
    jobs = {}
    for c in lesson + drift:
        t = c.tts()
        if t:
            jobs[c.key()] = t
    n_ar = sum(1 for t in jobs.values() if t[0].startswith("ar-"))
    print(f"lesson clips {len(lesson)}, drift clips {len(drift)}, unique TTS {len(jobs)} ({n_ar} Arabic voice-pack clips)")
    if "--plan" in sys.argv:
        return
    asyncio.run(fetch_all(jobs))

    print("decoding + levelling…")
    raw = {k: decode(CACHE / f"{k}.mp3") for k in jobs}
    wavs = {}
    for c in lesson + drift:
        k = c.key()
        if not k or (k, c.gain_db) in wavs:
            continue
        extra = C.MOODS[c.mood][5] if c.kind == "v" else 0
        wavs[(k, c.gain_db)] = polish(raw[k], gain_db=c.gain_db + extra)
        if len(wavs[(k, c.gain_db)]) < 0.12 * SR:
            raise RuntimeError(f"clip too short after trim: {c.tts()}")

    OUT_AUDIO.mkdir(exist_ok=True)
    DIST.mkdir(exist_ok=True)
    tmp = Path(__file__).resolve().parent / ".cache"
    L, Lc = render(lesson, wavs)
    D, Dc = render(drift, wavs)
    DP = D + pad_bed(len(D))
    write_wav(tmp / "lesson.wav", L); write_wav(tmp / "drift.wav", D); write_wav(tmp / "drift-pad.wav", DP)
    codec = encode_m4a(tmp / "lesson.wav", OUT_AUDIO / "lesson.m4a")
    encode_m4a(tmp / "drift.wav", OUT_AUDIO / "drift.m4a")
    encode_m4a(tmp / "drift-pad.wav", OUT_AUDIO / "drift-pad.m4a")
    print("encoded with", codec)

    # ---- data.js
    def span(cues, key, val):
        xs = [c for c in cues if c[key] == val]
        return [xs[0]["a"], round(xs[-1]["b"] + 0.3, 2)] if xs else [0, 0]

    def track(name, samples, cues):
        p = OUT_AUDIO / f"{name}.m4a"
        return dict(src=f"audio/{name}.m4a", dur=round(len(samples) / SR, 2), bytes=p.stat().st_size,
                    hash=hashlib.sha1(p.read_bytes()).hexdigest()[:10])

    episodes, gi = [], 0
    for ei, ep in enumerate(C.EPISODES):
        items = []
        for it in ep["items"]:
            items.append(dict(id=it["id"], n=gi, v=it["v"], ar=strip_marks(it["v"]), tl=it["tl"], en=it["en"],
                              emoji=it["emoji"], hook=it["hook"], say=fmt(it["mean"]),
                              ph=dict(v=it["ph"]["v"], tl=it["ph"]["tl"], en=it["ph"]["en"]),
                              L=span(Lc, "i", gi), D=span(Dc, "i", gi)))
            gi += 1
        episodes.append(dict(id=ep["id"], title=ep["title"], sub=ep["sub"], emoji=ep["emoji"], color=ep["color"],
                             L=span(Lc, "e", ei), D=span(Dc, "e", ei), items=items))
    data = dict(
        version=VERSION, built=time.strftime("%Y-%m-%d"), learner=NAME,
        reem=dict(name=C.REEM["name"], ar=C.REEM["ar"], bio=C.REEM["bio"]),
        cast={c[0]: dict(name=c[1], city=c[2], g=c[4], emoji=c[5]) for c in C.CAST},
        moods={k: dict(label=v[0], emoji=v[1]) for k, v in C.MOODS.items()},
        tracks=dict(lesson=track("lesson", L, Lc), drift=track("drift", D, Dc), driftPad=track("drift-pad", DP, Dc)),
        cues=dict(lesson=Lc, drift=Dc),
        episodes=episodes,
    )
    (ROOT / "data.js").write_text("window.YS=" + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n",
                                  encoding="utf-8")

    # ---- plain MP3s for any music player
    mp3dir = DIST / "mp3"
    if mp3dir.exists():
        shutil.rmtree(mp3dir)
    mp3dir.mkdir(parents=True)
    for ei, ep in enumerate(episodes):
        a, b = ep["L"]
        if ei == len(episodes) - 1:
            b = len(L) / SR
        encode_mp3(tmp / "lesson.wav", mp3dir / f"{ei + 1:02d} - {ep['title']} (lesson with Reem).mp3",
                   f"{ep['title']} — lesson with Reem", ei + 1, ss=max(0, a - 0.4), to=b)
    encode_mp3(tmp / "drift-pad.wav", mp3dir / f"{len(episodes) + 1:02d} - Drift (all words, sleepy loop).mp3",
               "Drift — all words, sleepy loop", len(episodes) + 1)

    mins = lambda s: f"{int(s // 60)}:{int(s % 60):02d}"  # noqa: E731
    print(f"lesson {mins(len(L) / SR)}  drift {mins(len(D) / SR)}  items {gi}")
    for p in sorted(OUT_AUDIO.glob("*.m4a")):
        print(f"  {p.name}: {p.stat().st_size / 1e6:.1f} MB")
    json.dump(dict(jobs={k: list(v) for k, v in jobs.items()}), open(tmp / "jobs.json", "w"), ensure_ascii=False)


if __name__ == "__main__":
    main()
