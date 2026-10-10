# linked-rolls

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.23270944.svg)](https://doi.org/10.5281/zenodo.23270944)

A TypeScript library for digital editions of piano rolls. It reads roll
copies from scans and analysis files, collates them into versions,
records editorial assumptions together with the beliefs behind them,
exports the edition as JSON-LD, and plays a version through an emulated
reproducing piano.

It is the foundation of the [Roll Desk](https://github.com/pfefferniels/roll-desk).

## Install

```
npm i linked-rolls
```

## Usage

An edition is plain data. Operations are functions applied to an
[immer](https://immerjs.github.io/immer/) draft, so each one is a
single undo step.

```ts
import { produce } from 'immer'
import { alignCopy, asJsonLd, connectVersions, createVersion, importJsonLd, readFromStanfordAton, snapshotOf } from 'linked-rolls'

let edition = importJsonLd(json)

// Add a copy read from a SUPRA analysis file, with a version of its own,
// and align it with the reference copy, whose millimetres are the axis
const copy = readFromStanfordAton(aton)
edition = produce(edition, createVersion(copy))
edition = produce(edition, alignCopy(copy.id))

// Collate that version against another one, and read what it shows
edition = produce(edition, connectVersions(childId, parentId))
const symbols = snapshotOf(edition, childId)

const document = asJsonLd(edition)
```

The [API reference](https://pfefferniels.github.io/linked-rolls/api/)
documents the public interface, and the
[recipes](https://pfefferniels.github.io/linked-rolls/api/documents/Recipes.html)
show how to read an edition, get the text of a version, see what a
version changed, play it and write a change back. What the reference
leaves out is internal and may change in any release.

What is read off an edition, such as `snapshotOf`, `placeOf`,
`versionIn` or `pathIn`, is worked out once for each state of it and
kept for as long as the state is. Every change through `produce` yields
a new state, so nothing needs to be told that the edition changed. For
the same reason an edition is frozen once anything has been asked of it,
as immer freezes what it produces: change it through an operation, not
in place. A draft is asked about as `stateOf(draft)`.

Within the library every place along the roll is a place on the edition's
axis, the millimetres of its reference copy. A document holds each copy's
features at the copy's own places, as they were read, together with the
alignment that carries them onto the axis; the import and the export map
between the two. What the alignments say about the paper of the copies,
how far each has stretched and how the papers of the systems relate, is
worked out by `paperOf`.

What is worked out is not stated. Where the edition holds to the ratio a
re-cut gave the paper of its version, the creation of the version states
it (`lengthRatio`, as `lengthRatioOf` gives it), so that others can take
it as a premise. A measured value, such as that ratio, a copy's
dimensions and hole separation, or the setting of its perforator, is
held on the strength of a measurement, which names what it was taken
on, the program and its version, and the day.

Documents written by earlier releases are brought up to date on import.
To check a document against the schema:

```ts
import { validate } from 'linked-rolls/validate'
```

## Emulation

A version can be played through a reproducing system and written out
as MIDI. The Welte-Mignon systems use
[welte-mignon-emulator](https://github.com/pfefferniels/welte-t100), an
optional peer dependency that you install only if you need playback.

```ts
import { emulate, midiOf } from 'linked-rolls'
import { welteT100System } from 'linked-rolls/welte-t100'

const { events, source } = emulate(welteT100System, version, edition)
const midi = midiOf(events, welteT100System.name, welteT100System.defaultOptions, source)
```

The systems are `linked-rolls/welte-t100` (red Welte),
`linked-rolls/welte-t98` (green Welte) and `linked-rolls/welte-licensee`.

## Format

The export uses the Roll Edition Ontology (REO), namespace
`https://w3id.org/reo/`, together with CIDOC CRM, LRMoo and CRMinf. The
ontology is in `ontology/`. It is published with its context and the
documentation of the format at
https://pfefferniels.github.io/linked-rolls/, to which the w3id.org
identifiers redirect.

Beliefs are written as JSON-LD-star annotations (`@annotation`), so you
need a processor that supports JSON-LD-star to read them.

## Development

```
npm ci
npm test
npm run lint
npm run build
npm run build:api   # the API reference, into docs/api
```

TypeDoc runs from `tools/typedoc` with a TypeScript 5 of its own, as
TypeScript 7 no longer has the compiler API it reads the source with.

## Releasing

Raise the version in `package.json` and in `CITATION.cff`, there with
the day as `date-released`, commit, and push a tag `v<version>`. The
`publish.yml` workflow builds, tests and publishes to npm, then makes a
GitHub release of the tag, which Zenodo archives with a DOI. A test fails
while the two versions differ.

## About

linked-rolls grew out of the dissertation *Grünfelds Geist.
Rekonstruktion einer Welte-Mignon-Klavierrollenaufnahme* (Niels
Pfeffer, Eberhard Karls Universität Tübingen, Musikwissenschaftliches
Institut, 2026), which edits Alfred Grünfeld's 1905 recording of
Schumann's *Träumerei*, Welte-Mignon roll 225, from its surviving
copies. That edition is published at https://welte225.org/ and can be
read in the [Roll Desk](https://rolldesk.welte225.org/).

Its aim is a scholarly edition of a piano roll that treats the roll the
way a critical edition treats a text: every copy is a witness, the
differences between copies are collated into versions, and every
editorial decision is recorded together with the evidence and the
beliefs behind it, so that a reader can retrace and contest it. The
data are meant to be reused outside the library, which is why the
format is linked data built on CIDOC CRM rather than a file format of
its own.

### Related formats

Several formats have been developed or used to represent piano rolls at
different stages of processing:

- **Scan images:** CIS and MRS, often accompanied by ANN metadata.
- **Event lists:** Wayne Stahnke's RAW, WEB and BAR, PRF, SCN, ROL, and
  the e-roll MIDI files of pneumatic readers.
- **Symbolic descriptions:** the Roll Analysis files of the Stanford
  University Piano Roll Archive, serialised as ATON.

None of them is concerned with what a critical edition needs: an
apparatus of the variants between copies, the traces a copy carries
(handwritten notes, patches, perforations added later), a record of how
and on what assumptions each reading came about, and identifiers by
which all of this can be referred to and annotated. The dissertation
surveys these formats in its chapter on variants.

Editions of texts and of notated music are mostly encoded in TEI and
MEI. A roll edition, however, is less a nested text document than a
flat structure of roll events described in numbers, and its data should
link to other domains, which is why the Roll Edition Format is JSON-LD
built on CIDOC CRM and LRMoo.

### Maintenance

The library is maintained by Niels Pfeffer
([ORCID 0000-0002-6210-7255](https://orcid.org/0000-0002-6210-7255)). It
is released under the MIT licence, the ontology and its documentation
under CC BY 4.0.
