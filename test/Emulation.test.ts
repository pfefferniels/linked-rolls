import { describe, expect, it } from 'vitest'
import { paperAt, paperSeconds, WELTE_SPOOL } from 'welte-t100-emulator'
import { Emulation } from '../src/Emulation';
import { atConstantSpeed, SPENCER_FEET_PER_MINUTE } from '../src/RollCopy';

describe('the time axis', () => {
    it('is the take-up spool', () => {
        const emulation = new Emulation()
        expect(emulation.options.spool).toEqual(WELTE_SPOOL)
        expect(emulation.secondsAt(1450)).toEqual(paperSeconds(WELTE_SPOOL, 145))
    })

    it('takes 30 s over the first 1.45 m of paper, as Gottschewski checks it', () => {
        // Die Interpretation als Kunstwerk, p. 137
        expect(new Emulation().secondsAt(1450)).toBeCloseTo(30, 1)
    })

    it('can be walked back from time to place', () => {
        const emulation = new Emulation()
        expect(paperAt(emulation.options.spool, emulation.secondsAt(120))).toBeCloseTo(12, 9)
    })

    it('is a constant speed for a scanned roll', () => {
        const placeAt = atConstantSpeed(SPENCER_FEET_PER_MINUTE)
        expect(placeAt(60)).toBeCloseTo(8.3 * 304.8, 9)
        expect(placeAt(30) * 2).toBeCloseTo(placeAt(60), 9)
    })
})
