import { describe, expect, it } from 'vitest'
import { welteT100 } from '../src/TrackerBar'
import { columnOf, columnsOf, trackAt, TrackCalibration } from '../src/TrackCalibration'

describe('WelteT100 tracker bar', () => {
    it('reads 100 positions and nothing outside them', () => {
        expect(welteT100.roleOf(0)).toBeUndefined()
        expect(welteT100.roleOf(101)).toBeUndefined()
        expect(welteT100.meaningOf(0)).toBeUndefined()
        expect(welteT100.meaningOf(101)).toBeUndefined()
    })

    it('puts the block boundaries where Hagmann does', () => {
        expect(welteT100.roleOf(1)).toEqual('bass-expression')
        expect(welteT100.roleOf(10)).toEqual('bass-expression')
        expect(welteT100.roleOf(11)).toEqual('note')
        expect(welteT100.roleOf(90)).toEqual('note')
        expect(welteT100.roleOf(91)).toEqual('treble-expression')
        expect(welteT100.roleOf(100)).toEqual('treble-expression')
    })

    it('spans the T100 compass from C1 to g⁴', () => {
        expect(welteT100.meaningOf(11)).toEqual({ type: 'note', pitch: 24 })
        expect(welteT100.meaningOf(90)).toEqual({ type: 'note', pitch: 103 })
    })

    it('mirrors the expression valves around the note block', () => {
        expect(welteT100.meaningOf(9)).toEqual({
            type: 'expression', expressionType: 'MotorOff', scope: 'bass'
        })
        expect(welteT100.meaningOf(95)).toEqual({
            type: 'expression', expressionType: 'ForzandoOn', scope: 'treble'
        })
        expect(welteT100.meaningOf(5)).toEqual({
            type: 'expression', expressionType: 'ForzandoOff', scope: 'bass'
        })
    })

    it('covers every position exactly once', () => {
        const tracks = Array.from({ length: 100 }, (_, i) => i + 1)
        expect(tracks.filter(t => !welteT100.meaningOf(t))).toEqual([])

        const areaSizes = welteT100.areas.map(a => a.to - a.from + 1)
        expect(areaSizes).toEqual([10, 80, 10])
    })

    it('knows where the rewind perforation runs', () => {
        expect(welteT100.rewindTrack).toEqual(91)
    })
})

describe('track calibration', () => {
    /**
     * Taken from the analysis of the Stanford scan mf320jq4997, whose
     * rewind chain sits on the scanner's track 94 and so needs a shift
     * of -3 to reach the bar's track 91.
     */
    const calibration: TrackCalibration = {
        unit: 'px',
        offset: 6.71627,
        separation: 37.7646,
        shift: -3
    }

    it('places a track where the scan has its column', () => {
        // mean centroid of the holes measured on the scanner's track 94
        expect(columnOf(91, calibration)).toBeCloseTo(3556.6, 0)
        // ... and on its track 24, the lowest note used on that roll
        expect(columnOf(21, calibration)).toBeCloseTo(913.1, 0)
    })

    it('inverts', () => {
        const tracks = Array.from({ length: 100 }, (_, i) => i + 1)
        tracks.forEach(track => {
            expect(trackAt(columnOf(track, calibration), calibration)).toBeCloseTo(track, 9)
        })
    })

    it('spans a run of tracks from outer edge to outer edge', () => {
        const span = columnsOf(11, 13, calibration)
        expect(span.width).toBeCloseTo(3 * calibration.separation, 9)
        expect(span.from).toBeCloseTo(columnOf(11, calibration) - calibration.separation / 2, 9)
    })

    it('does not care which way round the run is given', () => {
        expect(columnsOf(13, 11, calibration)).toEqual(columnsOf(11, 13, calibration))
    })
})
