import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import jsonld from 'jsonld'
import { Parser, Quad, Term } from 'n3'
import context from '../src/spec/context.json'
import welteT100Context from '../src/spec/welte-t100.context.json'
import welteLicenseeContext from '../src/spec/welte-licensee.context.json'
import welteT98Context from '../src/spec/welte-t98.context.json'
import { AnyFeature, Patch, Mark, NestedFeature, Transcription, Writing } from '../src/model/Feature'
import { Modification } from '../src/model/RollCopy'
import { assignObject } from '../src/model/Assumption'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { degrees, mm, track } from '../src/model/Quantity'
import { Edition } from '../src/model/Edition'
import { alteration, copy, editionOf, hole, note, version } from './editionFixture'

/**
 * Each kind of feature is a class of its own, three of them under E25
 * Human-Made Feature and the patch under E22 Human-Made Object, so the
 * type a feature states is what holds the four apart. Every feature
 * stands in the act that brought it about: the punching, an alteration,
 * or an attachment gluing a patch on. That the copy bears the features
 * is left to a reasoner, which derives it with the axioms of reo.ttl.
 */

type Json = any

const contexts: Record<string, Json> = {
    'https://w3id.org/reo/context.jsonld': context,
    'https://w3id.org/reo/welte-t100/context.jsonld': welteT100Context,
    'https://w3id.org/reo/welte-licensee/context.jsonld': welteLicenseeContext,
    'https://w3id.org/reo/welte-green/context.jsonld': welteT98Context
}

const documentLoader = async (url: string) => {
    const document = contexts[url]
    if (!document) throw new Error(`no local copy of ${url}`)
    return { contextUrl: undefined, documentUrl: url, document }
}

const base = 'https://example.org/edition/'
const crm = 'http://www.cidoc-crm.org/cidoc-crm/'
const lrmoo = 'http://iflastandards.info/ns/lrm/lrmoo/'
const reo = 'https://w3id.org/reo/'
const reot = 'https://w3id.org/reo/type/'
const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#'
const rdfs = 'http://www.w3.org/2000/01/rdf-schema#'
const owl = 'http://www.w3.org/2002/07/owl#'

const at = (from: number, to: number, position: number) => ({
    horizontal: { unit: 'mm' as const, from: mm(from), to: mm(to) },
    vertical: { unit: 'track' as const, from: track(position) }
})

const stamp: NestedFeature = {
    type: 'Writing',
    id: 'stamp',
    technique: 'stamp',
    transcription: assignObject<Transcription>({ type: 'text', id: 'stamp-text', text: 'Welte' })
}

const writing: Writing = {
    type: 'Writing',
    id: 'date',
    ...at(20, 60, 47),
    technique: 'handwriting',
    medium: 'pencil',
    side: 'verso',
    rotation: { value: degrees(12), unit: 'deg' },
    transcription: assignObject<Transcription>({ type: 'text', id: 'date-text', text: '20.I.1905' })
}

const mark: Mark = { type: 'Mark', id: 'circle', ...at(80, 90, 47), medium: 'pencil' }

const patch: Patch = {
    type: 'Patch', id: 'patch', ...at(100, 140, 47), material: 'paper', side: 'recto', features: [stamp]
}

const punched: AnyFeature[] = [hole('perforation', 10, 12, 47)]

const acts: Modification[] = [
    { type: 'Alteration', purpose: 'dating', produced: [writing, mark] },
    { type: 'Attachment', purpose: 'labeling', added: [patch] },
    { type: 'Removal', purpose: 'delabeling', removed: ['gone'] }
]

/** A copy with one feature of each kind, each in the act that brought it about. */
const withFeatures = () => editionOf(
    [{ ...copy('first', punched), modifications: acts }],
    [version('A', [{ type: 'edit', id: 'edit-a', insert: [note('note', 60, 'perforation')] }])]
)

const exportOf = (edition: Edition) => {
    edition.base = base
    return JSON.parse(JSON.stringify(asJsonLd(edition)))
}

const exported = () => exportOf(withFeatures())

interface Triple { subject: string, property: string, object: string }

const withoutBrackets = (term: string) => term.replace(/^<|>$/g, '')

const triples = async (edition: Edition = withFeatures()): Promise<Triple[]> => {
    const quads = await jsonld.toRDF(exportOf(edition), {
        format: 'application/n-quads',
        documentLoader
    }) as unknown as string

    return quads.split('\n').flatMap(line => {
        const stated = /^(\S+) <([^>]+)> (.+) \.$/.exec(line.trim())
        return stated
            ? [{ subject: withoutBrackets(stated[1]), property: stated[2], object: withoutBrackets(stated[3]) }]
            : []
    })
}

const of = (id: string) => `${base}${id}`

/** What the graph states about the subject under the property. */
const statedOf = (all: Triple[], subject: string, property: string): string[] =>
    all.filter(triple => triple.subject === subject && triple.property === property)
        .map(({ object }) => object)

const classOf = (all: Triple[], subject: string): string[] => statedOf(all, subject, `${rdf}type`)

/** The one node of the graph that is of the class; an act carries no id and is a blank node. */
const theOne = (all: Triple[], klass: string): string => {
    const found = [...new Set(all
        .filter(({ property, object }) => property === `${rdf}type` && object === klass)
        .map(({ subject }) => subject))]
    expect(found).toHaveLength(1)
    return found[0]
}

/**
 * LRMoo 1.0, p. 44: R28 produced is a subproperty of P108 has produced.
 * The inverses are those the LRMoo 1.0 OWL declares.
 */
const lrmooAxioms = `
    <${lrmoo}R28_produced> <${rdfs}subPropertyOf> <${crm}P108_has_produced> .
    <${lrmoo}R28i_was_produced_by> <${owl}inverseOf> <${lrmoo}R28_produced> .
    <${lrmoo}R81_recorded> <${owl}inverseOf> <${lrmoo}R81i_is_recorded_in> .
    <${lrmoo}R19_created_a_realisation_of> <${owl}inverseOf> <${lrmoo}R19i_was_realised_through> .
    <${lrmoo}R3_is_realised_in> <${owl}inverseOf> <${lrmoo}R3i_realises> .
`

/** A property of a chain, or its inverse where the chain names it by owl:inverseOf. */
interface Step { property: string, inverse: boolean }

interface Chain { steps: Step[], implied: string }

interface Axioms {
    readonly supers: ReadonlyMap<string, string[]>
    readonly inverses: ReadonlyMap<string, string[]>
    readonly chains: readonly Chain[]
}

const axioms = (): Axioms => {
    const quads = new Parser().parse(readFileSync('ontology/reo.ttl', 'utf-8') + lrmooAxioms)
    const objectsOf = (subject: Term, predicate: string): Term[] =>
        quads.filter(quad => quad.subject.equals(subject) && quad.predicate.value === predicate).map(quad => quad.object)
    const listOf = (head: Term): Term[] => head.value === `${rdf}nil`
        ? []
        : [objectsOf(head, `${rdf}first`)[0], ...listOf(objectsOf(head, `${rdf}rest`)[0])]
    const pairs = (predicate: string): [string, string][] =>
        quads.filter(quad => quad.predicate.value === predicate && quad.subject.termType === 'NamedNode')
            .map(quad => [quad.subject.value, quad.object.value])
    const grouped = (entries: [string, string][]) =>
        new Map([...Map.groupBy(entries, ([from]) => from)].map(([from, all]) => [from, all.map(([, to]) => to)]))

    const stepOf = (term: Term): Step => {
        const [inverted] = objectsOf(term, `${owl}inverseOf`)
        return inverted ? { property: inverted.value, inverse: true } : { property: term.value, inverse: false }
    }

    const inverseOf = pairs(`${owl}inverseOf`)
    return {
        supers: grouped(pairs(`${rdfs}subPropertyOf`)),
        inverses: grouped([...inverseOf, ...inverseOf.map(([a, b]): [string, string] => [b, a])]),
        chains: quads.filter((quad: Quad) => quad.predicate.value === `${owl}propertyChainAxiom`).map(quad => ({
            steps: listOf(quad.object).map(stepOf),
            implied: quad.subject.value
        }))
    }
}

const keyOf = ({ subject, property, object }: Triple) => `${subject} ${property} ${object}`

/** The nodes one step leads to from the node. */
const reached = (all: Triple[], node: string, { property, inverse }: Step): string[] => inverse
    ? all.filter(t => t.property === property && t.object === node).map(({ subject }) => subject)
    : statedOf(all, node, property)

/** The nodes a step can be taken from. */
const startsOf = (all: Triple[], { property, inverse }: Step): string[] =>
    [...new Set(all.filter(t => t.property === property).map(t => inverse ? t.object : t.subject))]

const along = (all: Triple[], node: string, steps: readonly Step[]): string[] =>
    steps.reduce((nodes, step) => nodes.flatMap(from => reached(all, from, step)), [node])

/** What one application of the rules for subproperties, inverses and chains adds to the triples. */
const oneStep = (all: Triple[], { supers, inverses, chains }: Axioms): Triple[] => [
    ...all.flatMap(t => (supers.get(t.property) ?? []).map(property => ({ ...t, property }))),
    ...all.flatMap(t => (inverses.get(t.property) ?? []).map(property => ({ subject: t.object, property, object: t.subject }))),
    ...chains.flatMap(({ steps, implied }) => startsOf(all, steps[0])
        .flatMap(subject => along(all, subject, steps).map(object => ({ subject, property: implied, object }))))
]

/** The triples together with everything the rules derive from them, as OWL 2 RL applies prp-spo1, prp-inv and prp-spo2. */
const entailedBy = (all: Triple[], rules: Axioms = axioms()): Triple[] => {
    const known = new Set(all.map(keyOf))
    const added = [...new Map(oneStep(all, rules).filter(t => !known.has(keyOf(t))).map(t => [keyOf(t), t])).values()]
    return added.length === 0 ? all : entailedBy([...all, ...added], rules)
}

describe('the kinds of feature', () => {
    it('each state a class of their own', async () => {
        const all = await triples()
        expect(classOf(all, of('perforation'))).toEqual([`${reo}HoleChain`])
        expect(classOf(all, of('date'))).toEqual([`${reo}Writing`])
        expect(classOf(all, of('circle'))).toEqual([`${reo}Mark`])
        expect(classOf(all, of('patch'))).toEqual([`${reo}Patch`])
    })

    it('tell how a trace was made from what it was made with', async () => {
        const all = await triples()
        expect(statedOf(all, of('date'), `${reo}technique`)).toEqual([`${reot}handwriting`])
        expect(statedOf(all, of('date'), `${reo}medium`)).toEqual([`${reot}pencil`])
        expect(statedOf(all, of('circle'), `${reo}medium`)).toEqual([`${reot}pencil`])
        expect(statedOf(all, of('patch'), `${crm}P45_consists_of`)).toEqual([`${reot}paper`])
    })

    it('state the face a trace lies on and how far it stands askew', async () => {
        const all = await triples()
        expect(statedOf(all, of('date'), `${reo}side`)).toEqual([`${reot}verso`])
        expect(statedOf(all, of('patch'), `${reo}side`)).toEqual([`${reot}recto`])

        const [dimension] = statedOf(all, of('date'), `${reo}rotation`)
        expect(statedOf(all, dimension, `${crm}P90_has_value`)[0]).toMatch(/^"12"\^\^<?http:\/\/www.w3.org\/2001\/XMLSchema#integer/)
        expect(statedOf(all, dimension, `${crm}P91_has_unit`)).toEqual([`${reot}deg`])
    })

    it('say nothing beside the class about what kind of feature they are', async () => {
        const all = await triples()
        const kinds = ['hole', 'writing', 'mark', 'glued-on'].map(kind => `${reot}${kind}`)
        expect(all.filter(({ object }) => kinds.includes(object))).toEqual([])
    })
})

describe('the acts that made the features', () => {
    it('states each of the three as the class of act it is', async () => {
        const all = await triples()
        expect(theOne(all, `${crm}E12_Production`)).toBeTruthy()
        expect(theOne(all, `${crm}E79_Part_Addition`)).toBeTruthy()
        expect(theOne(all, `${crm}E80_Part_Removal`)).toBeTruthy()
    })

    it('states what each act brought about or took away', async () => {
        const all = await triples()
        expect(statedOf(all, theOne(all, `${crm}E12_Production`), `${reo}produced`).sort())
            .toEqual([of('circle'), of('date')])
        expect(statedOf(all, theOne(all, `${crm}E79_Part_Addition`), `${crm}P111_added`)).toEqual([of('patch')])
        expect(statedOf(all, theOne(all, `${crm}E80_Part_Removal`), `${crm}P113_removed`)).toEqual([of('gone')])
    })

    it('states what each act changed, and that the copy was changed by it', async () => {
        const all = await triples()
        expect(statedOf(all, theOne(all, `${crm}E79_Part_Addition`), `${crm}P110_augmented`)).toEqual([of('first')])
        expect(statedOf(all, theOne(all, `${crm}E80_Part_Removal`), `${crm}P112_diminished`)).toEqual([of('first')])
        expect(statedOf(all, of('first'), `${crm}P31i_was_modified_by`)).toHaveLength(3)
    })

    it('lets the production of the copy hold what the punching made', async () => {
        const all = await triples()
        const production = statedOf(all, of('first'), `${lrmoo}R28i_was_produced_by`)
        expect(production).toHaveLength(1)
        expect(statedOf(all, production[0], `${reo}produced`)).toEqual([of('perforation')])
    })
})

describe('what a reasoner derives from the acts', () => {
    it('states no bearing itself', async () => {
        const all = await triples()
        expect(all.filter(({ property }) => property === `${crm}P56_bears_feature`)).toEqual([])
        expect(statedOf(all, of('first'), `${crm}P46_is_composed_of`)).toEqual([])
    })

    it('lets the copy bear every feature its acts brought about', async () => {
        const all = entailedBy(await triples())
        expect(statedOf(all, of('first'), `${crm}P56_bears_feature`).sort())
            .toEqual([of('circle'), of('date'), of('perforation')])
    })

    it('lets a patch be a part of the copy, and the copy not bear itself', async () => {
        const all = entailedBy(await triples())
        expect(statedOf(all, of('first'), `${crm}P46_is_composed_of`)).toEqual([of('patch')])
        const [production] = statedOf(all, of('first'), `${lrmoo}R28i_was_produced_by`)
        expect(statedOf(all, production, `${crm}P108_has_produced`)).toContain(of('first'))
        expect(statedOf(all, of('first'), `${crm}P56_bears_feature`)).not.toContain(of('patch'))
        expect(statedOf(all, of('first'), `${crm}P56_bears_feature`)).not.toContain(of('first'))
    })

    it('states the features glued onto a patch as its parts', async () => {
        const all = await triples()
        expect(statedOf(all, of('patch'), `${crm}P46_is_composed_of`)).toEqual([of('stamp')])
    })

    it('types the copy so that it may bear a feature at all', async () => {
        const all = await triples()
        expect(classOf(all, of('first'))).toEqual([`${reo}RollCopy`])
    })

    it('reads the derived statements off again rather than keeping them', () => {
        const read = importJsonLd(exported())
        expect(read.copies[0]).toEqual(withFeatures().copies[0])
        expect(asJsonLd(read).copies[0]).toEqual(exported().copies[0])
    })

    it('reads an export that still states what the copy and a patch bear', () => {
        const older = exported()
        const [first] = older.copies
        const [, attachment] = first.modifications
        const [patch] = attachment.added
        older.copies = [{
            ...first,
            bears: [{ '@id': 'perforation' }],
            composedOf: [{ '@id': 'patch' }],
            modifications: first.modifications.map((act: Json) => act === attachment
                ? { ...act, added: [{ ...patch, bears: [{ '@id': 'stamp' }] }] }
                : act)
        }]
        expect(importJsonLd(older).copies[0]).toEqual(withFeatures().copies[0])
    })
})

/**
 * Two versions, the second derived from the first, and a copy of each.
 * The note the first version adds is kept by the second, so the copy of
 * the second carries it as well.
 */
const withStemma = () => editionOf(
    [copy('first', [hole('first-note', 10, 12, 47)]),
        copy('second', [hole('second-note', 10, 12, 47), hole('second-added', 20, 22, 48)])],
    [version('A', [{ type: 'edit', id: 'edit-a', insert: [note('kept', 60, 'first-note', 'second-note')] }]),
        version('B', [{ type: 'edit', id: 'edit-b', insert: [note('added', 61, 'second-added')] }], 'A')]
)

const productionOf = (all: Triple[], copyId: string): string => {
    const [production] = statedOf(all, of(copyId), `${lrmoo}R28i_was_produced_by`)
    return production
}

const recordingIn = (all: Triple[]): string => {
    const [roll] = statedOf(all, base, `${lrmoo}R3i_realises`)
    const [recording] = statedOf(all, roll, `${lrmoo}R19i_was_realised_through`)
    return recording
}

describe('what a reasoner derives about when a version was made', () => {
    it('lets an edit end no later than the punching of a chain carrying what it added', async () => {
        const all = entailedBy(await triples())
        const [production] = statedOf(all, of('first'), `${lrmoo}R28i_was_produced_by`)
        expect(statedOf(all, of('edit-a'), `${crm}P184_ends_before_or_with_the_end_of`)).toEqual([production])
    })

    it('bounds it by the act that punched the chain, not by the older copy altered by hand', async () => {
        const punchedByHand = editionOf(
            [{ ...copy('older', []), modifications: [alteration(hole('by-hand', 10, 12, 47))] }],
            [version('B', [{ type: 'edit', id: 'edit-b', insert: [note('added', 60, 'by-hand')] }])]
        )
        const all = entailedBy(await triples(punchedByHand))
        const [production] = statedOf(all, of('older'), `${lrmoo}R28i_was_produced_by`)
        const [handPunching] = statedOf(all, of('older'), `${crm}P31i_was_modified_by`)
        expect(statedOf(all, of('edit-b'), `${crm}P184_ends_before_or_with_the_end_of`)).toEqual([handPunching])
        expect(handPunching).not.toEqual(production)
    })

    it('states no order in time itself', async () => {
        const all = await triples(withStemma())
        const ordering = [`${crm}P175_starts_before_or_with_the_start_of`, `${crm}P184_ends_before_or_with_the_end_of`]
        expect(all.filter(({ property }) => ordering.includes(property))).toEqual([])
    })

    it('lets the copies of a later version bound the edits of an earlier one', async () => {
        const all = entailedBy(await triples(withStemma()))
        expect(statedOf(all, of('edit-b'), `${crm}P184_ends_before_or_with_the_end_of`))
            .toEqual([productionOf(all, 'second')])
        expect(statedOf(all, of('edit-a'), `${crm}P184_ends_before_or_with_the_end_of`).sort())
            .toEqual([productionOf(all, 'first'), productionOf(all, 'second')].sort())
    })

    it('lets the recording start no later than any edit of any version', async () => {
        const all = entailedBy(await triples(withStemma()))
        expect(statedOf(all, recordingIn(all), `${crm}P175_starts_before_or_with_the_start_of`).sort())
            .toEqual([of('edit-a'), of('edit-b')])
    })

    it('does not take the creation of the edition for the recording, though it realises the roll too', async () => {
        const stated = await triples(withStemma())
        const [creation] = statedOf(stated, base, `${lrmoo}R17i_was_created_by`)
        const [roll] = statedOf(stated, base, `${lrmoo}R3i_realises`)
        const all = entailedBy([...stated, { subject: creation, property: `${lrmoo}R19_created_a_realisation_of`, object: roll }])
        expect(statedOf(all, creation, `${crm}P175_starts_before_or_with_the_start_of`)).toEqual([])
    })
})
