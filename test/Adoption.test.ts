import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { validate } from '../src/validate'
import { assignDate } from '../src/model/Assumption'
import { mm } from '../src/model/Quantity'
import context from '../src/spec/context.json'
import { edition } from './editionFixture'

/**
 * Two ways a belief held outside the edition enters it.
 *
 * A belief of the editor's own, published elsewhere under an IRI, such as a
 * bound from a catalogue of premises the editor keeps, is named by that IRI
 * among the premises of the inference that uses it; the inference says by
 * `used` in which state it read the document that holds it. Nothing is
 * adopted, since the belief is already the editor's.
 *
 * Someone else's belief is adopted. The adoption concludes a belief of the
 * edition's own about the same statement, here the date of a copy, and an
 * inference that relies on it names that belief, not the adopted one.
 *
 * The copy itself is named by the record its keeper gives it.
 */

const PREMISE = 'https://example.org/premises#advance-1mm-belief'
const PREMISES_AT = 'https://example.org/premises/blob/6063ac6/premises.jsonld'
const OTHERS = 'https://example.org/another-edition#date-belief'

const CRMINF = 'http://www.cidoc-crm.org/extensions/crminf/'
const CRM = 'http://www.cidoc-crm.org/cidoc-crm/'
const BASE = 'https://example.org/edition/'

/** The small edition, its first copy named by its keeper and dated by its advance and a premise of the editor's own. */
const inferred = () => {
    const linkedEdition = edition()
    const copy = linkedEdition.copies[0]
    copy.sameAs = ['https://purl.stanford.edu/mf320jq4997']
    copy.production = {
        ...copy.production,
        perforator: {
            type: 'Perforator',
            id: 'perforator-first',
            condition: {
                conditionType: 'setting',
                advance: {
                    value: mm(1.027), unit: 'mm',
                    '@annotation': {
                        id: 'advance-annotation',
                        belief: {
                            type: 'belief',
                            id: 'advance-belief',
                            certainty: 'likely',
                            reasons: [{ type: 'measurement', note: 'the strongest period the slot lengths keep' }]
                        }
                    }
                }
            }
        },
        date: {
            ...assignDate(new Date(1909, 0, 18)),
            '@annotation': {
                id: 'date-annotation',
                belief: {
                    type: 'belief',
                    id: 'date-belief',
                    certainty: 'true',
                    reasons: [{
                        type: 'inference',
                        premises: ['advance-belief', PREMISE],
                        used: [PREMISES_AT],
                        note: 'the early advance, not used after the day the premise gives'
                    }]
                }
            }
        }
    }
    return linkedEdition
}

/** The same copy, its date adopted from someone else and its advance argued from that date. */
const adopted = () => {
    const linkedEdition = edition()
    const copy = linkedEdition.copies[0]
    copy.production = {
        ...copy.production,
        date: {
            ...assignDate(new Date(1910, 9, 28)),
            '@annotation': {
                id: 'date-annotation',
                belief: {
                    type: 'belief',
                    id: 'date-belief',
                    certainty: 'likely',
                    reasons: [{
                        type: 'beliefAdoption',
                        adopted: [OTHERS],
                        note: 'the punch date as another edition reads it, in the state of its commit 6063ac6'
                    }]
                }
            }
        },
        perforator: {
            type: 'Perforator',
            id: 'perforator-first',
            condition: {
                conditionType: 'setting',
                advance: {
                    value: mm(1.02), unit: 'mm',
                    '@annotation': {
                        id: 'advance-annotation',
                        belief: {
                            type: 'belief',
                            id: 'advance-belief',
                            certainty: 'possible',
                            reasons: [
                                { type: 'measurement', note: 'the strongest period the slot lengths keep, found weakly' },
                                { type: 'inference', premises: ['date-belief'], note: 'the date speaks against the early advance' }
                            ]
                        }
                    }
                }
            }
        }
    }
    return linkedEdition
}

/**
 * The nodes of a copy's production as JSON-LD reads them. jsonld.js knows
 * no JSON-LD-star, so each annotation's belief is lifted out beside the
 * copy, where its reasons expand as they would in place.
 */
const expanded = async (linkedEdition: ReturnType<typeof edition>) => {
    const beliefs: object[] = []
    const lift = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(lift)
        if (!value || typeof value !== 'object') return value
        const out: Record<string, unknown> = {}
        for (const [key, inner] of Object.entries(value)) {
            if (key === '@annotation') beliefs.push(lift((inner as { belief: object }).belief) as object)
            else out[key] = lift(inner)
        }
        return out
    }
    const { copies } = asJsonLd(linkedEdition) as { copies: { production: object, sameAs?: string[] }[] }
    const production = lift(copies[0].production) as object
    const nodes = await jsonld.expand({
        '@context': [context['@context'], { '@base': BASE }],
        '@graph': [production, ...beliefs],
    }) as Record<string, unknown>[]
    const all: Record<string, unknown>[] = []
    const collect = (value: unknown) => {
        if (Array.isArray(value)) value.forEach(collect)
        else if (value && typeof value === 'object') {
            if ('@type' in value) all.push(value as Record<string, unknown>)
            Object.values(value).forEach(collect)
        }
    }
    collect(nodes)
    return (type: string) => all.filter(node => (node['@type'] as string[]).includes(type))
}

describe('a premise of the editor\'s own, named by its IRI', () => {
    it('is valid', () => {
        expect(validate(asJsonLd(inferred()))).toBe(true)
    })

    it('comes back from an export as it went in', () => {
        const back = importJsonLd(JSON.parse(JSON.stringify(asJsonLd(inferred()))))
        expect(back.copies[0].sameAs).toEqual(['https://purl.stanford.edu/mf320jq4997'])
        expect(back.copies[0].production).toEqual(inferred().copies[0].production)
    })

    it('reads as an inference that used the premise and the document in the state it was read', async () => {
        const [inference] = (await expanded(inferred()))(CRMINF + 'I5_Inference_Making')
        expect(inference[CRMINF + 'J1_used_as_premise']).toEqual([{ '@id': BASE + 'advance-belief' }, { '@id': PREMISE }])
        expect(inference[CRM + 'P16_used_specific_object']).toEqual([{ '@id': PREMISES_AT }])
        expect((await expanded(inferred()))(CRMINF + 'I7_Belief_Adoption')).toEqual([])
    })
})

describe('a belief of someone else\'s, adopted', () => {
    it('is valid', () => {
        expect(validate(asJsonLd(adopted()))).toBe(true)
    })

    it('comes back from an export as it went in', () => {
        const back = importJsonLd(JSON.parse(JSON.stringify(asJsonLd(adopted()))))
        expect(back.copies[0].production).toEqual(adopted().copies[0].production)
    })

    it('concludes a belief of the edition\'s own, which an inference then uses in place of the adopted one', async () => {
        const nodes = await expanded(adopted())
        const [adoption] = nodes(CRMINF + 'I7_Belief_Adoption')
        expect(adoption[CRMINF + 'J6_adopted']).toEqual([{ '@id': OTHERS }])
        const [inference] = nodes(CRMINF + 'I5_Inference_Making')
        expect(inference[CRMINF + 'J1_used_as_premise']).toEqual([{ '@id': BASE + 'date-belief' }])
    })
})

describe('a copy named by its keeper', () => {
    it('reads as the same as its keeper\'s record', async () => {
        const [node] = await jsonld.expand({
            '@context': context['@context'],
            '@id': 'https://example.org/copy',
            '@type': 'RollCopy',
            sameAs: ['https://purl.stanford.edu/mf320jq4997'],
        }) as Record<string, unknown>[]
        expect(node['http://www.w3.org/2002/07/owl#sameAs']).toEqual([{ '@id': 'https://purl.stanford.edu/mf320jq4997' }])
    })
})
