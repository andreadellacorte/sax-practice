# Sax Improv Lab

A browser app for learning to improvise on the saxophone. No install or build step.

## Run it

Open `index.html` in a modern browser (developed and tested in Chrome). You can double-click it.

If your browser blocks the microphone on `file://` pages, serve the folder instead:

```sh
npm start          # python3 -m http.server 8000, then open http://localhost:8000
```

**Use headphones** when the mic is on, so it hears you and not the band.

## Deploy

The app is static files with no backend. To put it on GitHub Pages, push the repo, then go to **Settings → Pages → Deploy from a branch** and choose `main` with the `/ (root)` folder. Pages serves over HTTPS, which the microphone needs.

## What's inside

- **Backing band.** Swing drums, a walking bass and rootless piano comping, all synthesised with Web Audio.
  - Choose from 8 progressions: ii–V–I, minor ii–V–i, 12-bar blues, minor blues, a turnaround, an Autumn-style cycle, and Dorian and dominant vamps.
  - Any key, tempo from 40 to 260 bpm, swing feel, count-in, and a mute for each part.
- **Written pitch for your sax.** Pick alto, tenor, soprano or baritone, and chords and scales are shown in *your* key. For example, a concert B♭ blues shows as G blues on alto and C blues on tenor. You can switch to concert pitch at any time.
- **"Play these notes" panel.** Shows the scale that fits the current chord on a staff and as note chips, with the target notes, chord tones and scale notes highlighted. Click a note to hear it.
- **Fingering diagrams.** Shows the keys to press for every note in the "Play these notes" panel, and for the note you're playing when the mic is on. Fingerings follow written pitch, so they're the same on every saxophone.
- **23 guided lessons** in five groups:
  - *Foundations:* long tones, roots, arpeggios, 1-2-3-5 patterns, guide tones, chromatic approach notes.
  - *Blues:* blues scale, minor pentatonic, rhythm, phrasing and space, chord tones, minor blues.
  - *Ear training:* call and response over a blues and over a ii–V–I.
  - *Modal:* Dorian motifs, a Mixolydian funk vamp, rhythmic displacement.
  - *Changes:* target notes, enclosures, turnarounds, major pentatonic, minor ii–V–i, putting it together.
- **Lesson demos.** Every lesson has a **Hear a demo** button: a sax plays the exercise over the band. While it plays, the app shows each note, its fingering, and where it sits in the scale. Demos with several steps cycle through them, one per loop.
- **Call & response.** The band plays a 2-bar phrase over the changes, and you answer it.
- **Live pitch feedback.** The mic detects the note you're playing and shows it in written pitch with a tuning meter. It tells you whether the note is a target, a chord tone, a scale note or outside, and keeps running percentages.
- **Practice log.** Tracks minutes practised today, your day streak and completed lessons, saved in your browser's localStorage.

Keyboard: **Space** plays and stops.

## Code

| File | Purpose |
| --- | --- |
| `js/theory.js` | Note spelling, transposition, chords, scales, progressions, bass/voicing/lick logic (pure) |
| `js/pitch.js` | YIN pitch detector and mic tracker |
| `js/fingering.js` | Sax fingerings by written pitch, SVG key diagram |
| `js/demo.js` | Demo phrases for each lesson exercise (pure) |
| `js/audio.js` | Web Audio band with lookahead scheduler |
| `js/lessons.js` | Lesson curriculum |
| `js/app.js` | UI |

Run the tests with `npm test`. This needs Node 18 or later.
