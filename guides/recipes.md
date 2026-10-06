---
title: Recipes
---

# Recipes

Short scripts against an edition: reading it, listing its versions,
reading the text of one and what it changed, playing it, and changing the
edition. They follow on from each other, each taking up `edition` and
`version` from the ones before. The code is that of the library's tests,
which run it against a document in the repository, so it does what the
page says. The format of the documents is described at
<https://pfefferniels.github.io/linked-rolls/>.

## Read an edition and check it

An edition is published as a JSON-LD document.
{@linkcode linked-rolls!importJsonLd | importJsonLd} reads it into plain data,
and brings a document written by an earlier release of the format up to
date on the way. {@linkcode linked-rolls/validate!validate | validate} holds a
document, not what the import returns, against the schema of the current
format, so a document of an earlier release fails until
{@linkcode linked-rolls!migrate | migrate} has brought it up to date; a current
document passes through `migrate` unchanged. Where a document fails,
`validate.errors` lists each fault with where it lies (`instancePath`, a
JSON pointer) and what is wrong there. A script reports them and stops
rather than reading on. `file` is the path of the document.

```ts
import { readFileSync } from 'node:fs'
import { importJsonLd, migrate } from 'linked-rolls'
import { validate } from 'linked-rolls/validate'
```

{@includeCode ../test/recipes.test.ts#read}

## List the versions

A version is a state of the roll's text, defined by its edits against the
version it derives from; the versions and their derivations form the
stemma. A version does not store its siglum.
{@linkcode linked-rolls!siglaOf | siglaOf} reads the sigla off the stemma as it
stands: the letter names the reproducing system (R for the red Welte
T-100, G for the green, L for the Licensee), the number counts the
generations, and a number after a dot marks a branch. A version that no
copy shows at first hand, known only through the versions derived from
it, is in lowercase, as r1 is here. Since the sigla change whenever the
stemma does, a script or a citation names a version by its id, which the
document's base makes an IRI. {@linkcode linked-rolls!derivationsOf | derivationsOf}
gives the versions a version derives from, each with the certainty the
derivation is held with.

```ts
import { derivationsOf, siglaOf, versionIn } from 'linked-rolls'
```

{@includeCode ../test/recipes.test.ts#versions}

## Read the text of a version

A feature is something physical on one copy, above all a chain of holes.
A symbol is what the edition reads from it: a note with its pitch, an
expression command with its type and the half of the keyboard it acts on,
or a text such as a label. One symbol stands for the same perforation on
every copy that has it, and its `carriers` name those features by id.
{@linkcode linked-rolls!snapshotOf | snapshotOf} gives the symbols a version
shows, what it and its ancestors insert less what they delete, in order of
place. {@linkcode linked-rolls!placeOf | placeOf} gives where a symbol lies, as
the median of its carriers' places, in millimetres on the edition's axis.
That axis is the paper of the reference copy, measured from where its scan
begins. A document holds each copy's features at the copy's own places,
and the import has carried them onto the axis.

```ts
import { carriersOf, copyOfFeature, isCommand, placeOf, snapshotOf } from 'linked-rolls'
```

{@includeCode ../test/recipes.test.ts#text}

## See what a version changed

A version states only how it differs from the version it derives from,
which {@linkcode linked-rolls!predecessorOf | predecessorOf} gives. Each edit
inserts symbols, deletes by id symbols that version shows, or both, and
may name an edit type and a motivation, the latter by the id of one of the
version's `motivations`. A collation
({@linkcode linked-rolls!connectVersions | connectVersions}) writes each
difference it finds with the motivation `unchecked`, which the version
declares with a note saying that no editor has read the edit yet. Any
statement can carry a belief under `@annotation`, a JSON-LD-star
annotation that holds the statement with a certainty from `true` to
`false` for the reasons it lists. {@linkcode linked-rolls!certaintyOf | certaintyOf}
reads the certainty; a statement without a belief is held true.

```ts
import { certaintyOf, editsOf, symbolsIn } from 'linked-rolls'
```

{@includeCode ../test/recipes.test.ts#changes}

## Play a version as MIDI

{@linkcode linked-rolls!emulate | emulate} performs a version on a reproducing
system: the commands are placed on the paper, and the system's model of
the instrument turns the paper into time, dynamics and pedalling. The
Welte-Mignon systems have entry points of their own,
`linked-rolls/welte-t100`, `linked-rolls/welte-t98` and
`linked-rolls/welte-licensee`, and need the optional peer dependency
[welte-mignon-emulator](https://github.com/pfefferniels/welte-t100); use
the one the version is coded for (`version.system`).
{@linkcode linked-rolls!midiOf | midiOf} gives the performance as a MIDI file in
the form midifile-ts reads and writes, each note labelled with the id of
the symbol it performs; `write` turns it into the bytes of a standard
MIDI file. `out` is the path of the MIDI file.

```ts
import { writeFileSync } from 'node:fs'
import { write } from 'midifile-ts'
import { emulate, midiOf } from 'linked-rolls'
import { welteT100System } from 'linked-rolls/welte-t100'
```

{@includeCode ../test/recipes.test.ts#midi}

## Change an edition and write it back

An edition is frozen once anything has been asked of it, since what the
library works out from a state is kept for as long as the state lasts. It
is changed through operations, never in place. An operation is a function
on an [immer](https://immerjs.github.io/immer/) draft of the edition:
`produce` applies one, or several in turn, and returns the new state,
leaving the old one as it was. Roll Desk makes each operation one step to
undo. The operations on beliefs take the path to the statement, which
{@linkcode linked-rolls!pathIn | pathIn} finds from its id.
{@linkcode linked-rolls!asJsonLd | asJsonLd} turns the edition back into a
document, each copy's features at the copy's own places again. The
published edition of WM 225 is written with four spaces of indentation and
a final newline, so that a diff between two states shows only what
changed.

```ts
import { writeFileSync } from 'node:fs'
import { produce } from 'immer'
import { addReason, asJsonLd, createBelief, editsOf, pathIn, setCertainty } from 'linked-rolls'
import { validate } from 'linked-rolls/validate'
```

{@includeCode ../test/recipes.test.ts#write}
