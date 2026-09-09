import { describe, expect, it } from 'vitest'
import { importJsonLd } from '../src/importJsonLd';
import * as path from 'path'
import { readFileSync } from 'fs';
import { asJsonLd } from '../src/asJsonLd';
import { assignObject } from '../src/Assumption';
import { PaperSpeed } from '../src/RollCopy';
import { systemOf } from '../src/TrackerBar';
import { welteLicensee } from '../src/systems/welteLicensee/bar';
import { welteT98 } from '../src/systems/welteT98/bar';
import { feetPerMinute } from '../src/Quantity';

const edition = () =>
    importJsonLd(JSON.parse(readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8')))

describe('Export', () => {
    it('serialises an edition', () => {
        const serialized = asJsonLd(edition())
        expect(serialized['@type']).toEqual('Edition')
        expect(serialized.copies).toHaveLength(3)
    })

    it('leaves the shared context at the top and no system there', () => {
        expect(asJsonLd(edition())['@context']).toEqual([
            'https://w3id.org/reo/context.jsonld',
            { '@base': edition().base }
        ])
    })

    /**
     * Each system's context defines `expressionType` with its own
     * vocabulary, so two of them in one array would leave every
     * expression type in the document reading as whichever came last.
     */
    it('gives each version the context of its own system', () => {
        const exported = asJsonLd(edition())
        exported.versions.forEach((version: any) =>
            expect(version['@context']).toEqual('https://w3id.org/reo/welte-t100/context.jsonld'))
    })

    it('keeps a green version and a red one apart in one edition', () => {
        const red = edition()
        const green = {
            ...red,
            versions: [
                red.versions[0],
                { ...red.versions[1], system: systemOf(welteT98) }
            ]
        }

        const contexts = asJsonLd(green).versions.map((version: any) => version['@context'])
        expect(contexts).toEqual([
            'https://w3id.org/reo/welte-t100/context.jsonld',
            'https://w3id.org/reo/welte-green/context.jsonld'
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

    it('carries the system and the speed a copy was cut for, and the scale of its alignment only in the features', () => {
        const withLicensee = edition()
        withLicensee.copies[0].production = {
            ...withLicensee.copies[0].production,
            system: systemOf(welteLicensee),
            speed: assignObject<PaperSpeed>({ value: feetPerMinute(8), unit: 'ft/min' })
        }
        withLicensee.copies[0].measurements.scale = 1.3

        const exported = asJsonLd(withLicensee)
        const production = exported.copies[0].production
        expect(production.system).toEqual({
            '@id': 'https://w3id.org/reo/type/system/welte-licensee',
            name: welteLicensee.name,
            sameAs: []
        })
        expect(production.speed).toEqual({ value: 8, unit: 'ft/min' })
        expect(exported.copies[0].measurements.scale).toBe(1.3)

        const reimported = importJsonLd(JSON.parse(JSON.stringify(exported)))
        expect(reimported.copies[0].production?.speed).toEqual({ value: 8, unit: 'ft/min' })
        expect(reimported.copies[0].production?.system?.id).toEqual('https://w3id.org/reo/type/system/welte-licensee')
        expect(reimported.copies[0].measurements.scale).toBe(1.3)
    })
})
