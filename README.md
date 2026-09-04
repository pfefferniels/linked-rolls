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

## Vocabulary

The JSON-LD export uses the Roll Edition Ontology (REO), namespace
`https://w3id.org/reo/`, prefix `reo`, alongside CIDOC CRM, LRMoo and
CRMinf. The ontology lives in `ontology/`, and the context every
export references is `https://w3id.org/reo/context.jsonld`. The
ontology, its type vocabulary and the context are published at
https://pfefferniels.github.io/linked-rolls/reo/; the w3id.org
identifiers are not registered yet. `ontology/README.md` records the
naming decisions.

## Format revisions

Files written by linked-rolls 0.1 load unchanged: `importJsonLd`
recognises their shapes and brings them to the current format, in
which versions and conditions carry a typology key beside their type,
the keeper and the production metadata are nodes with a name and
authority links, and the roll names its reproducing system. Exports
are always in the current format.

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
T-100 system installs `welte-t100-emulator` itself, and one that only
reads editions does not need it. For development on both at once, a
checkout of [welte-t100](https://github.com/pfefferniels/welte-t100)
beside this repository, declared as `file:../welte-t100`, works too.

### Alignment and pairing

A perforation takes its place from the holes that carry it. Two fields
on a perforation let an editor state where the measurement should give
way. `alignedWith` names another perforation whose onset this one takes
in the performance, as a "crescendo off" is meant to fall on the note
it belongs to. `pairedWith` names a partner whose distance to this one
is fixed, as a "forzando on" belongs with its "forzando off": whatever
displaces the one displaces the other. Any two perforations may be
paired, the relation is symmetric, and it is stated on one side only.
Both are applied when a version is emulated. `constraintProblems` lists,
version by version, the cases in which the statements cannot hold: a
reference or partner that is absent, a perforation claimed by several
pairs, or a pair whose members are both aligned.

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
emulator beside this repository to build the T-100 entry point.
