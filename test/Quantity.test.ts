import { describe, expect, it } from 'vitest'
import { inMillimeters, inPixels, mm, px } from '../src/Quantity'

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
