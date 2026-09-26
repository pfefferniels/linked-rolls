import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { validate } from '../src/validate'
import { assignDate, BeliefAdoption } from '../src/model/Assumption'
import { mm } from '../src/model/Quantity'
import context from '../src/spec/context.json'
import { edition } from './editionFixture'

/**
 * A premise published elsewhere, such as a bound from a catalogue of
 * premises, is named by its IRI among the premises of the inference that
 * uses it, and a belief adoption says where it was taken from. The copy
 * itself is named by the record its keeper gives it.
 */

const PREMISE = 'https://example.org/premises#advance-1mm-belief'

const adopted: BeliefAdoption = {
    type: 'beliefAdoption',
    adopted: [PREMISE],
    note: 'taken from the catalogue of premises in the state of its commit 6063ac6'
}

/** The small edition, its first copy named by its keeper and dated by its advance and an adopted premise. */
const linked = () => {
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
                    reasons: [
                        { type: 'inference', premises: ['advance-belief', PREMISE], note: 'the early advance, not used after the day the premise gives' },
                        adopted
                    ]
                }
            }
        }
    }
    return linkedEdition
}

describe('a premise adopted by its IRI, on a copy named by its keeper', () => {
    it('is valid', () => {
        expect(validate(asJsonLd(linked()))).toBe(true)
    })

    it('comes back from an export as it went in', () => {
        const back = importJsonLd(JSON.parse(JSON.stringify(asJsonLd(linked()))))
        expect(back.copies[0].sameAs).toEqual(['https://purl.stanford.edu/mf320jq4997'])
        expect(back.copies[0].production).toEqual(linked().copies[0].production)
    })

    it('reads as a CRMinf belief adoption that adopted the belief it names', async () => {
        const [node] = await jsonld.expand({
            '@context': context['@context'],
            '@id': 'https://example.org/adoption',
            '@type': 'beliefAdoption',
            ...adopted,
            type: undefined,
        }) as any[]
        expect(node['@type']).toEqual(['http://www.cidoc-crm.org/extensions/crminf/I7_Belief_Adoption'])
        expect(node['http://www.cidoc-crm.org/extensions/crminf/J6_adopted']).toEqual([{ '@id': PREMISE }])
        expect(node['http://www.cidoc-crm.org/cidoc-crm/P3_has_note']).toEqual([{ '@value': adopted.note }])
    })

    it('reads the copy as the same as its keeper\'s record', async () => {
        const [node] = await jsonld.expand({
            '@context': context['@context'],
            '@id': 'https://example.org/copy',
            '@type': 'RollCopy',
            sameAs: ['https://purl.stanford.edu/mf320jq4997'],
        }) as any[]
        expect(node['http://www.w3.org/2002/07/owl#sameAs']).toEqual([{ '@id': 'https://purl.stanford.edu/mf320jq4997' }])
    })
})
