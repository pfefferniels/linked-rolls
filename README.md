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

## Where a copy's features come from

`readFrom` states what a copy's features were read from: the roll
itself, a `scan` of it, an `analysis` somebody else measured on a
scan, an `emulation` in which the roll has already been read into
notes and commands, or a `recording` captured while the copy was
played. Beside the kind it holds who carried the capture out, on what
device, when, and a note. What is not known is left out.

This says where the numbers of the edition come from and nothing
about the state of the paper, which is a condition of the copy. In
RDF it is `reo:capture`, an activity typed by what it read from; the
file it produced is `crmdig:L11 had output`, the machine it ran on
`crmdig:L12 happened on device`.

Nothing records that a copy is doubtful. `reservationsAbout` works
out from what a copy states what the edition cannot vouch for in it:
that it names no source, that the making of its source is
undocumented, that its features are somebody else's reading, that its
source bears no physical evidence, that no measuring software is
recorded, that it is not calibrated. A reservation goes away when the
gap it names is filled.

```ts
import { reservationsAbout, stateSource } from 'linked-rolls'

const next = produce(edition, stateSource(copyId, {
    kind: 'emulation',
    output: 'https://example.org/wm225.mid',
    note: 'MIDI from a third party; the emulator is not named.'
}))

reservationsAbout(next.copies[0]).map(reservation => reservation.note)
```

## Emulation

`Emulation` turns a version of the edition into MIDI. The core of the
library does the part that belongs to the edition: it negotiates the
symbols of a version into placed events, hands them to a
`ReproducingSystem`, and writes the performance out with every note and
pedal step labelled by the symbol it performs. A reproducing system is a
tracker bar and a `perform` function; the core does not depend on any one
instrument's model.

The first system is the red Welte, `linked-rolls/welte-t100`, built on
[welte-mignon-emulator](https://github.com/pfefferniels/welte-t100): the
take-up spool sets the time axis, the Nuancierbälge fill through their
conduits and are arrested by the Mezzoforte pin, and the two pedals travel
rather than switch. The nuancing constants come as `instruments`: the
consensus fitted across the hand-drawn nuance lines of six rolls, which
is the default, and the setting that drew each of those rolls, named by
its Welte number, all with the terms that describe the drawing apparatus
switched off. The pedals leave no drawn line, so their constants
come as two readings, `pedalPresets.damping`, under which every lift the
rolls punch damps, and `pedalPresets.brushing`, under which the quick runs
of latch changes brush the strings without damping. What the emulator does
not determine is how bellows travel maps onto MIDI velocity;
`WelteT100Options.velocity` anchors that map at the open rail, the
Mezzoforte pin and the closed rail, and its defaults are midi2exp's.

```ts
import { Emulation } from 'linked-rolls'
import { welteT100System } from 'linked-rolls/welte-t100'

const emulation = new Emulation(welteT100System)
emulation.emulateVersion(version, view)
const midi = emulation.asMIDI()
```

The second is the green Welte, `linked-rolls/welte-t98`. Everything
downstream of the relay is the same mechanism — Hagmann has the nuancing
unit built the same for both tracker scales (p. 96) — and what differs is
in front of it: each function lasts exactly as long as its own perforation
runs over the glide block rather than latching until a cancel line is read,
four conduits stand on one bellows and their drives add as flows, the
crescendo's ceiling is the balance of its throttle against a permanently
open bleed rather than a cap, the two pedals sit on the opposite edges of
the paper, and a long perforation on the bass sforzando-piano line sends
the roll back. Its constants are **not fitted**: `instruments.genuine` and
`instruments.derived` are empty until their fits are run, and until then a
playback runs on unfitted starting values, which every curve says in its
own `instrument` field.

Both systems share one velocity map, and `DynamicsCurve.travel` means the
same thing on both: the position on the printed ordinate of Welte's own
ruled band, 0 at that half's P.P. gridline and 1 at the shared F.F. line.
That is what lets a red issue and a green issue of one recording be
compared at all, since the band is ruled the same way on both.

```ts
import { welteT98System } from 'linked-rolls/welte-t98'
```

The emulator is an optional peer dependency: an application that uses one
of the Welte systems installs `welte-mignon-emulator` itself, and one that
only reads editions does not need it. For development on both at once,
`npm link` a checkout of
[welte-t100](https://github.com/pfefferniels/welte-t100) into this
repository.

### Alignment, order and pairing

A perforation takes its place from the holes that carry it. Four fields
on a perforation let an editor state where the measurement should give
way. `alignedWith` names another perforation whose onset this one takes
in the performance, as a "crescendo off" is meant to fall on the note
it belongs to. `before` and `after` name a perforation whose onset this
one precedes or follows, without saying by how much: where the copies
disagree on which side of a note an expression falls, the statement
settles the order. A perforation the measurement already has on the
stated side keeps its place. One it does not is put on that side, as
far from the reference as the copies that agree with the statement put
it, and a punch diameter away where none does. A perforation makes one
of these three statements at most. `pairedWith` names a partner whose
distance to this one is fixed, as a "forzando on" belongs with its
"forzando off": whatever displaces the one displaces the other. Any two
perforations may be paired, the relation is symmetric, and it is stated
on one side only. All are applied when a version is emulated.
`constraintProblems` lists, version by version, the cases in which the
statements cannot hold: a reference or partner that is absent, a
perforation placed relative to itself or in several ways at once, one
claimed by several pairs, or a pair whose members are both placed.

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
