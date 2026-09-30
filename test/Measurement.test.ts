import { describe, expect, it } from 'vitest'
import jsonld from 'jsonld'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { validate } from '../src/validate'
import { assignDate, Belief, Certainty, Measurement } from '../src/model/Assumption'
import { mm } from '../src/model/Quantity'
import context from '../src/spec/context.json'
import { edition } from './editionFixture'

/**
 * A value taken off a copy by a stated procedure, such as the advance
 * of its perforator or the kind of its paper, is held on the strength
 * of that measurement, which needs no premises. What it took the value
 * from it names as used.
 */

const measured = (id: string, certainty: Certainty, note: string, used: string[]): Belief => ({
    type: 'belief',
    id,
    certainty,
    reasons: [{ type: 'measurement', note, used } satisfies Measurement]
})

/** The small edition, its first copy's paper and advance measured, its date inferred from both, its company adopted. */
const surveyed = () => {
    const measuredEdition = edition()
    const copy = measuredEdition.copies[0]
    copy.production = {
        ...copy.production,
        company: {
            name: 'De Luxe Reproducing Roll Corporation',
            sameAs: [],
            '@annotation': {
                id: 'company-annotation',
                belief: {
                    type: 'belief',
                    id: 'company-belief',
                    certainty: 'likely',
                    reasons: [{ type: 'beliefAdoption', note: 'the box label names De Luxe' }]
                }
            }
        },
        paper: {
            name: 'red-lined',
            sameAs: [],
            '@annotation': {
                id: 'paper-annotation',
                belief: measured('paper-belief', 'true', 'the colour and the lines of the paper on the scan', ['https://example.org/scan'])
            }
        },
        perforator: {
            type: 'Perforator',
            id: 'perforator-first',
            condition: {
                conditionType: 'setting',
                advance: {
                    value: mm(1.027), unit: 'mm', strength: 0.8104, n: 10910,
                    '@annotation': {
                        id: 'advance-annotation',
                        belief: measured('advance-belief', 'likely', 'the strongest period the slot lengths keep', ['https://example.org/analysis'])
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
                    certainty: 'likely',
                    reasons: [{ type: 'inference', premises: ['paper-belief', 'advance-belief'], note: 'paper and advance both point before 1910' }]
                }
            }
        }
    }
    return measuredEdition
}

describe('a value held on the strength of a measurement', () => {
    it('is valid, on the paper as on a setting of the perforator, beside an adopted company', () => {
        expect(validate(asJsonLd(surveyed()))).toBe(true)
    })

    it('comes back from an export as it went in, with the premises that name it', () => {
        const back = importJsonLd(JSON.parse(JSON.stringify(asJsonLd(surveyed()))))
        expect(back.copies[0].production).toEqual(surveyed().copies[0].production)
    })

    it('reads as a CRMsci measurement that used what it names', async () => {
        const [node] = await jsonld.expand({
            '@context': context['@context'],
            '@id': 'https://example.org/measurement',
            '@type': 'measurement',
            note: 'the strongest period the slot lengths keep',
            used: ['https://example.org/analysis']
        }) as any[]
        expect(node['@type']).toEqual(['http://www.cidoc-crm.org/extensions/crmsci/S21_Measurement'])
        expect(node['http://www.cidoc-crm.org/cidoc-crm/P16_used_specific_object']).toEqual([{ '@id': 'https://example.org/analysis' }])
        expect(node['http://www.cidoc-crm.org/cidoc-crm/P3_has_note']).toEqual([{ '@value': 'the strongest period the slot lengths keep' }])
    })
})

/** A measurement a program took, naming the program, the method it followed and the day. */
const byProgram = (): Measurement => ({
    type: 'measurement',
    note: 'the median over the pitches of held notes',
    used: ['https://example.org/scan'],
    procedure: { name: 'median pitch of held notes', sameAs: [] },
    software: [{ name: 'https://github.com/pfefferniels/condon-dates', version: '4f1c2e0' }],
    date: assignDate(new Date(2026, 8, 26))
})

/** The small edition with its first copy's advance measured by a program. */
const surveyedByProgram = () => {
    const measuredEdition = surveyed()
    const advance = measuredEdition.copies[0].production!.perforator!.condition!.advance!
    advance['@annotation']!.belief.reasons = [byProgram()]
    return measuredEdition
}

describe('a measurement a program took', () => {
    it('is valid, and comes back from an export as it went in', () => {
        expect(validate(asJsonLd(surveyedByProgram()))).toBe(true)
        const back = importJsonLd(JSON.parse(JSON.stringify(asJsonLd(surveyedByProgram()))))
        expect(back.copies[0].production).toEqual(surveyedByProgram().copies[0].production)
    })

    it('reads as a measurement that used the software, the technique and the time-span it names', async () => {
        const [node] = await jsonld.expand({
            '@context': context['@context'],
            '@id': 'https://example.org/measurement',
            '@type': 'measurement',
            procedure: { name: 'median pitch of held notes', sameAs: [] },
            software: [{ name: 'condon-dates', version: '4f1c2e0' }],
            date: { within: '2026-09-26' }
        }) as any[]
        const [software] = node['http://www.cidoc-crm.org/extensions/crmdig/L23_used_software_or_firmware']
        expect(software['http://www.w3.org/2000/01/rdf-schema#label']).toEqual([{ '@value': 'condon-dates' }])
        expect(software['http://www.w3.org/2002/07/owl#versionInfo']).toEqual([{ '@value': '4f1c2e0' }])
        const [procedure] = node['http://www.cidoc-crm.org/cidoc-crm/P33_used_specific_technique']
        expect(procedure['http://www.w3.org/2000/01/rdf-schema#label']).toEqual([{ '@value': 'median pitch of held notes' }])
        const [span] = node['http://www.cidoc-crm.org/cidoc-crm/P4_has_time-span']
        expect(span['http://www.cidoc-crm.org/cidoc-crm/P82_at_some_time_within'])
            .toEqual([{ '@value': '2026-09-26', '@type': 'http://www.w3.org/2001/XMLSchema#date' }])
    })
})
