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

Beliefs travel as JSON-LD-star annotations (`@annotation`), which state
the triple they annotate. A reference the edition holds possible,
unlikely or false is therefore written as an embedded node beside the
document: RDF names the statement without stating it, and
`importJsonLd` puts it back where it stood. A doubted value, such as a
date or an attribution, stays annotated in place for now. Reading the
beliefs needs a processor that implements JSON-LD-star, such as the
Ruby `json-ld` gem; jsonld.js ignores `@annotation`, and every belief
with it.

## Format revisions

Files written by linked-rolls 0.1 load unchanged: `importJsonLd`
recognises their shapes and brings them to the current format, in
which versions and conditions carry a typology key beside their type,
the keeper and the production metadata are nodes with a name and
authority links, and the roll names its reproducing system. A date
written as a value of its own is read as the day the event falls
within. A copy that held its features in one list, naming by id what a
modification had added, has each feature put into the act that brought
it about, and a feature a patch bears that was left unnamed is named
after the patch. Exports are always in the current format.

## How a date is stated

A date is the time-span of the event rather than a value on it.
`within` gives the day it falls within, and `after` and `before` give
the bounds where nobody can give the day. A bound the edition does not
know is left out, so `after` alone says "not before". In RDF the three
become `P82 at some time within`, `P82a begin of the begin` and `P82b
end of the end` on the `E52 Time-Span` the event has. `assignDate`,
`notBefore` and `notAfter` build the three shapes, and `dateOf`,
`earliestOf` and `latestOf` read them.

Note that `before` and `after` mean something else on a command,
where they order two onsets. The context defines them for a date
within the date itself, so the two never meet.

## What a version derives from

A version names the versions it is held to derive from in `basedOn`,
each under the belief it rests on. Its text is read against the
principal derivation, the first of those held most certain, and one
held unlikely or false never gives the text. The others stand as
hypotheses, such as a contamination: `stateDerivation` adds one and
`clearDerivation` takes it back. A version may leave out its `edits`
where nobody can state them, as for a text that only a recording hints
at. It then reads as the version it derives from, and
`reservationsAboutVersion` says so. A file that names a single
derivation loads as a list of one.

What a version is called is not stored with it. `siglaOf` reads the
sigla off the stemma as it stands, so a label never outlives the
arrangement it describes, and nothing should cite one without saying
which state of the edition it belongs to.

Handed an `EditionView`, which knows the copies as well, `siglaOf`
lowercases the versions no copy's features carry at first hand, as
editions mark a state nothing surviving shows: r3 stands to R3 as a
reconstructed state stands to a witnessed one. A version reached only
through the versions derived from it is lowercased, and so is one a
copy does no more than state it carries, since a statement gives no
readings. `attestedVersions` reports the same fact on its own. Handed
the versions alone, `siglaOf` cannot tell and leaves every siglum in
capitals.

## The tolerance a derivation was collated at

`collationTolerance` on a derivation is the window two readings of one
symbol must fall in to be collated: how far apart they may lie at
either end, and, since two copies differ by a systematic offset as well
as by scatter, where that window is centred. A window naming no offset
is centred on nothing, which is what every window written before the
offset was held here means.

The number decides what counts as a reading at all, so it is worth
measuring rather than picking. `scatterOfCopy` measures how far one
copy puts each symbol from where the copies collated with it put it,
and `scatterOf` describes that sample: its median, its scatter as a
median absolute deviation scaled to a standard deviation, a histogram
with the normal curve to lay over it, and the readings the curve does
not account for. The scatter is taken from the median because the
displacements an editor is looking for are in the sample, and a
standard deviation would grow towards them until they no longer stood
out.

The copies named are one **side** of the comparison and the rest are
the other, so which copies to name is the first question and the
edition no longer answers it: a collation hands a child's carriers up
to the parent's symbols, so a descendant's copies come to bear an
ancestor's readings and look like its own. `sidesOf` reads the sides
off the edits instead, the copies bearing what a version inserts
standing for the reading it moves to and those bearing what it strikes
for the reading it moves from. Naming a set that is not a side measures
one copy's noise against a mixture of both sides, which is wider than
the truth.

The tolerance that follows is the scatter times a threshold fixed by
the size of the sample, the point beyond which fewer than one reading
is expected to fall by chance (`departureThreshold`). For the few
hundred readings an edge of a stemma yields this lands a little above
three. `toleranceAcross` covers several samples with one window, since
a derivation states one tolerance while notes and expressions scatter
differently. It asks which side was measured, because a window is
signed: the offset runs from the parent to the child, and one stored
the other way round has the right width and the wrong centre, so it
separates readings that belong together and merges readings that do
not while nothing in the number looks wrong. `inferredTolerance` builds
the belief the number rests on, to annotate `collationTolerance` with. It is held likely and not
true: the tolerance follows from the sample only as far as the sample
is normal, which is what the reported excess kurtosis and tail counts
are there to show.

Two limits are worth naming. Notes and expressions are estimated apart
by default, which is a stopgap standing in for a skew across the width
of the paper rather than a distinction in the model, so the grouping is
a parameter of the estimator and appears nowhere in the format. And the
method screens: it says which readings the curve does not account for,
and an editor says which of those are editorial acts.

A separation reports which end made it (`separatedBy`, and
`admittedAtEnds` for a collation). The two ends answer different
questions: the onset, with the kind, decides whether two copies read one
command, and the end decides whether that command was lengthened or
shortened. On welte225.org the end alone decides 24 collations of 2839
and the onset alone 39, so neither test is idle, but a difference at the
end is as often a punch measured badly as a punch genuinely prolonged,
and the two are not worth confusing.

## What a reader adds to a chain of holes

A copy read pneumatically rather than scanned reports how long a valve
stayed open, and a valve is held on past the perforation that opened it,
so the chains it reports run longer than the punched ones while their
onsets agree. Left in, that is not a difference between copies: a
collation comparing such a copy's chain ends against a scanned copy's
compares an on-time with a slot, and reads the one as a lengthening of
the other.

`shortenChains` takes the extension off and records it on the copy,
`revertShortening` puts it back, and `readFromPhillipsEroll` will take
it off at import. Only chains of holes are touched, what a writing spans
being no valve. The figure is measured against the other copies rather than
derived from the bar, since Phillips gives only the difference between
two bars and not the absolute.

On welte225.org that figure is about 1.6 mm, and its shape is simple. It
does not grow with the length of the perforation: the ratio of the read
length to the true one falls from 1.34 on the shortest punches to 1.01
on the longest, which is what a constant added to everything does. There
is no shortest on-time the valve cannot fall below. It shows no run
along the roll, though one roll's span of paper speed is too narrow to
tell a constant in millimetres from a constant in time. What it does
vary with is the port that read it, by about half a millimetre either
way and with no gradient across the bar, which is measured but too
coarse to model from a single roll.

## Collating a derivation a second time

A collated symbol is one symbol carrying every copy that reads it, so a
collation cannot simply be run again: there is no second symbol left to
match. `separateReadings` is the inverse. It takes the carriers of one
side back off the symbols it shares, gives them to new symbols of the
version's own, and states the exchange, leaving the edition in the state
a collation would have produced had nothing joined. `connectVersions` at
a new tolerance then re-collates, joining again whatever the new window
admits.

It takes a side and not a copy, the same side `sidesOf` names and a
window is measured over. Naming one copy of a side that has several does
not separate that side: the rest of it stays behind on the other side's
symbol, and a collation then compares one copy against that mixture
rather than the two texts against each other.

Nothing an editor established is lost by that. `connectVersions`
rewrites only what a collation wrote (`isCollationsOwn`): a bare
insertion or deletion, or an equivalence between two systems' spellings.
An edit naming what the change is, why it was made, or what it rests on
stays, and the symbols it speaks for are left out of the collation. An
equivalence counts as the collation's own, since it is derived from the
two systems' vocabularies rather than read off the paper and freezing it
would leave the transfers uncollatable, but one drawn a second time over
the very same symbols is kept as it stands, identifier and motivation
and all. Readings already separated by hand are carried by one copy
alone, so `separateReadings` passes over them and they keep their
identifiers.

## What brought a feature about

A copy states no list of features. Each feature stands in the act that
brought it about: the copy's own production for what the punching made,
an `Alteration` for what a later hand made, an `Attachment` for a patch
glued on. A `Removal` names by id what was taken off, which stood there
before the act.

Which act a feature stands in says when it came about and by whose
hand, and says nothing about what kind of feature it is. A hole may be
punched by hand long after the roll was cut, and a mark may come from
the factory, rarely though that happens. A feature no later act is
known to have made belongs to the punching, which is where a reading of
a scan puts every chain of holes it finds.

Three kinds of act rather than two, because the CRM tells them apart.
E79 Part Addition asks that what is added be "a separate identifiable
whole prior to" the act, which a glued-on label is and a pencil line is
not: drawing, writing and punching bring a feature into being and are
productions (E12), which state what they made with `reo:produced`, a
subproperty of P108 has produced.

The format states nothing a reasoner can derive. That a copy bears every
feature its acts brought about (P56 bears feature) and is composed of
the patches glued onto it (P46 is composed of, a patch being an object
rather than a feature) follows from property chains in `reo.ttl`, all
within OWL 2 RL. The chain for the punching runs over `reo:produced`
rather than P108, because R28 produced is itself a subproperty of P108
(LRMoo 1.0, p. 44), and a chain over P108 would have the copy bear
itself. That an attachment augments the copy and a removal diminishes
it depends on the class of the act, which no chain can test. These two
keys are derived on the way out and read off again on the way in, so
they are no part of the edition, and they are the one place where the
JSON tree and the graph differ in shape.

## Where a copy's features come from

`readFrom` states what a copy's features were read from: the roll
itself, a `scan` of it, an `analysis` somebody else measured on a
scan, a `reading` of the timed switches of a roll reader, an
`emulation` in which the roll has already been read into notes and
commands, or a `recording` of the copy being played on an instrument.
Beside the kind it holds who carried the capture out, on what device,
with what software, on which instrument a recorded copy was played,
when, and a note. What is not known is left out.

This says where the numbers of the edition come from and nothing
about the state of the paper, which is a condition of the copy. In
RDF it is `reo:capture`, an activity typed by what it read from; the
file it produced is `crmdig:L11 had output`, the machine it ran on
`crmdig:L12 happened on device`, the software `crmdig:L23 used
software or firmware`, the instrument `crm:P16 used specific object`.

Nothing records that a copy is doubtful. `reservationsAbout` works
out from what a copy states what the edition cannot vouch for in it:
that it names no source, that the making of its source is
undocumented, that no software or instrument is named for an
emulation or a recording, that its features are somebody else's
reading, that its source bears no physical evidence, that no measuring
software is recorded, that it is not calibrated, that nobody is known
to hold it. A reservation goes away when the gap it names is filled.

A copy nobody can reach, such as one known only from a recording, has
no features to carry the symbols of a version. It states instead
which versions it is held to carry, in `carries`, each under a belief
that says how certainly and why. `witnessesOf` gathers the copies of a
version, whether their features carry its symbols or they state that
they carry it, a statement with the belief it rests on;
`versionsWitnessedBy` gathers the same from the side of a copy.
`carriageProblems` reports a statement made beside features that carry
symbols already, or one naming a version the edition lacks. A copy may
carry a `siglum`, which is given by hand and not read off anything;
one without is named by its keeper.

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
import { emulate, midiOf } from 'linked-rolls'
import { welteT100System } from 'linked-rolls/welte-t100'

const { events, curves, source } = emulate(welteT100System, version, view)
const midi = midiOf(events, welteT100System.name, welteT100System.defaultOptions, source)
```

`Emulation` does the same and keeps the result on the object between
`emulateVersion` and `asMIDI`.

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

A command takes its place from the chains of holes that carry it. Four
fields on a command let an editor state where the measurement should
give way. `alignedWith` names another command whose onset this one takes
in the performance, as a "crescendo off" is meant to fall on the note
it belongs to. `before` and `after` name a command whose onset this
one precedes or follows, without saying by how much: where the copies
disagree on which side of a note an expression falls, the statement
settles the order. A command the measurement already has on the
stated side keeps its place. One it does not is put on that side, as
far from the reference as the copies that agree with the statement put
it, and a punch diameter away where none does. A command makes one
of these three statements at most. `pairedWith` names a partner whose
distance to this one is fixed, as a "forzando on" belongs with its
"forzando off": whatever displaces the one displaces the other. Any two
commands may be paired, the relation is symmetric, and it is stated
on one side only. All are applied when a version is emulated.
`constraintProblems` lists, version by version, the cases in which the
statements cannot hold: a reference or partner that is absent, a
command placed relative to itself or in several ways at once, one
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
