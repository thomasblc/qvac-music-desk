// QVAC MUSIC DESK - the expander
// ---------------------------------------------------------------------------
// Turns a sentence like "music for my exploration game, mystical, full of
// secrets, voices that rise in power" into the song sheet the engine wants: a
// prose caption, lyrics with structure tags, a tempo, a key, a length.
//
// WHY THIS EXISTS WHEN THE ENGINE HAS simpleMode
//
// ACE-Step's own LM does the same job with `simpleMode: true`, for free, with no
// extra model. Two measured reasons that is not enough on its own:
//
//   1. It does not return what it composed. `AudiogenStats` carries duration,
//      timing and backend, and nothing else, so there is no caption to show and
//      nothing to edit. You reseed and hope.
//   2. It overrides the length. Measured on this machine: a plain call asked for
//      8 s and produced 7.2 s; simpleMode asked for 8 s and produced 28.2 s,
//      asked for 16 s and produced 36.2 s, repeatably per seed. Anyone who needs
//      thirty seconds for a video cannot get it from simpleMode.
//
// So simpleMode stays, as the Surprise me button, and this writes the sheet you
// can read and argue with. Both write the SAME object, which is what stops the
// desk becoming two products.
//
// The system prompt is not my taste. Every rule in it comes from the ACE-Step
// authors' own prompting guide, quoted in docs/ux-review.html.
// ---------------------------------------------------------------------------

import { SECTIONS, COLOUR_TAGS, CHIPS } from './vocab.mjs'

/**
 * Words that name a sound source or a genre, drawn from the desk's own chip
 * vocabulary plus the obvious families. Used to CHECK that a caption says what
 * is playing, because a caption of pure mood is the failure that produced a
 * drum beat on a request for an ambient temple bed.
 */
const SOUND_WORDS = (function () {
  const fromChips = CHIPS
    .filter(([group]) => group === 'Genre' || group === 'Instruments' || group === 'Voice')
    .flatMap(([, words]) => words)
    .flatMap((w) => w.split(/\s+/))
  const extra = ['orchestra', 'orchestral', 'strings', 'cello', 'cellos', 'violin', 'viola',
    'piano', 'guitar', 'bass', 'drums', 'drum', 'percussion', 'synth', 'synthesizer', 'pad',
    'choir', 'vocal', 'vocals', 'voice', 'voices', 'flute', 'clarinet', 'oboe', 'bassoon',
    'trumpet', 'trombone', 'horn', 'tuba', 'harp', 'organ', 'cymbal', 'gong', 'chimes',
    'bells', 'marimba', 'kalimba', 'sitar', 'oud', 'banjo', 'mandolin', 'accordion',
    'saxophone', 'sax', 'rhodes', 'wurlitzer', 'mellotron', 'theremin', 'drone', 'ambient',
    'orchestration', 'woodwind', 'woodwinds', 'brass', 'timpani', 'taiko', 'shaker',
    'rock', 'jazz', 'blues', 'funk', 'soul', 'metal', 'punk', 'reggae', 'ska', 'house',
    'techno', 'trance', 'dubstep', 'garage', 'ambient', 'classical', 'baroque', 'romantic',
    'cinematic', 'orchestral', 'electronic', 'acoustic', 'folk', 'country', 'gospel',
    'hip', 'hop', 'trap', 'drill', 'grime', 'salsa', 'cumbia', 'bossa', 'samba', 'tango',
    'afrobeat', 'highlife', 'soundtrack', 'score', 'underscore']
  return new Set([...fromChips, ...extra].map((w) => w.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean))
})()

/** Does this caption say what is playing, or only how it feels? */
function namesASound (caption) {
  const words = String(caption).toLowerCase().split(/[^a-z]+/).filter(Boolean)
  return words.some((w) => SOUND_WORDS.has(w))
}

/**
 * A brief describing an atmosphere rather than a groove. Sending `bpm` or
 * `timesignature` for one of these is a statement that the music is metred, and
 * that is what invites a drum beat nobody asked for.
 */
const ATMOSPHERIC = /\b(ambient|ambience|atmospher\w*|drone|texture|textures|soundscape|underscore|bed|pad|pads|score|exploration|explore|exploring|mystical|mystic|ethereal|meditat\w*|calm|serene|floating|dreamlike|background|wandering|contemplativ\w*|atmosphere|nappe|ambiance|planant\w*|contemplatif)\b/i
/** And words that mean there IS a groove, which win when both appear. */
const RHYTHMIC = /\b(beat|beats|groove|groovy|drums?|percussion|rhythm\w*|danc\w*|bpm|tempo|four on the floor|breakbeat|808|kick|snare|hi-?hat|club|banger|uptempo|marching|march|rythme|batterie|percussions?)\b/i

/** The writing model. Small, and already on disk for anyone who has run a QVAC recipe. */
const PREFERRED = ['QWEN3_4B_Q4_K_M', 'QWEN3_1_7B_INST_Q4', 'QWEN3_600M_INST_Q4']

const SYSTEM = `You turn a person's description of the music they want into a song sheet for the
ACE-Step music model. You are not a chat assistant. You return one JSON object and nothing else.

FIRST, DECIDE ABOUT VOICES. THIS IS THE MOST COMMON MISTAKE.
Read the brief for any human voice at all: singing, a singer, vocals, a choir, voices, humming,
chanting, a chant, whispers, harmonies, a lead, a rapper, spoken word, or the same words in
another language such as voix, chant, choeur, chorale, chanteur, voces, coro, stimmen.
If ANY of those appear, then instrumental is false and the lyrics field MUST contain structure
tags and lines. Wordless voices still count as singing: a choir with no words is not instrumental,
it is short syllabic lines with the voice colour tags.
Only set instrumental true when the brief asks for no voices, or says instrumental, or names only
instruments and never a voice.
Never write "vocals" or "choir" in the caption and then set instrumental true. That contradiction
is the failure to avoid.

CAPTION
Prose, not a comma-separated list. A short paragraph describing the whole song's vibe.
15 to 25 words. Between 5 and 12 specific keywords; past 15 they dilute each other.

THE CAPTION MUST NAME WHAT IS PLAYING. This is the second most common mistake and it ruins the
result. A caption made only of moods, such as "mysterious and mystic, with a haunting melody and
ethereal textures, evoking a sense of exploration", tells the model nothing about the sound, so
it falls back on what it has heard most, which is a song with a drum beat. Always name at least
one genre AND at least two actual instruments or sound sources.
  weak    Mysterious and haunting, ethereal textures, evoking ancient secrets
  strong  Ambient orchestral underscore, low sustained cellos and a breathy choir pad, sparse
          harp harmonics, no percussion, deep stone-room reverb, patient and secretive

Specific beats vague: write "grand piano" not "piano", "fingerpicked acoustic guitar" not "guitar".
Cover genre, emotion, instruments, texture, era and vocal character.
If the music should have no drums or no pulse, SAY SO in the caption: "no percussion" or
"no drums, no pulse". Leaving rhythm unmentioned is not the same as excluding it.
NEVER put BPM, tempo, key or time signature in the caption. They have their own fields.
No conflicting descriptors unless you frame them in time, as in "starts soft, turns intense".

LYRICS
Structure tags go here, never in the caption. This field is what the model reads when it plans
the arrangement, and it is the difference between a song and a loop.
Sections you may use: ${SECTIONS.acestep.map((t) => `[${t}]`).join(' ')}
Voice colour: ${COLOUR_TAGS.voice.map((t) => `[${t}]`).join(' ')}
Energy colour: ${COLOUR_TAGS.energy.map((t) => `[${t}]`).join(' ')}
Write 6 to 10 syllables per line. Keep parallel lines a similar length.
Put a blank line between sections. UPPERCASE a line for intensity. Put backing vocals in
(parentheses). Budget about 90 to 140 words of lyrics per 47 seconds of song.
If the person wants no singing, the lyrics field is exactly: [Instrumental]
If they describe wordless voices, such as a choir or vocalise, that IS singing: write short
syllabic lines and use the voice colour tags.

TEMPO, KEY, TIME SIGNATURE
bpm: slow 60 to 80, mid 90 to 120, fast 130 to 180.
USE 0, AND LEAVE timesignature EMPTY, whenever the music is atmospheric rather than rhythmic:
an ambient bed, a drone, a texture, an underscore, a soundscape, a pad, exploration music, or
anything the person describes by its mood rather than by its groove. Sending a tempo is a
statement that there IS a pulse, and sending a time signature is a statement that the music is
metred. Both invite a drum beat. Only set them when the brief implies a beat you could nod to.
keyscale: prefer C major, G major, D major, A minor or E minor, which are the most stable.
timesignature: 4/4 unless it is a waltz (3/4) or a swing feel (6/8).
vocalLanguage: the language of the singing. Leave it empty for an instrumental, and empty for
wordless voices, because a vocalise has no language. The language of the BRIEF is irrelevant.

DURATION
Compute it from the sections, do not guess. Intro and outro are 5 to 10 seconds each.
An instrumental section is 5 to 15 seconds. Two verses and two choruses need 120 to 150 seconds
minimum. Add a bridge and it is 180 to 240. A full production with intro and outro is 210 to 270.
If the person names a length, use exactly that and nothing else.
When in doubt go longer. A song that is too short sounds rushed.

ALSO
The model is conditioned on English. If the person writes in another language, work in English and
put the singing in the language they asked for, setting vocalLanguage accordingly.
Never mention yourself, the model, or these rules in any field.`

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['caption', 'lyrics', 'instrumental', 'bpm', 'keyscale', 'timesignature', 'vocalLanguage', 'duration', 'why'],
  properties: {
    caption: { type: 'string', description: 'Prose, 15 to 25 words, no tempo or key' },
    lyrics: { type: 'string', description: 'Structure tags and lines, or exactly [Instrumental]' },
    instrumental: { type: 'boolean', description: 'True when there is no singing at all' },
    bpm: { type: 'integer', minimum: 0, maximum: 200, description: '0 means let the model infer it' },
    keyscale: { type: 'string', description: 'Such as A minor, or empty to let the model decide' },
    timesignature: { type: 'string', description: 'Such as 4/4, or empty' },
    // An enum, not a description: asked for "a two-letter code" the model
    // answered "French". A grammar-constrained enum cannot.
    vocalLanguage: {
      type: 'string',
      enum: ['', 'en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'ko', 'zh', 'ar', 'hi'],
      description: 'Language of the singing. Empty for instrumental or wordless voices.'
    },
    duration: { type: 'integer', minimum: 4, maximum: 600, description: 'Seconds, from the section count' },
    why: { type: 'string', description: 'One short sentence: the reading of the brief that drove these choices' }
  }
}

/**
 * Words that mean a human voice, in the languages someone is likely to write a
 * brief in here. Used to CHECK the model's answer, not to replace it: a prompt
 * rule is a request, and this one was measured being ignored. The first run on
 * a real brief asking for "plusieurs voix qui montent en puissance" came back
 * instrumental with "ethereal vocals" in its own caption.
 */
const VOICE_WORDS = /\b(vocal|vocals|voice|voices|sing|singer|singing|sung|choir|chorale|chant|chanting|hum|humming|whisper|whispered|harmon|rapper|rap|spoken word|lyric|lyrics|vocalise|acappella|a cappella|voix|chanteur|chanteuse|choeur|ch(o|\u0153)ur|paroles|voces|coro|cantante|stimmen|chor|gesang|canto|vozes)\b/i
/**
 * The brief explicitly ASKING for a singing language, as opposed to merely being
 * written in one. Measured need: a French brief came back with English lyrics and
 * `vocalLanguage: "fr"`, which tells the engine to sing English words in French.
 * Unless the brief asks, the field is left empty and the engine infers it from
 * the lyrics, which is the only thing that cannot contradict them.
 */
const ASKS_LANGUAGE = /\b(in|sung in|vocals? in|lyrics in|sing in|en|chant(?:e|ed)? en|paroles en)\s+(english|spanish|french|german|italian|portuguese|japanese|korean|chinese|mandarin|arabic|hindi|anglais|espagnol|fran(?:c|\u00e7)ais|allemand|italien|portugais|japonais|cor(?:e|\u00e9)en|chinois|arabe)\b/i
const LANGUAGE_CODES = {
  english: 'en', anglais: 'en', spanish: 'es', espagnol: 'es', french: 'fr', 'français': 'fr',
  francais: 'fr', german: 'de', allemand: 'de', italian: 'it', italien: 'it',
  portuguese: 'pt', portugais: 'pt', japanese: 'ja', japonais: 'ja', korean: 'ko',
  'coréen': 'ko', coreen: 'ko', chinese: 'zh', mandarin: 'zh', chinois: 'zh',
  arabic: 'ar', arabe: 'ar', hindi: 'hi'
}

/** And words that mean the opposite, which win when both appear. */
const NO_VOICE_WORDS = /\b(instrumental|no vocals?|without vocals?|no singing|no voice|sans voix|sans paroles|instrumentale?|solo piano only)\b/i

let sdk = null
let modelId = null
let chosen = null
let loadError = null

/** Loads the SDK lazily so the desk still starts when it is not installed. */
async function ensureSdk () {
  if (sdk) return sdk
  sdk = await import('@qvac/sdk')
  return sdk
}

/**
 * Is a writing model already on this machine? The desk never downloads: a
 * 2.5 GB surprise on first click is not an onboarding experience, and the
 * Surprise me door works without any of this.
 */
export async function probe (cachedModelFiles) {
  try {
    const s = await ensureSdk()
    for (const name of PREFERRED) {
      const entry = s[name]
      if (!entry) continue
      if (cachedModelFiles.some((f) => f.endsWith(entry.modelId))) {
        chosen = { name, entry }
        return { available: true, model: name, params: entry.params, sizeBytes: entry.expectedSize }
      }
    }
    const first = PREFERRED.map((n) => s[n]).find(Boolean)
    return {
      available: false,
      why: 'no writing model in ~/.qvac/models',
      couldDownload: first ? { model: PREFERRED[0], sizeBytes: first.expectedSize } : null
    }
  } catch (e) {
    return { available: false, why: `@qvac/sdk not usable here: ${e.message}` }
  }
}

async function ensureLoaded () {
  if (modelId) return modelId
  if (loadError) throw new Error(loadError)
  if (!chosen) throw new Error('no writing model available')
  const s = await ensureSdk()
  try {
    modelId = await s.loadModel({
      modelSrc: chosen.entry,
      modelConfig: {
        // Wide enough for the rules plus a long brief plus a full sheet back.
        ctx_size: 8192,
        device: 'gpu',
        // Near-greedy: this is a translation job, not a creative one. The
        // creativity is the music model's.
        temp: 0.4,
        predict: 1400,
        // Qwen3 is a thinking model and a think block is not a song sheet.
        reasoning_budget: 0
      }
    })
    return modelId
  } catch (e) {
    loadError = `could not load the writing model: ${e.message}`
    throw new Error(loadError)
  }
}

/** Frees the writing model, so the music engine gets the memory back. */
export async function unload () {
  if (!modelId) return
  const s = await ensureSdk()
  const id = modelId
  modelId = null
  try { await s.unloadModel({ modelId: id, clearStorage: false }) } catch { /* going away anyway */ }
}

/**
 * Expands a brief into a sheet.
 *
 * `keep` holds the fields the person has already edited. They are passed to the
 * model as decisions already made, and then written back over whatever it said,
 * because a field someone touched is theirs. That rule is the whole reason the
 * expert door and the friendly door can share one screen.
 */
export async function expand (brief, keep = {}) {
  const s = await ensureSdk()
  const id = await ensureLoaded()

  const fixed = Object.entries(keep)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v.replace(/\n/g, ' / ') : v}`)

  const history = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: fixed.length
        ? `${brief}\n\nAlready decided, keep these exactly and write everything else around them:\n${fixed.join('\n')}`
        : brief
    }
  ]

  const started = Date.now()
  const run = s.completion({
    modelId: id,
    history,
    stream: false,
    responseFormat: { type: 'json_schema', json_schema: { name: 'song_sheet', schema: SCHEMA } }
  })
  const final = await run.final
  let sheet = parseSheet(final)

  // The voices check. `keep.instrumental` means the person has already decided,
  // so it is never second-guessed.
  const briefWantsVoices = VOICE_WORDS.test(brief) && !NO_VOICE_WORDS.test(brief)
  let retried = false
  if (briefWantsVoices && sheet.instrumental && keep.instrumental === undefined) {
    retried = true
    const again = s.completion({
      modelId: id,
      history: [
        ...history,
        { role: 'assistant', content: JSON.stringify(sheet) },
        {
          role: 'user',
          content: 'That is wrong. The brief asks for voices, so instrumental must be false and ' +
            'the lyrics field must contain structure tags and sung lines. Wordless voices are ' +
            'still singing. Return the corrected JSON object.'
        }
      ],
      stream: false,
      responseFormat: { type: 'json_schema', json_schema: { name: 'song_sheet', schema: SCHEMA } }
    })
    const fixed = parseSheet(await again.final)
    if (!fixed.instrumental) sheet = fixed
  }

  // The schema constrains the shape, not the sense, so the numbers still get checked.
  const out = {
    caption: String(sheet.caption || '').trim(),
    lyrics: sheet.instrumental ? '[Instrumental]' : String(sheet.lyrics || '').trim(),
    instrumental: !!sheet.instrumental,
    bpm: clamp(sheet.bpm, 0, 200, 0),
    keyscale: String(sheet.keyscale || '').trim(),
    timesignature: String(sheet.timesignature || '').trim(),
    vocalLanguage: String(sheet.vocalLanguage || '').trim().toLowerCase(),
    duration: clamp(sheet.duration, 4, 600, 60),
    why: String(sheet.why || '').trim(),
    seconds: Math.round((Date.now() - started) / 100) / 10,
    model: chosen.name,
    notes: []
  }
  if (retried) out.notes.push('Read the brief as instrumental first. Asked again, because it names voices.')
  // Still contradicting itself after the retry: say so on the sheet rather than
  // pretend. The person is looking at the Voices switch and can fix it in a click.
  if (briefWantsVoices && out.instrumental) {
    out.notes.push('Your brief mentions voices but this came back instrumental. Turn Voices on and expand again, or write the lyrics yourself.')
  }
  if (!out.caption) throw new Error('the writing model returned an empty caption')

  // The authors put the caption at 15 to 25 words. Reported, never truncated:
  // cutting a caption mid-clause would change the music for the worse.
  const words = out.caption.split(/\s+/).filter(Boolean).length
  out.captionWords = words
  if (words > 30) out.notes.push(`The caption runs ${words} words. The model authors suggest 15 to 25, so trimming it may sharpen the result.`)

  // A caption carrying a tempo is the one thing the authors call out, so it is
  // stripped rather than trusted. The number still lives in its own field.
  const before = out.caption
  out.caption = out.caption
    .replace(/,?\s*\b\d{2,3}\s*(bpm|beats per minute)\b/gi, '')
    .replace(/,?\s*\bin\s+[A-G](#|b)?\s+(major|minor)\b/gi, '')
    .replace(/\s{2,}/g, ' ').replace(/\s+,/g, ',').replace(/,\s*$/, '').trim()
  if (out.caption !== before) out.strippedFromCaption = true

  // A caption of pure mood gives the model nothing to play, so it plays what it
  // has heard most, which is a song with a drum beat. Measured: "Mysterious and
  // mystic, with a haunting melody and ethereal textures, evoking a sense of
  // exploration and ancient secrets" produced exactly that on a request for a
  // temple bed. Ask again, naming the gap.
  if (keep.caption === undefined && !namesASound(out.caption)) {
    const again = s.completion({
      modelId: id,
      history: [
        ...history,
        { role: 'assistant', content: JSON.stringify(sheet) },
        {
          role: 'user',
          content: 'The caption names no genre and no instrument, only moods. That makes the ' +
            'model fall back on a generic song with a drum beat. Rewrite it naming at least one ' +
            'genre and at least two actual instruments or sound sources, and say "no percussion" ' +
            'if there should be none. Return the corrected JSON object.'
        }
      ],
      stream: false,
      responseFormat: { type: 'json_schema', json_schema: { name: 'song_sheet', schema: SCHEMA } }
    })
    try {
      const fixed = parseSheet(await again.final)
      if (fixed.caption && namesASound(fixed.caption)) {
        out.caption = String(fixed.caption).trim()
        out.captionWords = out.caption.split(/\s+/).filter(Boolean).length
        out.notes.push('The first caption was all mood and named no instrument, which is what makes this model reach for a drum beat. Asked again.')
      } else {
        out.notes.push('This caption names no genre or instrument, only moods. That is what makes the model default to a song with a beat. Add what is actually playing, for example "low sustained cellos, breathy choir pad, no percussion".')
      }
    } catch {
      out.notes.push('This caption names no genre or instrument, only moods, which invites a drum beat. Add what is actually playing.')
    }
  }

  // An atmospheric brief must not carry a pulse. A tempo says there is one and a
  // time signature says the music is metred; both invite percussion.
  const atmospheric = ATMOSPHERIC.test(brief) && !RHYTHMIC.test(brief)
  if (atmospheric) {
    if (keep.bpm === undefined && out.bpm) {
      out.notes.push(`Dropped the tempo it suggested (${out.bpm} bpm). This reads as atmosphere rather than a groove, and naming a tempo is what asks the model for a beat. Set one yourself if you want a pulse.`)
      out.bpm = 0
    }
    if (keep.timesignature === undefined && out.timesignature) {
      out.timesignature = ''
    }
  }

  // No singing means no singing language. The two together are incoherent and
  // the field was going out set on instrumental takes.
  if (out.instrumental && keep.vocalLanguage === undefined) out.vocalLanguage = ''

  // The language field only survives when the brief actually asked for one.
  if (keep.vocalLanguage === undefined && !out.instrumental) {
    const asked = ASKS_LANGUAGE.exec(brief)
    const code = asked ? LANGUAGE_CODES[asked[2].toLowerCase()] : null
    if (code) {
      out.vocalLanguage = code
    } else if (out.vocalLanguage && out.vocalLanguage !== 'en') {
      // The failure this guards is narrow and was measured: a French brief came
      // back with English lyrics and `fr`, which asks the engine to sing English
      // words in French. `en` is left alone, because the lyrics this model
      // writes are English unless the brief asked otherwise, so `en` agrees with
      // them rather than contradicting them.
      out.notes.push(`Cleared the singing language. It had guessed "${out.vocalLanguage}" from the language you wrote your brief in, but the lyrics above are English. Set it yourself if you want them sung in another language.`)
      out.vocalLanguage = ''
    }
  }

  // Anything the person had already decided wins, always.
  for (const [k, v] of Object.entries(keep)) {
    if (v !== undefined && v !== null && v !== '') out[k] = v
  }
  return out
}

function clamp (v, lo, hi, fallback) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(lo, Math.min(hi, Math.round(n)))
}

/** One JSON object out of a completion, with any reasoning block removed. */
function parseSheet (final) {
  const raw = String(final?.contentText ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim()
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('the writing model did not return a song sheet')
  }
}
