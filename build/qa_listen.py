#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Machine "listening" check: transcribe every cached clip with Whisper and
compare it with the text it was supposed to say.

  python build/qa_listen.py [--limit N]

Needs mlx-whisper (Apple silicon) with a local whisper-large-v3-turbo model and
an ffmpeg on PATH. Short single words are hard for any recogniser, so read the
report as a smoke test: it catches silence, wrong language and garbled clips,
not accent quality.
"""
import difflib, json, re, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import build_audio as B  # noqa: E402

MODEL = "mlx-community/whisper-large-v3-turbo"


def norm_ar(s):
    s = re.sub(r"[ً-ْٰـ]", "", s)
    s = re.sub(r"[أإآٱ]", "ا", s).replace("ة", "ه").replace("ى", "ي")
    return re.sub(r"[^ء-ي]", "", s)


def norm_en(s):
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def main():
    import mlx_whisper
    lesson, drift = B.plan()
    jobs = {}
    for c in lesson + drift:
        t = c.tts()
        if t:
            jobs[c.key()] = (c, t)
    items = list(jobs.items())
    if "--limit" in sys.argv:
        items = items[: int(sys.argv[sys.argv.index("--limit") + 1])]
    rows = []
    for n, (k, (c, t)) in enumerate(items):
        voice, rate, pitch, text = t
        lang = "en" if c.kind == "r" else "ar"
        try:
            r = mlx_whisper.transcribe(str(B.CACHE / f"{k}.mp3"), path_or_hf_repo=MODEL, language=lang, verbose=None)
            heard = r["text"].strip()
        except Exception as e:  # noqa: BLE001
            heard = f"<<error {e!r}>>"
        f = norm_en if lang == "en" else norm_ar
        a, b = f(text), f(heard)
        sim = difflib.SequenceMatcher(None, a, b).ratio() if a or b else 0.0
        rows.append(dict(key=k, kind=c.kind, who=c.who, mood=c.mood, voice=voice, text=text, heard=heard, sim=round(sim, 2)))
        if (n + 1) % 100 == 0:
            print(f"  … {n + 1}/{len(items)}", flush=True)
    out = Path(__file__).parent / ".cache" / "qa_listen.json"
    out.write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")

    def summary(label, rs):
        if not rs:
            return
        exact = sum(1 for r in rs if r["sim"] >= 0.99)
        close = sum(1 for r in rs if 0.6 <= r["sim"] < 0.99)
        bad = [r for r in rs if r["sim"] < 0.6]
        print(f"{label}: {len(rs)} clips · exact {exact} · close {close} · off {len(bad)}")

    summary("Reem English", [r for r in rows if r["kind"] == "r"])
    summary("Reem Arabic", [r for r in rows if r["kind"] == "ra"])
    for mood in B.C.MOODS:
        summary(f"cast · {mood}", [r for r in rows if r["kind"] == "v" and r["mood"] == mood])
    print("\nLowest matches:")
    for r in sorted(rows, key=lambda r: r["sim"])[:40]:
        print(f"  {r['sim']:.2f}  {r['who']:9s} {r['mood'] or r['kind']:8s}  want: {r['text'][:60]}  heard: {r['heard'][:60]}")


if __name__ == "__main__":
    main()
