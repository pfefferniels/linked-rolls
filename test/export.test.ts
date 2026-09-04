import { describe, expect, it } from 'vitest'
import { importJsonLd } from '../src/importJsonLd';
import * as path from 'path'
import { readFileSync } from 'fs';
import { asJsonLd } from '../src/asJsonLd';

const edition = () =>
    importJsonLd(JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'roll.json'), 'utf8')))

describe('Export', () => {
    it('serialises an edition', () => {
        const serialized = asJsonLd(edition())
        expect(serialized['@type']).toEqual('Edition')
        expect(serialized.copies).toHaveLength(3)
    })

    it('adds the context of the roll system', () => {
        expect(asJsonLd(edition())['@context']).toEqual([
            'https://w3id.org/reo/context.jsonld',
            'https://w3id.org/reo/welte-t100/context.jsonld',
            { '@base': edition().base }
        ])
    })

    it('reads its own export back unchanged', () => {
        const exported = asJsonLd(edition())
        expect(asJsonLd(importJsonLd(JSON.parse(JSON.stringify(exported))))).toEqual(exported)
    })

    it('types annotated dates as xsd:date and reads them back', () => {
        const exported = asJsonLd(edition())
        expect(exported.roll.recordingEvent.date).toMatchObject({
            '@value': '1905-01-20',
            '@type': 'xsd:date',
        })

        const reimported = importJsonLd(exported)
        const date = reimported.roll.recordingEvent.date
        expect(date['@value']).toBeInstanceOf(Date)
        expect(date).not.toHaveProperty('type')
        expect(date).not.toHaveProperty('@type')
    })
})
