"""Builds src/timeline.json, the one clock of the film, from the chosen ElevenLabs takes and their word timings.

    python3 tools/timeline.py

For each scene: a lead-in, its voiceover, a tail. Every take is brought to the same loudness (static gain to
-18 LUFS) as public/audio/vo/<scene>.mp3. Word timings come from ElevenLabs (tools/words/<take>.json) and are
made absolute; captions are phrases of those words.
"""
import json, os, re, subprocess

FPS = 30
# scene, take, lead-in before the voice, tail after it (seconds)
PLAN = [
    ("cold", "vo1a", 0.6, 0.65),
    ("title", "vo2a", 0.4, 0.65),
    ("chain", "vo3a", 0.5, 0.7),
    ("measured", "vo4a", 0.5, 0.7),
    ("worst", "vo5a", 0.6, 0.8),
    ("real", "vo6a", 0.6, 0.7),
    ("arkiv", "vo7b", 0.6, 0.65),
    ("cre", "vo8c", 0.6, 0.75),
    ("close", "vo9a", 0.6, 4.3),
]
CHAPTERS = {"chain": "Uniswap v4", "measured": "Uniswap v4", "worst": "Uniswap v4", "real": "Uniswap v4", "arkiv": "Arkiv", "cre": "Chainlink CRE"}
TARGET_LUFS = -18.0


def duration(path):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True, check=True).stdout)


def loudness(path):
    err = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    return float(re.findall(r"I:\s+(-?[\d.]+) LUFS", err)[-1])


def clean(text):
    return text.replace("C.R.E.", "CRE")


BREAK_BEFORE = {"to", "and", "with", "for", "from", "that", "which", "so", "into", "while", "before", "on", "through", "in", "of", "the"}


def phrases(words):
    """Caption chunks: break after . ? : ; or ..., after a comma once a chunk has 3 words, and split a run longer
    than 8 words before a function word (to, and, with, ...)."""
    out, cur = [], []
    for w in words:
        cur.append(w)
        t = w["text"]
        n = len(cur)
        if (re.search(r"[.?!:;]$|\.\.\.$", t) and n >= 2) or (t.endswith(",") and n >= 3):
            out.append(cur)
            cur = []
        elif n >= 9:
            k = max((i for i in range(3, n) if cur[i]["text"].lower() in BREAK_BEFORE), default=n)
            out.append(cur[:k])
            cur = cur[k:]
    if cur:
        if out and len(cur) < 2:
            out[-1] += cur
        else:
            out.append(cur)
    return [{"text": " ".join(w["text"] for w in c).replace("...", "…"), "start": c[0]["start"], "end": c[-1]["end"]} for c in out]


os.makedirs("public/audio/vo", exist_ok=True)
t = 0.0
scenes, vo = {}, {}
for scene, take, lead, tail in PLAN:
    src = f"public/audio/takes/{take}.mp3"
    dst = f"public/audio/vo/{scene}.mp3"
    gain = TARGET_LUFS - loudness(src)
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-af", f"volume={gain:.2f}dB", "-c:a", "libmp3lame", "-b:a", "192k", dst], check=True)
    d = duration(dst)
    start = round(t + lead, 3)
    raw = json.load(open(f"tools/words/{take}.json"))
    raw = raw["words"] if isinstance(raw, dict) else raw
    words = [{"text": clean(w["text"]), "start": round(start + w["start"], 3), "end": round(start + w["end"], 3)}
             for w in raw if w.get("type", "word") == "word" and not re.fullmatch(r"\[[^\]]+\]", w["text"])]
    vo[scene] = {"take": take, "file": f"audio/vo/{scene}.mp3", "start": start, "duration": round(d, 3), "gain_db": round(gain, 2),
                 "words": words, "phrases": phrases(words)}
    end = round(start + d + tail, 3)
    scenes[scene] = [round(t, 3), end]
    t = end

timeline = {"fps": FPS, "duration": round(t, 3), "scenes": scenes, "chapters": CHAPTERS, "vo": vo}
json.dump(timeline, open("src/timeline.json", "w"), indent=1)
for s, (a, b) in scenes.items():
    print(f"{s:9s} {a:7.2f} -> {b:7.2f}  ({b - a:5.2f}s)  voice {vo[s]['take']} {vo[s]['duration']:.2f}s  gain {vo[s]['gain_db']:+.1f} dB")
print(f"total {t:.2f}s = {int(t // 60)}:{t % 60:05.2f}")
