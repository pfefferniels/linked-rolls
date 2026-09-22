import { describe, expect, it } from 'vitest'
import { asJsonLd } from '../src/asJsonLd'
import { importJsonLd } from '../src/importJsonLd'
import { migrate } from '../src/migrate'
import { validate } from '../src/validate'
import { Certainty } from '../src/Assumption'
import { Perforator } from '../src/Perforator'
import { punchDiameterOf, RollCopy } from '../src/RollCopy'
import { mm } from '../src/Quantity'
import { edition } from './editionFixture'

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
    id: 'perforator-first',
    condition: {
        type: 'ConditionState',
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
            id: 'perforator_first',
            condition: { type: 'ConditionState', conditionType: 'setting', punchDiameter: { value: 2.2, unit: 'mm' } }
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
})
