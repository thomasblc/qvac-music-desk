// QVAC MUSIC DESK - the words, and whose words they are
// ---------------------------------------------------------------------------
// Two engines, two published structure-tag vocabularies, and they are not the
// same. The desk used to send one shared lyrics field to whichever engine was
// selected, with a palette of ten lowercase tags that matched neither list, so
// a MiniMax render could receive `[drop]`, which MiniMax does not document.
//
// Routing engines on the user's behalf only works if the section markers get
// rewritten on the way out. That is what `translateTags` is for.
//
// Sources, both from the model authors:
//   ACE-Step  github.com/ace-step/ACE-Step-1.5, .claude/skills/acestep-songwriting
//             and docs/en/ace_step_musicians_guide.md
//   MiniMax   github.com/MiniMax-AI/skills, minimax-music-guide.md, and
//             platform.minimax.io/docs/api-reference/music-generation
// ---------------------------------------------------------------------------

/** Section markers each engine documents. Canonical spelling is ACE-Step's. */
export const SECTIONS = {
  acestep: ['Intro', 'Verse', 'Verse 1', 'Verse 2', 'Pre-Chorus', 'Chorus', 'Post-Chorus',
    'Bridge', 'Build', 'Drop', 'Breakdown', 'Instrumental', 'Guitar Solo', 'Piano Interlude',
    'Outro', 'Fade Out', 'Silence'],
  minimax: ['Intro', 'Verse', 'Pre Chorus', 'Chorus', 'Post Chorus', 'Interlude', 'Bridge',
    'Transition', 'Break', 'Hook', 'Build Up', 'Inst', 'Solo', 'Outro']
}

/**
 * ACE-Step also documents tags that are not sections: they colour the voice or
 * the energy of the section they sit in. MiniMax documents none of these, so
 * they are dropped rather than translated when a render goes to MiniMax.
 */
export const COLOUR_TAGS = {
  voice: ['whispered', 'falsetto', 'powerful belting', 'raspy vocal', 'spoken word',
    'harmonies', 'call and response', 'ad-lib'],
  energy: ['low energy', 'building energy', 'high energy', 'explosive', 'dreamy',
    'melancholic', 'euphoric', 'aggressive']
}

/**
 * ACE-Step spelling to MiniMax spelling. Only where both engines have the
 * concept; anything absent from MiniMax's list falls back below.
 */
const TO_MINIMAX = {
  'pre-chorus': 'Pre Chorus',
  'post-chorus': 'Post Chorus',
  instrumental: 'Inst',
  build: 'Build Up',
  'guitar solo': 'Solo',
  'piano interlude': 'Interlude',
  breakdown: 'Break',
  drop: 'Chorus',        // no drop in MiniMax's list; a drop is its loudest section
  'fade out': 'Outro',
  silence: 'Break',
  'verse 1': 'Verse',
  'verse 2': 'Verse'
}

const MINIMAX_KNOWN = new Set(SECTIONS.minimax.map((t) => t.toLowerCase()))
const COLOUR_KNOWN = new Set([...COLOUR_TAGS.voice, ...COLOUR_TAGS.energy].map((t) => t.toLowerCase()))

/**
 * Rewrites the bracketed tags in a lyrics field for the engine that will read
 * it, and reports every change so the UI can say what it did rather than
 * silently altering someone's words.
 *
 * ACE-Step is the canonical spelling, so translating for ACE-Step only fixes
 * case. Translating for MiniMax maps what maps and drops what MiniMax has no
 * concept of, because an unknown bracket is a line the model may try to sing.
 */
export function translateTags (lyrics, engine) {
  const changes = []
  if (!lyrics) return { lyrics: lyrics || '', changes }

  const out = lyrics.replace(/\[([^\]\n]+)\]/g, (whole, inner) => {
    const raw = inner.trim()
    const key = raw.toLowerCase()

    if (engine === 'acestep') {
      // Canonical case, so `[verse]` and `[Verse]` reach the model identically.
      const section = SECTIONS.acestep.find((t) => t.toLowerCase() === key)
      if (section && section !== raw) { changes.push({ from: whole, to: `[${section}]` }); return `[${section}]` }
      const colour = [...COLOUR_TAGS.voice, ...COLOUR_TAGS.energy].find((t) => t.toLowerCase() === key)
      if (colour && colour !== raw) { changes.push({ from: whole, to: `[${colour}]` }); return `[${colour}]` }
      return whole
    }

    // MiniMax.
    if (MINIMAX_KNOWN.has(key)) {
      const canonical = SECTIONS.minimax.find((t) => t.toLowerCase() === key)
      if (canonical !== raw) { changes.push({ from: whole, to: `[${canonical}]` }); return `[${canonical}]` }
      return whole
    }
    if (TO_MINIMAX[key]) {
      changes.push({ from: whole, to: `[${TO_MINIMAX[key]}]`, why: 'MiniMax spells it differently' })
      return `[${TO_MINIMAX[key]}]`
    }
    if (COLOUR_KNOWN.has(key)) {
      changes.push({ from: whole, to: '', why: 'MiniMax documents no voice or energy tags' })
      return ''
    }
    changes.push({ from: whole, to: '', why: 'not in MiniMax\'s documented tag list' })
    return ''
  })

  // Dropping a tag can leave a blank line that was only holding the tag.
  return { lyrics: out.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n'), changes }
}

/**
 * Starting points. Every one is a working brief, not a genre label, because the
 * point is that clicking it fills the box with a sentence you can then edit.
 * The lengths follow the authors' own duration maths.
 */
export const STARTERS = [
  {
    title: 'Cinematic trailer bed',
    hint: 'strings, no vocals, 60 s',
    brief: 'A slow cinematic trailer bed for a film teaser. Low sustained strings, a piano ostinato underneath, building to one big hit near the end. No vocals. About a minute.'
  },
  {
    title: 'Lo-fi loop to study to',
    hint: 'instrumental, 90 s',
    brief: 'A warm lo-fi hip hop loop to study to. Dusty drums, an electric piano, vinyl crackle, nothing that grabs your attention. Instrumental, about ninety seconds.'
  },
  {
    title: 'Game exploration bed',
    hint: 'choir builds, 120 s',
    brief: 'Music for an exploration video game, walking into a ruined temple. Mystical and full of secrets, layered voices that rise in power as it goes. Around two minutes.'
  },
  {
    title: 'Wedding salsa',
    hint: 'male lead, 150 s',
    brief: 'A romantic modern salsa for a wedding first dance, male lead vocal, live brass and hand percussion, warm and joyful. Two and a half minutes.'
  },
  {
    title: 'Trap beat with 808s',
    hint: 'instrumental, 90 s',
    brief: 'A dark trap instrumental. Heavy 808 sub, sparse hi-hats, a single detuned bell melody. Menacing and patient. Ninety seconds.'
  },
  {
    title: 'Gospel chorus',
    hint: 'choir, 120 s',
    brief: 'A triumphant gospel chorus with a full choir and church organ, hand claps, building from one voice to everyone. Two minutes.'
  },
  {
    title: 'Mexican banda, played by robots',
    hint: 'instrumental, 90 s',
    brief: 'Mexican banda played by robots. Mechanical tuba and sequenced accordion, brass stabs quantised too perfectly, a little sinister under the party. Instrumental, ninety seconds.'
  },
  {
    title: 'Chiptune boss fight',
    hint: 'instrumental, 60 s',
    brief: 'A chiptune boss fight loop. Square lead, pulse bass, driving noise percussion, fast and relentless. Instrumental, one minute.'
  },
  {
    title: 'Doom metal riff',
    hint: 'no vocals, 120 s',
    brief: 'A slow doom metal riff, downtuned guitars, thick bass, heavy drums with room on them. No vocals, no solos. Two minutes.'
  },
  {
    title: 'Bulgarian choir over techno',
    hint: 'female voices, 150 s',
    brief: 'A women\'s Bulgarian choir over hard techno. Close open-fifth harmonies, a relentless kick, metallic hats, cold and euphoric. Two and a half minutes.'
  },
  {
    title: 'Qawwali handclaps',
    hint: 'lead vocal, 180 s',
    brief: 'A qawwali built on harmonium, tabla and group handclaps, one lead voice answered by the group, rising for three minutes.'
  },
  {
    title: 'Bossa nova at closing time',
    hint: 'soft vocal, 120 s',
    brief: 'A late bossa nova for an empty bar. Nylon string guitar, brushed drums, an intimate close vocal almost whispered, upright bass. Two minutes.'
  },
  {
    title: 'Afrobeats summer single',
    hint: 'vocals, 150 s',
    brief: 'An afrobeats summer single, log drum and shaker groove, bright synth marimba, a warm lead vocal with a hooked chorus. Two and a half minutes.'
  },
  {
    title: 'Norteno road song',
    hint: 'male lead, 150 s',
    brief: 'A norteno road song with accordion and bajo sexto, polka drums, a proud male lead singing in Spanish. Two and a half minutes.'
  },
  {
    title: 'K-pop pre-chorus lift',
    hint: 'group vocals, 90 s',
    brief: 'A k-pop pre-chorus that lifts into a huge chorus. Layered group vocals, bright synth plucks, a slamming drop, glossy and confident. Ninety seconds.'
  },
  {
    title: 'Silent-film piano chase',
    hint: 'solo piano, 60 s',
    brief: 'A solo piano chase from a silent film. Fast stride left hand, comic runs, one dramatic pause and a scramble to the end. One minute.'
  },
  {
    title: 'Funeral brass band',
    hint: 'no vocals, 120 s',
    brief: 'A New Orleans funeral brass band, muted trumpet lead, sousaphone walking underneath, snare with a slow drag, mournful then lifting. Two minutes.'
  },
  {
    title: 'Bagpipes over drum and bass',
    hint: 'instrumental, 120 s',
    brief: 'Highland bagpipes over drum and bass. A breakbeat under a droning pipe melody, sub bass, rowdy and celebratory. Instrumental, two minutes.'
  },
  {
    title: 'Kids song about teeth',
    hint: 'child-friendly, 60 s',
    brief: 'A cheerful song for small children about brushing their teeth. Ukulele, glockenspiel, hand claps, a simple sung chorus anyone can repeat. One minute.'
  },
  {
    title: 'Drone for a long night',
    hint: 'no percussion, 300 s',
    brief: 'A single slow drone for a long night. Bowed cello and a low choir pad, no percussion, almost nothing changing, deep reverb. Five minutes.'
  },
  {
    title: 'Waiting-room ambience',
    hint: 'no percussion, 240 s',
    brief: 'Calm ambience for a clinic waiting room. Soft felt piano, warm pad, no percussion, nothing that asks for attention. Four minutes.'
  },
  {
    title: 'Podcast intro sting',
    hint: 'instrumental, 12 s',
    brief: 'A short podcast intro sting. One confident synth bass figure, a snap on the beat, resolving cleanly so a voice can start. Instrumental, twelve seconds.'
  }
]

/**
 * The chip vocabulary, kept from the old desk but regrouped by the dimensions
 * the ACE-Step authors ask for, and used to EDIT a caption rather than to
 * compose one from nothing.
 */
export const CHIPS = [
  ['Genre', ['cinematic orchestral', 'lo-fi hip hop', 'synthwave', 'ambient', 'cumbia', 'afrobeat',
    'drum and bass', 'bossa nova', 'gospel', 'post-rock', 'techno', 'jazz trio', 'trap', 'folk']],
  ['Mood', ['patient and hopeful', 'tense', 'euphoric', 'melancholic', 'playful', 'menacing',
    'nostalgic', 'triumphant', 'intimate', 'secretive']],
  ['Instruments', ['warm sustained strings', 'low piano ostinato', 'french horn', 'soft timpani',
    'fingerpicked acoustic guitar', 'analog synth pad', 'upright bass', 'brass stabs',
    'live percussion', 'hand claps', 'harp', 'muted trumpet', 'church organ', '808 sub']],
  ['Voice', ['female lead vocal', 'male lead vocal', 'layered choir', 'whispered vocal',
    'gang vocals', 'no vocals']],
  ['Texture', ['wide concert hall reverb', 'tape saturation', 'sidechained pads', 'dry and close',
    'vinyl crackle', 'heavy sub weight', 'bright modern master', 'deep stone-room reverb']]
]

/** Keys the authors call the most stable, first, then the rest. */
export const KEYS = ['', 'C major', 'G major', 'D major', 'A minor', 'E minor',
  'C minor', 'C# minor', 'D minor', 'Eb major', 'E major', 'F major', 'F minor',
  'F# minor', 'G minor', 'Ab major', 'A major', 'Bb major', 'B major', 'B minor']

export const TIME_SIGNATURES = [['', 'let the model decide'], ['4/4', '4/4, standard'],
  ['3/4', '3/4, waltz'], ['6/8', '6/8, swing'], ['5/4', '5/4'], ['7/8', '7/8'], ['12/8', '12/8']]

export const LANGUAGES = [['', 'let the model decide'], ['en', 'English'], ['es', 'Spanish'],
  ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['zh', 'Chinese'], ['ar', 'Arabic'], ['hi', 'Hindi']]

/**
 * The authors' cover-strength table, as three choices instead of a slider.
 * The desk used to lock this to 1 on a comment the addon has since contradicted.
 */
export const COVER_STRENGTHS = [
  { key: 'dramatic', label: 'Dramatic', hint: 'a different genre', value: 0.4 },
  { key: 'moderate', label: 'Moderate', hint: 'same song, new clothes', value: 0.6 },
  { key: 'subtle', label: 'Subtle', hint: 'a remaster, not a remix', value: 0.8 }
]

/** Formats worth offering by name. Everything else lives behind Advanced. */
export const COMMON_FORMATS = ['wav', 'm4a', 'flac']
