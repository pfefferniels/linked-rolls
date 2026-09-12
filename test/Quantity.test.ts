import { describe, expect, it } from 'vitest'
import { clamp, inMillimeters, inPixels, max, min, mm, px, quantity, Quantity } from '../src/Quantity'

describe('going between a scan and the paper', () => {
    it('reads as many pixels as the resolution states to the inch', () => {
        expect(inMillimeters(px(300.25), 300.25)).toBeCloseTo(25.4, 6)
        expect(inPixels(mm(25.4), 300.25)).toBeCloseTo(300.25, 6)
    })

    /**
     * The same place read at two resolutions falls at two rows, which
     * is the reason a copy has to state the one its scan was read at.
     */
    it('puts a place further into a scan read more finely', () => {
        expect(inPixels(mm(25.4), 600)).toBeCloseTo(600, 6)
        expect(inMillimeters(px(600), 600)).toBeCloseTo(25.4, 6)
    })

    it('comes back to the row it started from', () => {
        expect(inPixels(inMillimeters(px(1234), 300.25), 300.25)).toBeCloseTo(1234, 6)
    })
})

describe('choosing between quantities', () => {
    it('keeps the unit that Math.min and Math.max drop', () => {
        const shorter: Quantity<'mm'> = min(mm(3), mm(7))
        const longer: Quantity<'mm'> = max(mm(3), mm(7))

        expect(shorter).toBe(3)
        expect(longer).toBe(7)
    })

    it('brings a value inside its bounds and leaves one that is already there', () => {
        expect(clamp(mm(12), mm(0), mm(10))).toBe(10)
        expect(clamp(mm(-5), mm(0), mm(10))).toBe(0)
        expect(clamp(mm(4), mm(0), mm(10))).toBe(4)
    })
})

/**
 * A consumer may name units the records never state, so that a drawing's
 * own coordinates travel through the same operations. They stay as
 * separate from millimetres as the stated units are from each other.
 */
describe('units outside the record vocabulary', () => {
    type Svg = Quantity<'svg'>
    const svg = quantity<'svg'>

    it('carries a unit of its own through the operations', () => {
        const width: Svg = max(svg(20), svg(14))
        expect(clamp(width, svg(0), svg(16))).toBe(16)
    })
})
