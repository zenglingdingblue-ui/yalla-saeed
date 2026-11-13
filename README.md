# Yalla Saeed · يلا سعيد

Pocket Saudi Arabic for your ears. Put your headphones in, tap play, and Reem does the rest.

**Open the app:** https://zenglingdingblue-ui.github.io/yalla-saeed/

## What it is

A listen-first app for a beginner who wants to open his mouth in Riyadh, not pass a grammar exam.

- **Reem** (ريم) is the teacher: born in Riyadh, lives in Los Angeles, speaks English, calls you Saeed.
- **Fourteen friends** from Riyadh, Jeddah, Kuwait, Dubai, Abu Dhabi, Doha, Manama, Muscat and Amman say every word slow, normal, fast, asking, excited, deep, tiny and dreamy.
- **One word, one tiny phrase.** Masculine forms only. Street words over textbook words.
- **39 words** in four rounds: greetings, question words, time and meetings, ordering food.

Three screens:

| Screen | What it does |
| --- | --- |
| **Listen** | One tap, endless loop. *Lesson* mode is Reem teaching with the cast repeating. *Drift* mode is the slow, sleepy version with almost no talking and optional soft music. Works with the screen locked; the lock screen shows the current word. Repeat a word or a round, change speed, set a sleep timer. |
| **Peek** | Sticker cards for every word. Tap one to hear each voice, read Reem's tip, and see the word spelled letter by letter. |
| **Ear test** | Someone from the cast says a word, you pick the meaning. |

## Use it on a plane

1. Open the link once while online and wait for **Ready offline** at the top.
2. iPhone: Share → **Add to Home Screen**. Android: menu → **Install app**.
3. That's it. No account, no server, no tracking. Everything lives on the phone.

Each release also ships two downloads on the [Releases page](https://github.com/zenglingdingblue-ui/yalla-saeed/releases):

- `yalla-saeed-<version>-app.zip` — the whole app. Unzip and open `index.html`, or host the folder anywhere.
- `yalla-saeed-<version>-mp3.zip` — the same audio as plain MP3s for any music player.

## Add words and ship a new version

Everything teachable is in [`build/content.py`](build/content.py): the words, the phrases, and every line Reem says.

```bash
pip install "edge-tts>=7.3" numpy imageio-ffmpeg
python build/build_audio.py        # voices → audio/*.m4a, data.js, dist/mp3/
python build/qa_listen.py          # optional: Whisper listens to every clip and reports mismatches
```

Bump `VERSION`, bump the cache name in `sw.js`, commit, push, and publish a release. GitHub Pages serves the `main` branch.

## Honest notes

- Reem and the cast are synthetic neural voices (Microsoft Edge voices via `edge-tts`), not recordings of real people. They lean a little formal: they say *q* where Riyadh says *g* (`gahwa`, `gabl`), and Reem says so in the lesson.
- The word list follows a real beginner class, weeks 1 to 3, plus a food round from the same class.
