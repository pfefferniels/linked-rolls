import { describe, expect, it } from 'vitest'
import { calibrationOf, RollCopy } from '../src/RollCopy'
import { columnsOf } from '../src/TrackCalibration'
import { welteT100 } from '../src/TrackerBar'

/**
 * Copies imported before the calibration was recorded have to keep
 * lying where they lay, since the facsimile tiles were placed by eye
 * against them.
 */
const legacyCopy = {
    type: 'RollCopy',
    id: 'legacy',
    ops: [],
    conditions: [],
    location: '',
    modifications: [],
    features: [],
    measurements: {
        holeSeparation: { value: 37.7646, unit: 'px' },
        margins: { treble: 117, bass: 54, unit: 'px' }
    }
} as unknown as RollCopy

/** How the tiles used to be cropped, per block of the tracker bar. */
const oldTileRegion = (zeroBasedFrom: number, zeroBasedTo: number) => {
    const separation = 37.7646
    return {
        from: Math.ceil((zeroBasedFrom + 2) * separation + 54),
        width: Math.ceil(separation * (zeroBasedTo - zeroBasedFrom + 1))
    }
}

describe('a copy imported before the calibration was recorded', () => {
    const calibration = calibrationOf(legacyCopy)!

    it('crops the facsimile where it used to, up to rounding', () => {
        const oldAreas = [[0, 9], [10, 89], [90, 99]]

        welteT100.areas.forEach((area, i) => {
            const columns = columnsOf(area.from, area.to, calibration)
            const old = oldTileRegion(oldAreas[i][0], oldAreas[i][1])

            expect(Math.abs(columns.from - old.from)).toBeLessThanOrEqual(1)
            expect(Math.ceil(columns.width)).toEqual(old.width)
        })
    })

    it('yields to a copy that carries its own calibration', () => {
        const measured = {
            ...legacyCopy,
            measurements: {
                ...legacyCopy.measurements,
                trackCalibration: { unit: 'px' as const, offset: 6.71627, separation: 37.7646, shift: -3 }
            }
        }
        expect(calibrationOf(measured)?.shift).toEqual(-3)
    })

    it('gives up rather than guess when there is nothing to go on', () => {
        expect(calibrationOf({ ...legacyCopy, measurements: {} })).toBeUndefined()
    })
})
