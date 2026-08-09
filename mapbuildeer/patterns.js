// patterns.js
// You can edit this file in Notepad or VSCode to create your own custom patterns!
// 
// beatSnap: Musical timing. 1.0 = whole beat, 0.5 = half beat (8th notes), 0.25 = quarter beat (16th notes)
// sequence: The list of notes in this pattern.
//   - lanes: Array of lanes to place notes in (0 to 3).
//   - holdBeats: (Optional) How many beats this note lasts. If greater than 0, it becomes a Long Note.
//
// ============================================================================
// PATTERN VOCABULARY (osu!mania / 4K VSRG style) — reference for writing your own
// ============================================================================
// SINGLE-NOTE MOTION
//   Stream        : single notes, one after another, fast (usually 0.25 or faster)
//   Staircase     : notes moving in one direction across lanes (0,1,2,3)
//   Running Man   : staircase that reverses direction instead of resetting (0,1,2,3,2,1,0)
//   Trill         : two lanes alternating (0,1,0,1...)
//   Roll          : trill-like pattern across 3+ lanes in one direction, looped (0,1,2,1,0,1,2...)
//   Zigzag        : stream that jumps around non-adjacent lanes instead of walking linearly
//
// JACKS (same lane repeated)
//   Jack          : same lane repeated rapidly (stamina/finger endurance)
//   Minijack      : a short jack burst (2-4 repeats) inserted into a stream
//   Chordjack     : a repeated CHORD (2+ lanes together) rather than a single lane
//   Jacktrill     : jacks on one lane interleaved with a trill on the others
//
// MULTI-NOTE (simultaneous)
//   Jump          : 2 notes at once
//   Hand          : 3 notes at once
//   Wall/Quad     : 4 notes at once (all lanes)
//   Jumpstream    : a stream where some notes are jumps instead of singles
//   Handstream    : a stream where some notes are hands (3-note chords) instead of singles
//   Jumptrill     : two lane-PAIRS alternating ((0,2),(1,3),(0,2),(1,3)...)
//   Split trill   : trill where each side is a jump instead of a single note
//   Box/Inverse   : 4 notes forming a "box" shape across beats, e.g. (0,3),(1,2),(0,3),(1,2)
//
// HYBRID / STRUCTURAL
//   Anchor        : one lane repeats steadily while other lanes stream around it
//   Glut          : a jack that briefly "breaks" into a jump then resumes (common in tech charts)
//   Polyrhythm    : streams with switching beatSnap to feel metrically displaced
//   LN (Long Note): a held note; "LN + taps" = holding one lane while tapping others independently
// ============================================================================

window.GAME_PATTERNS = [
    // ---------------- BASICS ----------------
    {
        name: 'single taps',
        difficulty: 1,
        beatSnap: 0.5,
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [3] }
        ]
    },
    {
        name: 'stairs',
        difficulty: 2,
        beatSnap: 0.25,
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [3] }
        ]
    },
    {
        name: 'reverse stairs',
        difficulty: 2,
        beatSnap: 0.25,
        // Staircase walking downward instead of up.
        sequence: [
            { lanes: [3] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [0] }
        ]
    },

    // ---------------- RUNNING MAN / ROLLS ----------------
    {
        name: 'running man',
        difficulty: 3,
        beatSnap: 0.25,
        // Classic osu!mania staple: staircase up, then back down without
        // repeating the turnaround note twice in a row.
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [1] }
        ]
    },
    {
        name: 'running man (full loop)',
        difficulty: 4,
        beatSnap: 0.25,
        // Longer running man that walks all the way up, back down, and
        // repeats, giving a continuous "footsteps" feel across 16ths.
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [2] },
            { lanes: [1] }
        ]
    },
    {
        name: 'running man (reverse start)',
        difficulty: 4,
        beatSnap: 0.25,
        // Same footstep motion but starting from lane 3 and walking down first.
        sequence: [
            { lanes: [3] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [2] }
        ]
    },
    {
        name: '3-lane roll',
        difficulty: 3,
        beatSnap: 0.25,
        // A rolling trill across three lanes instead of two, looping back
        // and forth like a mini running man confined to lanes 0-2.
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [1] }
        ]
    },

    // ---------------- TRILLS ----------------
    {
        name: 'trill',
        difficulty: 4,
        beatSnap: 0.25,
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [1] }
        ]
    },
    {
        name: 'inner trill',
        difficulty: 4,
        beatSnap: 0.25,
        // Trill on the two middle lanes (1 & 2) -- typically the easiest
        // trill since it uses the index fingers closest together.
        sequence: [
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [2] }
        ]
    },
    {
        name: 'outer trill',
        difficulty: 4,
        beatSnap: 0.25,
        // Trill on the outer lanes (0 & 3) instead of adjacent ones —
        // forces a wider hand stretch than a standard trill.
        sequence: [
            { lanes: [0] },
            { lanes: [3] },
            { lanes: [0] },
            { lanes: [3] },
            { lanes: [0] },
            { lanes: [3] },
            { lanes: [0] },
            { lanes: [3] }
        ]
    },
    {
        name: 'crossover trill',
        difficulty: 5,
        beatSnap: 0.25,
        // Trill between a lane and a non-adjacent one on the opposite
        // side (0 & 2, or 1 & 3), forcing hand crossover motion.
        sequence: [
            { lanes: [0] },
            { lanes: [2] },
            { lanes: [0] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [3] },
            { lanes: [1] },
            { lanes: [3] }
        ]
    },

    // ---------------- JUMPS / JUMPSTREAM ----------------
    {
        name: 'jumps',
        difficulty: 3,
        beatSnap: 0.5,
        sequence: [
            { lanes: [0, 1] },
            { lanes: [2, 3] },
            { lanes: [0, 2] },
            { lanes: [1, 3] }
        ]
    },
    {
        name: 'jumpstream',
        difficulty: 5,
        beatSnap: 0.25,
        // A stream where roughly every other note is a jump instead of a
        // single -- one of the most common 4K pattern types.
        sequence: [
            { lanes: [0] },
            { lanes: [1, 2] },
            { lanes: [3] },
            { lanes: [0, 1] },
            { lanes: [2] },
            { lanes: [1, 3] },
            { lanes: [0] },
            { lanes: [2, 3] }
        ]
    },
    {
        name: 'handstream',
        difficulty: 6,
        beatSnap: 0.25,
        // A stream mixing in 3-note "hand" chords -- denser and heavier
        // on the fingers than a jumpstream.
        sequence: [
            { lanes: [0, 1, 2] },
            { lanes: [3] },
            { lanes: [1, 2, 3] },
            { lanes: [0] },
            { lanes: [0, 1, 3] },
            { lanes: [2] },
            { lanes: [0, 2, 3] },
            { lanes: [1] }
        ]
    },
    {
        name: 'quadstream',
        difficulty: 7,
        beatSnap: 0.25,
        // A stream with full 4-note walls mixed between singles --
        // very demanding, common in high-difficulty charts.
        sequence: [
            { lanes: [0] },
            { lanes: [0, 1, 2, 3] },
            { lanes: [2] },
            { lanes: [0, 1, 2, 3] },
            { lanes: [1] },
            { lanes: [0, 1, 2, 3] },
            { lanes: [3] }
        ]
    },
    {
        name: 'box pattern',
        difficulty: 5,
        beatSnap: 0.5,
        // Alternating between the outer pair and inner pair of lanes --
        // visually forms a "box" shape scrolling down the field.
        sequence: [
            { lanes: [0, 3] },
            { lanes: [1, 2] },
            { lanes: [0, 3] },
            { lanes: [1, 2] }
        ]
    },
    {
        name: 'jumptrill',
        difficulty: 6,
        beatSnap: 0.25,
        // Two-handed alternating jumps -- much denser than a single trill,
        // a classic "JT" pattern in higher difficulty 4K charts.
        sequence: [
            { lanes: [0, 2] },
            { lanes: [1, 3] },
            { lanes: [0, 2] },
            { lanes: [1, 3] },
            { lanes: [0, 2] },
            { lanes: [1, 3] },
            { lanes: [0, 2] },
            { lanes: [1, 3] }
        ]
    },
    {
        name: 'split trill',
        difficulty: 6,
        beatSnap: 0.25,
        // Like a jumptrill but with an inner/outer split so each hand
        // handles one lane pair consistently (0+1 vs 2+3 style motion).
        sequence: [
            { lanes: [0, 1] },
            { lanes: [2, 3] },
            { lanes: [0, 1] },
            { lanes: [2, 3] },
            { lanes: [0, 1] },
            { lanes: [2, 3] }
        ]
    },

    // ---------------- JACKS / CHORDJACKS ----------------
    {
        name: 'single jack (stamina)',
        difficulty: 4,
        beatSnap: 0.25,
        // Same lane repeated rapidly -- pure finger-stamina jack.
        sequence: [
            { lanes: [1] },
            { lanes: [1] },
            { lanes: [1] },
            { lanes: [1] },
            { lanes: [1] },
            { lanes: [1] }
        ]
    },
    {
        name: 'minijack burst',
        difficulty: 4,
        beatSnap: 0.25,
        // A short 3-note jack burst dropped into an otherwise normal
        // stream -- very common "spice" pattern in real charts.
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [2] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [0] }
        ]
    },
    {
        name: 'double jack',
        difficulty: 6,
        beatSnap: 0.25,
        // Two lanes jacking together -- both hands hammering in place.
        sequence: [
            { lanes: [1, 2] },
            { lanes: [1, 2] },
            { lanes: [1, 2] },
            { lanes: [1, 2] },
            { lanes: [1, 2] },
            { lanes: [1, 2] }
        ]
    },
    {
        name: 'chord jack',
        difficulty: 4,
        beatSnap: 0.5,
        sequence: [
            { lanes: [0, 2] },
            { lanes: [0, 2] },
            { lanes: [0, 2] },
            { lanes: [0, 2] }
        ]
    },
    {
        name: 'heavy chord jack',
        difficulty: 5,
        beatSnap: 0.5,
        sequence: [
            { lanes: [0, 1, 2] },
            { lanes: [1, 2, 3] },
            { lanes: [0, 1, 2] },
            { lanes: [1, 2, 3] }
        ]
    },
    {
        name: 'jacktrill',
        difficulty: 7,
        beatSnap: 0.25,
        // One lane jacks continuously while the others trill around it --
        // a brutal hybrid pattern found in high-difficulty tech charts.
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [2] },
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [2] }
        ]
    },
    {
        name: 'glut',
        difficulty: 7,
        beatSnap: 0.25,
        // A jack that briefly resolves into a jump before continuing --
        // named for the "glut" pattern in tech/jack-heavy charts.
        sequence: [
            { lanes: [1] },
            { lanes: [1] },
            { lanes: [1, 2] },
            { lanes: [1] },
            { lanes: [1] }
        ]
    },
    {
        name: 'anchor stream',
        difficulty: 5,
        beatSnap: 0.25,
        // Lane 0 "anchors" (repeats every other note) while 1-2-3 stream
        // around it. Common stamina pattern that isolates one finger.
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [2] },
            { lanes: [0] },
            { lanes: [3] },
            { lanes: [0] },
            { lanes: [1] }
        ]
    },

    // ---------------- STREAM VARIATIONS ----------------
    {
        name: 'staircase + jump cap',
        difficulty: 4,
        beatSnap: 0.25,
        // Staircase that resolves into a jump instead of a single note --
        // common way to punctuate the end of a run.
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [0, 3] }
        ]
    },
    {
        name: 'zigzag stream',
        difficulty: 5,
        beatSnap: 0.25,
        // Non-monotonic stream that skips around instead of walking
        // linearly -- trains lane recognition over pure motor memory.
        sequence: [
            { lanes: [0] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [3] },
            { lanes: [0] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [3] }
        ]
    },
    {
        name: 'torrent (16th stream)',
        difficulty: 7,
        beatSnap: 0.25,
        // Long continuous 16th-note run across all lanes, the 4K
        // equivalent of a dense stream section.
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [1] },
            { lanes: [0] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [0] },
            { lanes: [2] },
            { lanes: [1] },
            { lanes: [3] }
        ]
    },
    {
        name: 'polyrhythm stream',
        difficulty: 6,
        beatSnap: 0.25,
        // A stream that briefly implies a different subdivision (triplet
        // feel) by grouping notes in 3s against the underlying 16th grid.
        sequence: [
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [0] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [0] }
        ]
    },
    {
        name: 'walls',
        difficulty: 5,
        beatSnap: 0.5,
        // Full 4-lane chords used as accents, spaced out so they read
        // as punctuation rather than a wall-jack.
        sequence: [
            { lanes: [0, 1, 2, 3] },
            { lanes: [1] },
            { lanes: [2] },
            { lanes: [0, 1, 2, 3] },
            { lanes: [1] },
            { lanes: [2] }
        ]
    },

    // ---------------- LONG NOTES (LN) ----------------
    {
        name: 'long notes (noodles)',
        difficulty: 3,
        beatSnap: 1.0,
        sequence: [
            { lanes: [0], holdBeats: 1.0 },
            { lanes: [1], holdBeats: 1.0 },
            { lanes: [2], holdBeats: 1.0 },
            { lanes: [3], holdBeats: 1.0 }
        ]
    },
    {
        name: 'LN with taps',
        difficulty: 5,
        beatSnap: 0.25,
        sequence: [
            { lanes: [0], holdBeats: 1.0 },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [2] },
            { lanes: [3] } // Note: The LN in lane 0 is held while tapping 2 and 3!
        ]
    },
    {
        name: 'LN staircase',
        difficulty: 6,
        beatSnap: 0.5,
        // Overlapping long notes that stagger their releases, forcing
        // the player to hold multiple lanes while tapping others.
        sequence: [
            { lanes: [0], holdBeats: 1.5 },
            { lanes: [1], holdBeats: 1.0 },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [1] },
            { lanes: [2] }
        ]
    },
    {
        name: 'double LN',
        difficulty: 5,
        beatSnap: 0.5,
        // Two long notes held simultaneously in different lanes, with
        // independent release timing.
        sequence: [
            { lanes: [0], holdBeats: 2.0 },
            { lanes: [3], holdBeats: 1.0 },
            { lanes: [1] },
            { lanes: [2] }
        ]
    },
    {
        name: 'LN jack hybrid',
        difficulty: 7,
        beatSnap: 0.25,
        // A held LN in one lane while the remaining lanes jack/trill
        // underneath it -- tough coordination pattern.
        sequence: [
            { lanes: [0], holdBeats: 2.0 },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [2] },
            { lanes: [3] },
            { lanes: [1], holdBeats: 1.0 }
        ]
    },
    {
        name: 'LN chordstream',
        difficulty: 8,
        beatSnap: 0.25,
        // Multiple overlapping LNs create a moving "staircase" of holds
        // while jumps/singles weave between them -- endgame-tier pattern.
        sequence: [
            { lanes: [0], holdBeats: 1.0 },
            { lanes: [1], holdBeats: 1.0 },
            { lanes: [2, 3] },
            { lanes: [2] },
            { lanes: [3], holdBeats: 1.0 },
            { lanes: [0] },
            { lanes: [1] }
        ]
    }
];