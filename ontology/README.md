# Roll Edition Ontology (REO)

| | |
|---|---|
| Namespace | `https://w3id.org/reo/` |
| Prefix | `reo` |
| Types | `https://w3id.org/reo/type/`, prefix `reot` |
| Context | `https://w3id.org/reo/context.jsonld` |
| Version | 1.0, in preparation |

`reo.ttl` holds the classes and properties, `types.ttl` the closed
value lists of the format (expression types, edit types, purposes,
units and so on) as CRM types. The JSON-LD context in
`src/spec/context.json` maps every key of the format to a term of
REO, CIDOC CRM, LRMoo, CRMinf, CRMdig or DCMI, or sets it to `null`
to keep it out of the graph.

REO is the vocabulary behind the Roll Edition Format, the JSON-LD
format that linked-rolls reads and writes. The format is documented at
https://pfefferniels.github.io/linked-rolls/. This directory holds the
ontology itself.

## Naming

Terms carry plain names. Classes are written in upper camel case
(`reo:Perforation`), properties and type instances in lower camel case
(`reo:alignedWith`, `reo:treble`). Where a property is reo's own, its
local name is the JSON key it maps, unless that key is a plural or a
verb (`copies`, `insert`); then the property takes the singular
predicate (`reo:witness`, `reo:added`) and the context records the
mapping. A test checks that every key in the context resolves to a
term that exists. There are no CRM-style numbers.

Every class is a subclass of a CIDOC CRM, LRMoo or CRMinf class, and
every property is a subproperty of a CRM property where one applies.
A term is introduced only where those ontologies offer no equivalent.

## Versioning

The namespace IRI is unversioned. Each release also lives under a
versioned IRI such as `https://w3id.org/reo/1.0/` and declares it as
`owl:versionIRI`. A released term is never renamed. A term that falls
out of use is deprecated and kept.

## Status

The w3id.org entry is not registered yet, so the IRIs above do not
resolve at present. `reo.ttl` is the next step. The OntoMe project
https://ontome.net/project/168 documents an earlier, numbered draft
of this vocabulary and is not the source.
