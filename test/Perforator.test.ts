import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { Parser } from 'n3'
import { asJsonLd } from '../src/io/asJsonLd'
import { importJsonLd } from '../src/io/importJsonLd'
import { migrate } from '../src/io/migrate'
import { validate } from '../src/validate'
import { Certainty } from '../src/model/Assumption'
import { DriveId, drives, Perforator } from '../src/model/Perforator'
import { punchDiameterOf, RollCopy } from '../src/model/RollCopy'
import { mm } from '../src/model/Quantity'
import { nameOf } from '../src/model/vocabulary'
import context from '../src/spec/context.json'
import { edition } from './editionFixture'

const ramHead: DriveId = 'https://w3id.org/reo/type/drive/ram-head'
const asynchronous: DriveId = 'https://w3id.org/reo/type/drive/asynchronous'

const believed = (certainty: Certainty, note: string) => ({
    '@annotation': {
        id: `annotation-${certainty}`,
        belief: {
            type: 'belief' as const,
            id: `belief-${certainty}`,
            certainty,
            reasons: [{ type: 'inference' as const, premises: [], used: ['analysis-file'], note }]
        }
    }
})

/** A perforator as the survey of the Stanford rolls reads one, its advance found only weakly. */
const surveyed = (): Perforator => ({
    type: 'Perforator',
    id: 'perforator-first',
    drive: { id: ramHead },
    condition: {
        conditionType: 'setting',
        punchDiameter: { value: mm(1.86), unit: 'mm' },
        chainPitch: {
            value: mm(2.5093), unit: 'mm', slot: mm(1.8777), bridge: mm(0.633), n: 441,
            ...believed('likely', 'pitch.py, median over held notes')
        },
        advance: {
            value: mm(0.496), unit: 'mm', strength: 0.4085, n: 22329,
            ...believed('possible', 'step.py, the strongest period of the slot lengths')
        }
    }
})

const withPerforator = (perforator: Perforator) => {
    const perforated = edition()
    perforated.copies[0].production = { ...perforated.copies[0].production, perforator }
    return perforated
}

/** The small edition as a release before the move wrote it, the first copy measured with a punch diameter. */
const writtenBefore = (diameter: number, id = 'first') => {
    const written = JSON.parse(JSON.stringify(asJsonLd(edition())))
    written.copies[0]['@id'] = id
    written.copies[0].measurements = { punchDiameter: { value: diameter, unit: 'mm' } }
    return written
}

const firstCopyOf = (json: unknown): RollCopy => importJsonLd(json).copies[0]

describe('the perforator a copy was punched on', () => {
    it('reads a punch diameter measured before as the setting of the perforator', () => {
        const copy = firstCopyOf(writtenBefore(2.2))
        expect(copy.measurements).toEqual({})
        expect(copy.production?.perforator).toEqual({
            type: 'Perforator',
            id: 'perforator_first',
            condition: { conditionType: 'setting', punchDiameter: { value: 2.2, unit: 'mm' } }
        })
    })

    it('leaves out a diameter of -1, which stood for one not measured', () => {
        const copy = firstCopyOf(writtenBefore(-1))
        expect(copy.measurements).toEqual({})
        expect(copy.production?.perforator).toBeUndefined()
    })

    it('names the perforator after the copy, whether or not its id was prefixed', () => {
        expect(firstCopyOf(writtenBefore(2.2, 'copy/first')).production?.perforator?.id).toBe('perforator_first')
    })

    it('migrates a file twice to the same result', () => {
        const once = migrate(writtenBefore(2.2))
        expect(migrate(once)).toEqual(once)
    })

    // A stored edition is patched by hand and diffed, so the order of its keys is part of the result.
    it('writes a migrated file the way its export would be written again', () => {
        const exported = JSON.stringify(asJsonLd(importJsonLd(writtenBefore(2.2))))
        expect(JSON.stringify(asJsonLd(importJsonLd(JSON.parse(exported))))).toBe(exported)
    })

    it('carries the setting and the beliefs about it through an export and back', () => {
        const exported = asJsonLd(withPerforator(surveyed()))
        expect(validate(exported)).toBe(true)
        expect(importJsonLd(JSON.parse(JSON.stringify(exported))).copies[0].production?.perforator).toEqual(surveyed())
    })

    it('turns down an advance that states no unit', () => {
        const exported = JSON.parse(JSON.stringify(asJsonLd(withPerforator(surveyed()))))
        delete exported.copies[0].production.perforator.condition.advance.unit
        expect(validate(exported)).toBe(false)
    })

    it('takes the punch diameter from the setting only where it is held true or likely', () => {
        const perforator = surveyed()
        expect(punchDiameterOf({ production: { perforator } })).toBe(1.86)

        perforator.condition!.punchDiameter = { value: mm(1.86), unit: 'mm', ...believed('unlikely', 'a torn hole') }
        expect(punchDiameterOf({ production: { perforator } })).toBeUndefined()
    })

    it('gives a perforator that stated no type one', () => {
        const written = JSON.parse(JSON.stringify(asJsonLd(withPerforator(surveyed()))))
        delete written.copies[0].production.perforator['@type']
        expect(firstCopyOf(written).production?.perforator).toEqual(surveyed())
    })
})

describe('the drive of a perforator', () => {
    it('quotes a doubted drive rather than stating it, and puts it back on import', () => {
        const doubted = { ...surveyed(), drive: { id: asynchronous, ...believed('unlikely', 'rows that may stagger') } }
        const exported = asJsonLd(withPerforator(doubted))
        expect(validate(exported)).toBe(true)
        expect(exported.copies[0].production.perforator.drive).toBeUndefined()
        expect(exported['@included']).toContainEqual(expect.objectContaining({
            '@id': { '@id': 'perforator-first', drive: { '@id': asynchronous } }
        }))
        // The quoted statement stands at the top of the document, outside the perforator's scoped context.
        expect(Object.hasOwn(context['@context'], 'drive')).toBe(true)
        expect(importJsonLd(JSON.parse(JSON.stringify(exported))).copies[0].production?.perforator).toEqual(doubted)
    })

    it('turns down a drive the vocabulary does not declare', () => {
        const exported = JSON.parse(JSON.stringify(asJsonLd(withPerforator(surveyed()))))
        exported.copies[0].production.perforator.drive = { '@id': 'https://w3id.org/reo/type/staggering' }
        expect(validate(exported)).toBe(false)
    })

    it('offers the drives types.ttl declares, under their labels', () => {
        const quads = new Parser().parse(readFileSync('ontology/types.ttl', 'utf-8'))
        const labelOf = (subject: string) => quads.find(quad =>
            quad.subject.value === subject && quad.predicate.value === 'http://www.w3.org/2000/01/rdf-schema#label')?.object.value
        const declared = [...new Set(quads
            .map(quad => quad.subject.value)
            .filter(subject => subject.startsWith('https://w3id.org/reo/type/drive/')))]

        expect(drives.map(drive => drive.id).sort()).toEqual(declared.sort())
        expect(drives.map(drive => labelOf(drive.id))).toEqual(drives.map(drive => drive.name))
        expect(nameOf({ id: asynchronous })).toBe('asynchronous')
    })
})

describe('the punching pattern each hole once stated', () => {
    const writtenWith = (pattern: string, where: 'production' | 'alteration') => {
        const written = JSON.parse(JSON.stringify(asJsonLd(edition())))
        const [staggered, ...rest] = written.copies[0].production.produced
        const marked = { ...staggered, pattern }
        if (where === 'production') written.copies[0].production.produced = [marked, ...rest]
        else {
            written.copies[0].production.produced = rest
            written.copies[0].modifications = [{ '@type': 'Alteration', purpose: 'repair', produced: [marked] }]
        }
        return written
    }

    const holesOf = (copy: RollCopy) => [
        ...copy.production?.produced ?? [],
        ...copy.modifications.flatMap(act => 'produced' in act ? act.produced ?? [] : [])
    ]

    it('reads staggering holes the copy was punched with as an asynchronous perforator', () => {
        const copy = firstCopyOf(writtenWith('staggering', 'production'))
        expect(copy.production?.perforator).toEqual({ type: 'Perforator', id: 'perforator_first', drive: { id: asynchronous } })
        expect(holesOf(copy).filter(hole => 'pattern' in hole)).toEqual([])
    })

    it('says nothing of the machine for a hole a later act punched, or for the bridges', () => {
        expect(firstCopyOf(writtenWith('staggering', 'alteration')).production?.perforator).toBeUndefined()
        expect(firstCopyOf(writtenWith('regular', 'production')).production?.perforator).toBeUndefined()
        expect(firstCopyOf(writtenWith('accelerating', 'production')).production?.perforator).toBeUndefined()
    })

    it('migrates a file twice to the same result', () => {
        const once = migrate(writtenWith('staggering', 'production'))
        expect(migrate(once)).toEqual(once)
    })
})
