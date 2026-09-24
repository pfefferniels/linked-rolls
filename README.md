# linked-rolls

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
import { asJsonLd, connectVersions, createVersion, EditionView, importJsonLd, readFromStanfordAton } from 'linked-rolls'

let edition = importJsonLd(json)

// Add a copy read from a SUPRA analysis file, with a version of its own
edition = produce(edition, createVersion(readFromStanfordAton(aton)))

// Collate that version against another one
const view = new EditionView(edition)
edition = produce(edition, connectVersions(view, childId, parentId))

const document = asJsonLd(edition)
```

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

const { events, source } = emulate(welteT100System, version, view)
const midi = midiOf(events, welteT100System.name, welteT100System.defaultOptions, source)
```

The systems are `linked-rolls/welte-t100` (red Welte),
`linked-rolls/welte-t98` (green Welte) and `linked-rolls/welte-licensee`.

## Format

The export uses the Roll Edition Ontology (REO), namespace
`https://w3id.org/reo/`, together with CIDOC CRM, LRMoo and CRMinf. The
ontology is in `ontology/`. It is published with its context and the
documentation of the format at
https://pfefferniels.github.io/linked-rolls/ (the w3id.org identifiers are
not registered yet).

Beliefs are written as JSON-LD-star annotations (`@annotation`), so you
need a processor that supports JSON-LD-star to read them.

## Development

```
npm ci
npm test
npm run lint
npm run build
```

## Releasing

Raise the version in `package.json`, commit, and push a tag
`v<version>`. The `publish.yml` workflow builds, tests and publishes to
npm.
