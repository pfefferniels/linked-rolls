# Roll Edition Ontology (REO)

| | |
|---|---|
| Namespace | `https://w3id.org/reo/` |
| Prefix | `reo` |
| Types | `https://w3id.org/reo/type/`, prefix `reot` |
| Context | `https://w3id.org/reo/context.jsonld` |
| Version | 1.0, in preparation |

`reo.ttl` holds the classes and properties, `types.ttl` the closed
value lists of the format (edit types, purposes, units, condition
types and so on) as CRM types. The JSON-LD context in
`src/spec/context.json` maps every key of the format to a term of
REO, CIDOC CRM, LRMoo, CRMinf, CRMdig or DCMI, or sets it to `null`
to keep it out of the graph.

## Reproducing systems

The expression types depend on the system a roll was cut for: a
"forzando on" of the Welte-Mignon T-100 and one of the T-98 are
different commands. Each system therefore has a scheme of its own
under `https://w3id.org/reo/type/<system>/`, kept in
`systems/<system>.ttl`, and a small context in
`src/spec/<system>.context.json` that sends the `expressionType`
values of an edition there. The system itself is the concept
`https://w3id.org/reo/type/system/<system>`, which the roll of an
edition names, and from which the export picks the context. A new
system is a new Turtle file, a new context and a tracker bar in the
library.

REO is the vocabulary behind the Roll Edition Format, the JSON-LD
format that linked-rolls reads and writes. The format is documented at
https://pfefferniels.github.io/linked-rolls/. This directory holds the
ontology itself.

## Naming

Terms carry plain names. Classes are written in upper camel case
(`reo:Command`), properties in lower camel case
(`reo:alignedWith`), and type instances in lower case, hyphenated
where they run to more than one word (`reot:treble`,
`reot:paper-stretch`). Where a property is reo's own, its
local name is the JSON key it maps, unless that key is a plural or a
verb (`copies`, `insert`); then the property takes the singular
predicate (`reo:witness`, `reo:added`) and the context records the
mapping. A test checks that every key in the context resolves to a
term that exists. There are no CRM-style numbers.

Every class is a subclass of a CIDOC CRM, LRMoo or CRMinf class, and
every property is a subproperty of a CRM property where one applies.
A term is introduced only where those ontologies offer no equivalent.
A class is also introduced where the CRM leaves under one class
several kinds of thing an edition has to tell apart, as CRMtex does
with `TX1 Written Text` under `E25 Human-Made Feature`.

## Versioning

The namespace IRI is unversioned. Each release also lives under a
versioned IRI such as `https://w3id.org/reo/1.0/` and declares it as
`owl:versionIRI`. From the first frozen release a term is never
renamed: one that falls out of use is deprecated and kept. Until then
the vocabulary may still be corrected in place. 1.0 is a draft, the
w3id entry is not registered and nothing under it resolves, so no term
can yet have been built on. On this ground the five capitalised terms
of the writing methods and the patch materials (`reot:Print`,
`reot:Handwriting`, `reot:Stamp`, `reot:Paper`, `reot:Tape`) were
lower-cased in September 2026 to match the rest of the vocabulary, and
`migrate` reads the old spellings. On the same ground the four types
for the kinds of feature were withdrawn again in the same month, the
kinds having become classes (`reo:Hole`, `reo:Writing`, `reo:Mark`,
`reo:GluedOn`), and `reo:method` was split into `reo:technique` and
`reo:medium`, having held two statements that vary apart. `migrate`
reads the old key and sorts its terms between the two. `reo:pattern`
and its three types were withdrawn as well: whether the rows of a chain
stagger is a mark of the perforator, and `reo:drive` states it there.
Later that month `reo:Hole` became `reo:HoleChain`. The perforator cuts
a held note as a row of holes with bridges of paper between them, most
instances of the class were such chains, and a chain is several holes.
`migrate` reads the old type. `reo:GluedOn` became `reo:Patch` on the
same day. It was the one class named after how its instances came
about, which the attachment that glued them on states already.
`migrate` reads that old type as well.

## Publishing

The docs workflow renders `reo.ttl` and `types.ttl` with pyLODE and
publishes them, the Turtle files and the context on GitHub Pages:

| | |
|---|---|
| Ontology page | https://pfefferniels.github.io/linked-rolls/reo/ |
| Type vocabulary | https://pfefferniels.github.io/linked-rolls/reo/type/ |
| T-100 expression types | https://pfefferniels.github.io/linked-rolls/reo/type/welte-t100/ |
| T-98 expression types | https://pfefferniels.github.io/linked-rolls/reo/type/welte-green/ |
| Turtle | `…/reo/reo.ttl`, `…/reo/types.ttl`, `…/reo/type/welte-t100/welte-t100.ttl`, `…/reo/type/welte-green/welte-green.ttl` |
| Contexts | `…/reo/context.jsonld`, and one per system under `…/reo/welte-t100/`, `…/reo/welte-green/` and `…/reo/welte-licensee/` |

The w3id.org entry is not registered yet, so the namespace IRIs do not
resolve at present. Once it is, it redirects to these locations.

## Status

Version 1.0 is a draft. The OntoMe project
https://ontome.net/project/168 documents an earlier, numbered draft
of this vocabulary and is not the source.
