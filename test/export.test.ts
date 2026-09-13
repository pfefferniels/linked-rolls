import { describe, expect, it } from 'vitest'
import { importJsonLd } from '../src/importJsonLd';
import * as path from 'path'
import { readFileSync } from 'fs';
import { asJsonLd } from '../src/asJsonLd';
import { assignObject, assignValue, Certainty, valueOf } from '../src/Assumption';
import { edition as smallEdition } from './editionFixture';
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

    /**
     * One rule for every entity of the edition: its IRI is its id under the
     * base. Documents written before that was so named a copy `copy/<id>`,
     * and are read as though they had not.
     */
    it('names a copy by its id alone, and reads one that was prefixed', () => {
        const exported = asJsonLd(edition())
        const ids = exported.copies.map((copy: any) => copy['@id'])
        expect(ids.some((id: string) => id.startsWith('copy/'))).toBe(false)

        const prefixed = {
            ...exported,
            copies: exported.copies.map((copy: any) => ({ ...copy, '@id': `copy/${copy['@id']}` }))
        }
        expect(importJsonLd(JSON.parse(JSON.stringify(prefixed))).copies.map(copy => copy.id))
            .toEqual(ids)
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

    describe('beliefs about references', () => {
        const annotation = (certainty: Certainty) => ({
            id: `annotation-${certainty}`,
            belief: { type: 'belief' as const, id: `belief-${certainty}`, certainty, reasons: [] }
        })

        const exportedAnnotation = (certainty: Certainty) => ({
            '@id': `annotation-${certainty}`,
            belief: { '@type': 'belief', '@id': `belief-${certainty}`, certainty, reasons: [] }
        })

        /** Version B held unlikely to derive from A, and one carrier of the note held possible. */
        const doubted = () => {
            const doubting = smallEdition()
            const [a, b] = doubting.versions
            b.basedOn = [{ ...b.basedOn![0], '@annotation': annotation('unlikely') }]
            const note = a.edits![0].insert![0]
            note.carriers[1] = { ...note.carriers[1], '@annotation': annotation('possible') }
            return doubting
        }

        it('quotes a reference held below likely instead of stating it', () => {
            const exported = asJsonLd(doubted())
            const { '@id': _annotation, ...possible } = exportedAnnotation('possible')
            const { '@id': _other, ...unlikely } = exportedAnnotation('unlikely')

            expect(exported.versions[1].basedOn).toEqual([])
            expect(exported.versions[0].edits[0].insert[0].carriers).toEqual([{ '@id': 'hole-note' }])
            expect(exported['@included']).toHaveLength(2)
            expect(exported['@included']).toContainEqual({
                '@id': { '@id': 'note', carriers: [{ '@id': 'hole-note-second' }] },
                annotation: 'annotation-possible',
                ...possible
            })
            expect(exported['@included']).toContainEqual({
                '@id': { '@id': 'B', basedOn: [{ '@id': 'A' }] },
                annotation: 'annotation-unlikely',
                ...unlikely
            })
        })

        it('states a reference held likely, with its belief on it', () => {
            const held = smallEdition()
            held.versions[1].basedOn = [{ ...held.versions[1].basedOn![0], '@annotation': annotation('likely') }]

            const exported = asJsonLd(held)
            expect(exported.versions[1].basedOn).toEqual([{ '@id': 'A', '@annotation': exportedAnnotation('likely') }])
            expect(exported).not.toHaveProperty('@included')
        })

        it('reads the quoted references back where they were stated', () => {
            const doubting = doubted()
            const back = importJsonLd(JSON.parse(JSON.stringify(asJsonLd(doubting))))
            expect(back.versions).toEqual(doubting.versions)
        })

        it('leaves a doubted value annotated where it stands', () => {
            const dated = smallEdition()
            dated.roll.recordingEvent.date = { ...dated.roll.recordingEvent.date, '@annotation': annotation('possible') }
            expect(asJsonLd(dated).roll.recordingEvent.date['@annotation']).toEqual(exportedAnnotation('possible'))
        })
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

    it('carries the siglum of a copy there and back, and none where a copy has none', () => {
        const named = edition()
        named.copies[0].siglum = 'W1'

        const exported = asJsonLd(named)
        expect(exported.copies[0].siglum).toBe('W1')
        expect(exported.copies[1]).not.toHaveProperty('siglum')
        expect(importJsonLd(JSON.parse(JSON.stringify(exported))).copies.map(copy => copy.siglum))
            .toEqual(['W1', undefined, undefined])
    })
})

/**
 * The transfer from the red issue to the green was a person's work, and
 * the edits carry out the rule he followed. Lawson (Pianola Journal 20,
 * p. 26) names Kähle as the man who corrected second masters for the
 * green system.
 */
describe('the act that made a version', () => {
    const transferred = () => {
        const edition = importJsonLd(JSON.parse(readFileSync(
            path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8')))
        edition.versions[1].system = systemOf(welteT98)
        edition.versions[1].creation = {
            actor: assignObject({ name: 'Kähle', sameAs: [] }),
            date: assignValue(new Date(1927, 0, 1)),
            procedure: {
                id: 'https://w3id.org/reo/type/procedure/system-transfer',
                name: 'transfer to another reproducing system',
                sameAs: []
            }
        }
        return edition
    }

    it('survives an export and a re-import', () => {
        const exported = asJsonLd(transferred())
        const back = importJsonLd(JSON.parse(JSON.stringify(exported)))
        const made = back.versions[1].creation!

        expect(made.actor?.name).toBe('Kähle')
        expect(made.procedure?.id).toBe('https://w3id.org/reo/type/procedure/system-transfer')
        expect(valueOf(made.date!).getFullYear()).toBe(1927)
    })

    it('carries the green version under its own vocabulary', () => {
        const exported = asJsonLd(transferred())
        expect(exported.versions[1]['@context']).toBe('https://w3id.org/reo/welte-green/context.jsonld')
        expect(exported.versions[1].creation.procedure['@id'])
            .toBe('https://w3id.org/reo/type/procedure/system-transfer')
    })
})
