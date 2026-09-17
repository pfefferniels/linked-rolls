import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import context from '../src/spec/context.json'
import welteT100Context from '../src/spec/welte-t100.context.json'
import welteLicenseeContext from '../src/spec/welte-licensee.context.json'
import welteT98Context from '../src/spec/welte-t98.context.json'
import { AnyFeature, GluedOn, Mark, NestedFeature, Transcription, Writing } from '../src/Feature'
import { Modification } from '../src/RollCopy'
import { assignObject } from '../src/Assumption'
import { asJsonLd } from '../src/asJsonLd'
import { importJsonLd } from '../src/importJsonLd'
import { mm, track } from '../src/Quantity'
import { copy, editionOf, hole, note, version } from './editionFixture'

/**
 * Each kind of feature is a class of its own, three of them under E25
 * Human-Made Feature and the patch under E22 Human-Made Object, so the
 * type a feature states is what holds the four apart. Every feature
 * stands in the act that brought it about: the punching, an alteration,
 * or an attachment gluing a patch on. Nothing reads off such a tree that
 * the copy bears the features, so the export states it.
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

const at = (from: number, to: number, position: number) => ({
    horizontal: { unit: 'mm' as const, from: mm(from), to: mm(to) },
    vertical: { unit: 'track' as const, from: track(position) }
})

const stamp: NestedFeature = {
    type: 'Writing',
    id: 'stamp',
    method: 'stamp',
    transcription: assignObject<Transcription>({ type: 'text', id: 'stamp-text', text: 'Welte' })
}

const writing: Writing = {
    type: 'Writing',
    id: 'date',
    ...at(20, 60, 47),
    method: 'handwriting',
    transcription: assignObject<Transcription>({ type: 'text', id: 'date-text', text: '20.I.1905' })
}

const mark: Mark = { type: 'Mark', id: 'circle', ...at(80, 90, 47), method: 'pencil' }

const patch: GluedOn = { type: 'GluedOn', id: 'patch', ...at(100, 140, 47), material: 'paper', features: [stamp] }

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

const exported = () => {
    const edition = withFeatures()
    edition.base = base
    return JSON.parse(JSON.stringify(asJsonLd(edition)))
}

interface Triple { subject: string, property: string, object: string }

const withoutBrackets = (term: string) => term.replace(/^<|>$/g, '')

const triples = async (): Promise<Triple[]> => {
    const quads = await jsonld.toRDF(exported(), {
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

describe('the kinds of feature', () => {
    it('each state a class of their own', async () => {
        const all = await triples()
        expect(classOf(all, of('perforation'))).toEqual([`${reo}Hole`])
        expect(classOf(all, of('date'))).toEqual([`${reo}Writing`])
        expect(classOf(all, of('circle'))).toEqual([`${reo}Mark`])
        expect(classOf(all, of('patch'))).toEqual([`${reo}GluedOn`])
    })

    it('leave the making of a trace to a property of its own', async () => {
        const all = await triples()
        expect(statedOf(all, of('date'), `${reo}method`)).toEqual([`${reot}handwriting`])
        expect(statedOf(all, of('circle'), `${reo}method`)).toEqual([`${reot}pencil`])
        expect(statedOf(all, of('patch'), `${crm}P45_consists_of`)).toEqual([`${reot}paper`])
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
        expect(statedOf(all, theOne(all, `${crm}E12_Production`), `${crm}P108_has_produced`).sort())
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
        expect(statedOf(all, production[0], `${crm}P108_has_produced`)).toEqual([of('perforation')])
    })
})

describe('what the export derives from the acts', () => {
    it('states the copy as bearing every feature its acts brought about', async () => {
        const all = await triples()
        expect(statedOf(all, of('first'), `${crm}P56_bears_feature`).sort())
            .toEqual([of('circle'), of('date'), of('perforation')])
    })

    it('states a patch as a part of the copy, P56 taking only features', async () => {
        const all = await triples()
        expect(statedOf(all, of('first'), `${crm}P46_is_composed_of`)).toEqual([of('patch')])
        expect(statedOf(all, of('first'), `${crm}P56_bears_feature`)).not.toContain(of('patch'))
    })

    it('states a patch as bearing the features glued onto it', async () => {
        const all = await triples()
        expect(statedOf(all, of('patch'), `${crm}P56_bears_feature`)).toEqual([of('stamp')])
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
})
