<!-- Built with QVAC badge goes under the H1, see docs/brand/badges/README.md -->

# QVAC Music Desk

Describe the music you want in a sentence, and get it. A local web app for on-device music
generation on the [QVAC](https://qvac.tether.io) stack. Nothing is uploaded, no account, no API key.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/badges/built-with-qvac-dark-mode-landscape-transparent.svg">
  <img alt="Built with QVAC" src="docs/badges/built-with-qvac-light-mode-landscape-transparent.svg" width="200">
</picture>

---

## Quickstart

```bash
npm install
npm start
# open http://localhost:3055
```

On first run the app has no model. The screen shows a banner with a **Download 3.3 GB** button
that fetches the four ACE-Step stages into `~/.qvac/models`, where every QVAC app shares them.
Nothing is downloaded without that click.

Requires **Node 20+**, **ffmpeg** on `PATH`, and roughly **8 GB of free RAM**. macOS, Linux and
Windows on x64 or arm64.

---

## For an agent working on this repo

Read this section before changing anything. It is the short version of what took a rebuild to learn.

### What the app is

| | |
|---|---|
| Port | `3055` |
| Server | `server.js`, Node, no framework, no build step |
| Client | `public/`, plain ES5-style JS, no framework, no bundler |
| Engine | `@qvac/audiogen-ggml`, a **Bare** native addon |
| Writing model | `@qvac/sdk`, optional, only for the Prompt mode expander |

**The engine cannot be required from Node.** `binding.js` is `require.addon()`, so every call into
it runs as a `bare` child process: `engine/worker.cjs` for a render, `engine/caps.cjs` for the
capability probe. If you add an engine call, it goes in a `.cjs` under `engine/` and it needs
`require('bare-process')` because Bare has no ambient `process`.

### Two modes, one song sheet

```
Prompt mode                          Manual mode
  brief textarea                       preset chips per dimension
  Write the sheet  -> local LLM        the fields, filled by hand
  Surprise me      -> engine simpleMode
        \                    /
         \                  /
        the song sheet (caption, lyrics, bpm, key, time, language, duration)
                     |
                 the engine
```

**The rule that holds the design together: a field the user has edited is never recomputed.**
`st.touched` in `public/app.js` records it, `/api/sheet` receives it as `keep`, and
`lib/sheet.mjs` writes those values back over whatever the model said. Break this and the friendly
door gets a ceiling and the expert door becomes a second product.

### The HTTP API

| Method and path | Body | Does |
|---|---|---|
| `GET /api/state` | | Everything: models, capabilities, takes, library, job, vocabulary, machine |
| `GET /api/events` | | SSE. Events: `job`, `take`, `queue`, `failed`, `library`, `models`, `download`, `ready` |
| `GET /api/models/catalogue` | | Every fetchable asset with size and whether it is on disk |
| `POST /api/models/download` | `{keys:[...]}` | Fetches those assets, progress on the `download` event |
| `POST /api/models` | `{mm3Dir}` | Points the desk at your MiniMax folder and rescans |
| `POST /api/sheet` | `{brief, keep}` | Expands a brief into a sheet. Needs the writing model |
| `POST /api/render` | see below | Queues one to four takes |
| `POST /api/cancel` | | Kills the running render and clears the queue |
| `POST /api/import` | raw bytes, `x-filename` header | Imports audio, converts it for the engine |
| `GET /api/audio/out/<file>` | | Serves a take, with Range support |

`POST /api/render` takes a task, never an engine:

```jsonc
{
  "task": "compose",        // compose | surprise | cover | repaint | extend | flow-edit | stem
  "sheet": { "caption": "...", "lyrics": "[Instrumental]", "instrumental": true,
             "bpm": 0, "keyscale": "", "timesignature": "", "vocalLanguage": "", "duration": 60 },
  "prefer": "fast",         // fast | vocals, only meaningful for compose
  "seed": 4242,
  "variations": 3,          // 1 to 4, rendered one at a time
  "formats": ["wav"],
  "source":    { "kind": "take", "id": "..." },   // required by cover, repaint, extend, flow-edit, stem
  "reference": { "kind": "library", "id": "..." },
  "op": { },                // per-task, see lib/ and server.js translateRequest()
  "coverStrength": "moderate",  // dramatic | moderate | subtle
  "track": "drums",             // stems only, one of caps.legoTracks
  "advanced": { }
}
```

### Rules that are not style preferences

1. **Never hand-write a capability table.** `engine/caps.cjs` asks the installed addon what it
   accepts: what it exports, and what its validator refuses when you call `run()` on paths that do
   not exist. The pass signal is the message `AudioGen is not loaded. Call load() first.`, which
   means every option cleared validation. A previous version carried a table, `package.json` pins
   the addon with a caret, `0.3.3` installed itself over `0.3.2` and the UI started lying.
2. **A prompt is a request. Code is the mechanism.** Every guard in `lib/sheet.mjs` exists because
   a rule in the system prompt was measured being ignored. See the next section.
3. **No standing paragraphs in the UI.** Explanation goes in a `title` on a help glyph, in a
   placeholder, or nowhere. The app once carried 229 words of grey body copy and the controls were
   hard to find. The rest of the front-end rules live in `.claude/skills/ui-ux-bible/SKILL.md` in
   the monorepo, and the ones that are measurable are enforced: four type sizes (11, 12, 14, 16),
   spacing only from `4 8 12 16 24 32`, three radii, every text at 4.5:1 or better, every target
   24px or bigger, no internal identifier on screen, and one primary action per state.
4. **Verify a model file by size, not by name.** An interrupted download leaves a short file under
   its final name with no partial marker, and the desk offered a 208 MB stub of a 2.55 GB DiT as a
   usable variant. `isTruncated()` in `server.js` compares against the registry's `expectedSize`.
5. **One engine process at a time.** Two at once on a 39 GB machine meets the out-of-memory killer.
   Variations go through `state.queue`.
6. **Each render judges only its own job.** With a queue, `state.job` may already hold the next
   variation when a child exits. Writing to it from a stale handler marked a healthy render failed.

### How to prompt the music model

From the ACE-Step authors' own guide, and this is most of the quality:

- **Caption**: prose, not a tag list. 15 to 25 words. Name a **genre** and at least **two
  instruments**. Never put a tempo or a key in it: they have their own fields.
- **A caption of pure mood produces a drum beat.** Measured. `"Mysterious and mystic, with a
  haunting melody and ethereal textures"` named nothing that plays, so the model fell back on its
  prior. Tempo lock went from **correlation 0.405** on that caption to **0.155** once the caption
  named instruments and said `no percussion`.
- **For anything atmospheric, send neither `bpm` nor `timesignature`.** A tempo asserts there is a
  pulse and a time signature asserts the music is metred. Both invite percussion.
- **Structure tags go in the lyrics, never in the caption.** That field is what the arrangement
  stage reads. Measured: caption-only takes had a 0.18 to 1.05 dB loudness spread across the track,
  which is one loop; structure tags reached 4.74 dB.
- Lyrics: 6 to 10 syllables a line, about 90 to 140 words per 47 seconds.
- Duration from the section count: two verses and two choruses need 120 s or more.

The two engines use **different structure-tag vocabularies**, so `lib/vocab.mjs` rewrites them for
whichever engine is about to read them and reports every change on the take.

### Measured performance on an M-series laptop

Compute divided by audio length, lower is faster.

| | ACE-Step 1.5 turbo-q4 | MiniMax-Music3 |
|---|---|---|
| Text to music | **0.12 to 0.29x** | 4.37x |
| Reference, cover, repaint, extend, stems | the only engine that can | refused by name |
| Output | 48 kHz stereo | 44.1 kHz stereo |

So the engine is decided by the task, not asked as a question. `engineFor()` in `server.js`.

### Verify a change

```bash
node --check server.js && node --check public/app.js
node engine/caps.cjs        # will fail: it needs bare
bare engine/caps.cjs        # prints the capability probe as one JSON line
npm start                   # then exercise the flow in a browser
```

There is no test suite. Verification here is a browser and the measurement scripts: an interrupted
download, a truncated file, a mood-only caption and a queue of three takes are all real bugs this
app has had, and all four were found by running it rather than by reading it.

---

## Models

Nothing is bundled and nothing downloads on its own.

| What | Size | How you get it |
|---|---|---|
| ACE-Step 1.5, four stages | 3.3 GB | The in-app Download button, or the Info panel |
| Qwen3 4B, the brief expander | 2.5 GB | The Info panel. Optional: Manual mode and Surprise me work without it |
| MiniMax-Music3 | 12.7 GB | **Yours to supply.** Not distributed by QVAC |

MiniMax-Music3 is under the MiniMax-Music3 Community Licence and this project does not ship it.
Point the desk at a folder holding `mm3-lm-*.gguf` and `mm3-synth-*.gguf`, in the Info panel or
with `MM3_DIR=/path npm start`. Without it, everything except the "Richer vocals" quality option
works.

Environment variables: `PORT`, `MM3_DIR`, `ACESTEP_DIR`.

## What it can do

Every operation lives on the take it applies to, and none of them is called by its API name.

| The call | What you press |
|---|---|
| text to music | Make music |
| `simpleMode` | Surprise me |
| a batch of seeds | Takes, 1 to 4 |
| `referenceAudio` | Use as reference |
| `taskType: 'cover-nofsq'` | Cover it, then Dramatic, Moderate or Subtle |
| `repaint` | Change this part, after dragging a range on the waveform |
| repaint on appended silence | Make it longer |
| `flowEdit` | Restyle it |
| `taskType: 'lego'` | Pull out a stem, 12 layers, needs the base DiT |

## Not in this version

- **Stems need the ACE-Step base DiT**, which the addon's own README says is not in the registry
  variant set yet, so it has to be supplied as an explicit path. The button says so.
- **`augmentCaptionWithMetadata`** does the one thing the ACE-Step authors list under things not to
  do. It is off, labelled, and unmeasured either way.
- **Surprise me cannot honour a length.** Measured: asked for 8 s it produced 28.2 s, asked for
  16 s it produced 36.2 s, repeatably per seed. It promises a song, not a duration.
- **No mp3 export.** The vendored ffmpeg has no LAME encoder. Thirteen other formats work.
- No test suite, no auth, no multi-user. It binds to localhost and is meant to.

## Layout

```
server.js              HTTP, model discovery, task routing, the render queue
engine/worker.cjs      one render, under bare
engine/caps.cjs        the capability probe, under bare
lib/sheet.mjs          the brief expander and its guards
lib/vocab.mjs          tag translation, presets, the cover-strength table
public/                index.html, app.js, styles.css
docs/ux-review.html    why the app is shaped like this, with the measurements
```

## Licence

Apache-2.0, see [LICENSE](LICENSE). Model weights are under their own licences and none of them
are included here.
