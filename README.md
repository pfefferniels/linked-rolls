# linked-rolls

linked-rolls is a lightweight Typescript library for creating, manipulating
and exporting digital editions of piano roll. In particular it allows to:

  - import piano rolls from different formats (such
    as SUPRA's roll analysis files, DSP, etc.)
  - collate differing piano roll copies
  - create an manipulate editorial assumptions 
  - export the edition as JSON-LD (based on the 
    [Roll Edition Format](https://pfefferniels.github.io/linked-rolls/))

This library is the foundation of the
[Roll Desk](https://github.com/pfefferniels/roll-desk).

## Emulation

`Emulation` turns a version of the edition into MIDI. The core of the
library does the part that belongs to the edition: it negotiates the
symbols of a version into placed events, hands them to a
`ReproducingSystem`, and writes the performance out with every note and
pedal step labelled by the symbol it performs. A reproducing system is a
tracker bar and a `perform` function; the core does not depend on any one
instrument's model.

The first system is the red Welte, `linked-rolls/welte-t100`, built on
[welte-t100-emulator](https://github.com/pfefferniels/welte-t100): the
take-up spool sets the time axis, the Nuancierbälge fill through their
conduits and are arrested by the Mezzoforte pin, and the two pedals travel
rather than switch. The constants are those fitted against the hand-drawn
nuance lines of roll 3309, with the terms that describe the drawing
apparatus switched off. What the emulator does not determine is how
bellows travel maps onto MIDI velocity; `WelteT100Options.velocity`
anchors that map at the open rail, the Mezzoforte pin and the closed rail,
and its defaults are midi2exp's.

```ts
import { Emulation } from 'linked-rolls'
import { welteT100System } from 'linked-rolls/welte-t100'

const emulation = new Emulation(welteT100System)
emulation.emulateVersion(version, view)
const midi = emulation.asMIDI()
```

The emulator is an optional peer dependency: an application that uses the
T-100 system installs it itself, and one that only reads editions does not
need it. It is not on npm, so it has to be checked out beside this
repository and declared as `file:../welte-t100`.

## Building
```
   npm i
   npm run build
```

## Releasing

Releases go out through `.github/workflows/publish.yml`, never from a
laptop: raise the version in `package.json`, commit, and push a tag
`v<version>`, or run the workflow by hand from the Actions tab. The
workflow builds, runs the tests and publishes with provenance through
npm's trusted publishing, so no token is stored. It checks out the
emulator beside this repository to build the T-100 entry point, which is
what the `WELTE_T100_TOKEN` secret is for.
