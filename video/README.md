# The HookTax demo video

A 3:05 film for the ETHGlobal Mumbai partner prizes (Uniswap v4, Arkiv, Chainlink CRE), built with Remotion. It runs
over real captures of the live HookAtlas and real terminal runs, with an ElevenLabs voiceover (voice "Aditya –
Expressive & Natural Narrator", model `eleven_v4`) and burned-in captions.

| Scene | Time | On screen | Source |
|---|---|---|---|
| Cold open, title | 0:00–0:20 | swap → PoolManager → hook diagram, the two questions | drawn |
| Every hook, from the chain | 0:20–0:47 | real `Initialize` events, 186,872 / 47,130 / 11,242, the 14 permission bits of two hooks | `data/pools.json`, README numbers |
| Measured take | 0:47–1:09 | the real money trace of one fork swap, then the live hook page | `data/sim-results.json`; capture of `#/hook/0x676E…` |
| Worst case, proved | 1:09–1:38 | `make demo`, replayed at the speed it printed | `tools/demo.typescript` + `tools/demo.timing` (a real run) |
| On real hooks | 1:38–2:03 | 35 → 24 → 19 → 5, then the live page of a proved hook | `docs/measurement.md`; capture of `#/hook/0x7074…` |
| Arkiv | 2:03–2:30 | the live HookAtlas: filters, the Arkiv query, the curl | capture of the live site; `atlas-query.json` |
| Chainlink CRE | 2:30–2:56 | the workflow's flow, then the recorded `cre workflow simulate` output | output copied verbatim from `docs/cre-simulation.md` (re-typeset, labelled) |
| Close | 2:56–3:05 | recap, links | drawn |

What is on screen is labelled for what it is:
- **Live-site footage plays at real speed.** `tools/record.cjs` drives https://bilgin-kocak.github.io/hooktax/ with
  Playwright and records Chrome's screencast frames with their real timestamps, so nothing is sped up. The drawn
  cursor is the scripted mouse. The video only trims clips and holds their last frame.
- **The `make demo` terminal is a real run** (`script --log-timing`), replayed chunk by chunk at the recorded times.
- **The CRE terminal is the recorded output** of the 2026-11-05 simulation, re-typeset line by line. Its title bar
  says so.

## Build

```bash
npm ci
```

```bash
npm run render
```

`npm run render` writes `out/hooktax-raw.mp4`, then `tools/master.sh` brings the audio to -14 LUFS as
`out/hooktax.mp4`. `npm run studio` opens the Remotion editor. `node tools/stills.mjs <bundle> <outdir> 12.5 47.6`
renders stills at the given seconds from a `npx remotion bundle` output.

Rebuilding the inputs:

| Step | Command | Writes |
|---|---|---|
| live-site captures | `node tools/record.cjs [atlas hook676e hook7074 measured]` | `public/capture/*.mp4`, `*.json` |
| scene data | `python3 tools/data.py` | `src/data.json` |
| the timeline (scene windows, voice, captions) | `python3 tools/timeline.py` | `src/timeline.json`, `public/audio/vo/*.mp3` |

The voiceover takes came from the ElevenLabs MCP connector (one flow, two takes per scene). `tools/takes.tsv` lists
each take's generation id, and `tools/words/` holds the word timings ElevenLabs returned for the chosen takes. Takes
`vo7b` and `vo8c` were chosen after a speech-to-text check: the first scene-8 takes, which spelled CRE in IPA, came
back as "CRI", so scene 8 was regenerated with "C.R.E.".

**ETHGlobal's video rules** for Mumbai say "DO NOT use a text to speech synthesizer / AI Voiceover". To swap in a
human voice, record one clip per scene, put them at `public/audio/takes/<scene>-human.mp3`, point `PLAN` in
`tools/timeline.py` at them, and run `tools/timeline.py` (and `tools/words/` from a transcription) again. The
scenes are timed from the timeline, so they follow the new voice.
