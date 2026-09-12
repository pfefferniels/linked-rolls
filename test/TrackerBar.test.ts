import { describe, expect, it } from 'vitest'
import { welteT100 } from '../src/systems/welteT100/bar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { welteT98 } from '../src/systems/welteT98/bar'
import { translationBetween } from '../src/TrackerBar'
import { columnOf, columnsOf, trackAt, TrackCalibration } from '../src/TrackCalibration'
import { px, track } from '../src/Quantity'

describe('WelteT100 tracker bar', () => {
    it('reads 100 positions and nothing outside them', () => {
        expect(welteT100.roleOf(track(0))).toBeUndefined()
        expect(welteT100.roleOf(track(101))).toBeUndefined()
        expect(welteT100.meaningOf(track(0))).toBeUndefined()
        expect(welteT100.meaningOf(track(101))).toBeUndefined()
    })

    it('puts the block boundaries where Hagmann does', () => {
        expect(welteT100.roleOf(track(1))).toEqual('bass-expression')
        expect(welteT100.roleOf(track(10))).toEqual('bass-expression')
        expect(welteT100.roleOf(track(11))).toEqual('note')
        expect(welteT100.roleOf(track(90))).toEqual('note')
        expect(welteT100.roleOf(track(91))).toEqual('treble-expression')
        expect(welteT100.roleOf(track(100))).toEqual('treble-expression')
    })

    it('spans the T100 compass from C1 to g⁴', () => {
        expect(welteT100.meaningOf(track(11))).toEqual({ type: 'note', pitch: 24 })
        expect(welteT100.meaningOf(track(90))).toEqual({ type: 'note', pitch: 103 })
    })

    it('mirrors the expression valves around the note block', () => {
        expect(welteT100.meaningOf(track(9))).toEqual({
            type: 'expression', expressionType: 'MotorOff', scope: 'bass'
        })
        expect(welteT100.meaningOf(track(95))).toEqual({
            type: 'expression', expressionType: 'ForzandoOn', scope: 'treble'
        })
        expect(welteT100.meaningOf(track(5))).toEqual({
            type: 'expression', expressionType: 'ForzandoOff', scope: 'bass'
        })
    })

    it('covers every position exactly once', () => {
        const tracks = Array.from({ length: 100 }, (_, i) => track(i + 1))
        expect(tracks.filter(t => !welteT100.meaningOf(t))).toEqual([])

        const areaSizes = welteT100.areas.map(a => a.to - a.from + 1)
        expect(areaSizes).toEqual([10, 80, 10])
    })

    it('knows where the rewind perforation runs', () => {
        expect(welteT100.rewindTrack).toEqual(91)
    })

    it('runs its rolls at three metres a minute, while the Licensee states no speed', () => {
        expect(welteT100.paperSpeed).toEqual({ value: 3, unit: 'm/min' })
        expect(welteLicensee.paperSpeed).toBeUndefined()
    })
})

describe('Welte Licensee tracker bar', () => {
    it('reads 98 positions, the notes from 9 to 88', () => {
        expect(welteLicensee.trackCount).toBe(98)
        expect(welteLicensee.areas.map(a => a.to - a.from + 1)).toEqual([8, 80, 10])
        expect(welteLicensee.meaningOf(track(9))).toEqual({ type: 'note', pitch: 24 })
        expect(welteLicensee.meaningOf(track(88))).toEqual({ type: 'note', pitch: 103 })
        expect(welteLicensee.meaningOf(track(99))).toBeUndefined()

        const tracks = Array.from({ length: 98 }, (_, i) => track(i + 1))
        expect(tracks.filter(t => !welteLicensee.meaningOf(t))).toEqual([])
    })

    it('has no motor tracks and keeps the rest of the T-100 layout', () => {
        expect(welteLicensee.expressionTypes).not.toContain('MotorOn')
        expect(welteLicensee.meaningOf(track(8))).toEqual(welteT100.meaningOf(track(8)))
        expect(welteLicensee.meaningOf(track(91))).toEqual(welteT100.meaningOf(track(93)))
        expect(welteLicensee.meaningOf(track(98))).toEqual(welteT100.meaningOf(track(100)))
        expect(welteLicensee.rewindTrack).toEqual(89)
    })
})

describe('Welte T-98 tracker bar', () => {
    it('reads 98 positions, five valves on each side and 88 notes between them', () => {
        expect(welteT98.trackCount).toBe(98)
        expect(welteT98.areas.map(a => a.to - a.from + 1)).toEqual([5, 88, 5])

        const tracks = Array.from({ length: 98 }, (_, i) => track(i + 1))
        expect(tracks.filter(t => !welteT98.meaningOf(t))).toEqual([])
        expect(welteT98.meaningOf(track(99))).toBeUndefined()
    })

    it('spans A0 to c⁵, the T-100 compass sitting in the middle of it', () => {
        expect(welteT98.meaningOf(track(6))).toEqual({ type: 'note', pitch: 21 })
        expect(welteT98.meaningOf(track(93))).toEqual({ type: 'note', pitch: 108 })
        expect(welteT98.meaningOf(track(9))).toEqual(welteT100.meaningOf(track(11)))
        expect(welteT98.meaningOf(track(88))).toEqual(welteT100.meaningOf(track(90)))
    })

    it('names no valve On or Off, the T-98 holding a function instead of latching it', () => {
        expect(welteT98.expressionTypes.filter(type => /On$|Off$/.test(type))).toEqual([])
        expect(welteT98.meaningOf(track(3))).toEqual({
            type: 'expression', expressionType: 'SustainPedal', scope: 'bass'
        })
        expect(welteT98.meaningOf(track(96))).toEqual({
            type: 'expression', expressionType: 'SoftPedal', scope: 'treble'
        })
    })

    it('runs the rewind on the bass sforzando-piano valve rather than one of its own', () => {
        expect(welteT98.rewindTrack).toEqual(1)
        expect(welteT98.expressionTypes).not.toContain('Rewind')
        expect(welteT98.meaningOf(track(1))).toEqual({
            type: 'expression', expressionType: 'SforzandoPiano', scope: 'bass'
        })
    })
})

describe('reading a position back from what it means', () => {
    const bars = [welteT100, welteLicensee, welteT98]

    it('inverts meaningOf on every position of every bar', () => {
        bars.forEach(bar =>
            Array.from({ length: bar.trackCount }, (_, i) => track(i + 1))
                .forEach(position => {
                    const meaning = bar.meaningOf(position)
                    if (meaning) expect(bar.positionOf(meaning)).toBe(position)
                }))
    })

    it('puts a pitch two tracks lower on the green bar than on the red', () => {
        const middleC = { type: 'note', pitch: 60 } as const
        expect(welteT100.positionOf(middleC)).toBe(47)
        expect(welteT98.positionOf(middleC)).toBe(45)
    })

    it('reads nothing of a meaning the bar has no word for', () => {
        expect(welteT98.positionOf({
            type: 'expression', expressionType: 'ForzandoOn', scope: 'treble'
        })).toBeUndefined()
        expect(welteT100.positionOf({
            type: 'expression', expressionType: 'SforzandoForte', scope: 'treble'
        })).toBeUndefined()
    })

    it('reads nothing of a pitch outside its compass', () => {
        expect(welteT100.positionOf({ type: 'note', pitch: 21 })).toBeUndefined()
        expect(welteT98.positionOf({ type: 'note', pitch: 21 })).toBe(6)
    })

    it('tells the two sides apart, the same type on each edge', () => {
        expect(welteT98.positionOf({
            type: 'expression', expressionType: 'SforzandoPiano', scope: 'bass'
        })).toBe(1)
        expect(welteT98.positionOf({
            type: 'expression', expressionType: 'SforzandoPiano', scope: 'treble'
        })).toBe(98)
    })
})

describe('translating positions between bars', () => {
    const onT100 = translationBetween(welteLicensee, welteT100)

    it('puts a position onto the one that reads the same thing', () => {
        expect(onT100(track(8))).toBe(8)
        expect(onT100(track(9))).toBe(11)
        expect(onT100(track(88))).toBe(90)
        expect(onT100(track(89))).toBe(91)
        expect(onT100(track(98))).toBe(100)
    })

    it('leaves out what the other bar does not read', () => {
        const onLicensee = translationBetween(welteT100, welteLicensee)
        expect(onLicensee(track(9))).toBeUndefined()
        expect(onLicensee(track(10))).toBeUndefined()
        expect(onLicensee(track(11))).toBe(9)
        expect(onT100(track(0))).toBeUndefined()
        expect(onT100(track(99))).toBeUndefined()
    })

    it('carries the notes of a T-98 across but none of its valves', () => {
        const onT100 = translationBetween(welteT98, welteT100)
        expect(onT100(track(9))).toBe(11)
        expect(onT100(track(88))).toBe(90)
        expect(onT100(track(6))).toBeUndefined()
        expect(onT100(track(93))).toBeUndefined()
        expect(onT100(track(3))).toBeUndefined()
        expect(onT100(track(96))).toBeUndefined()
    })

    it('is the identity on a bar itself', () => {
        const same = translationBetween(welteT100, welteT100)
        Array.from({ length: 100 }, (_, i) => track(i + 1))
            .forEach(position => expect(same(position)).toBe(position))
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
        offset: px(6.71627),
        separation: px(37.7646),
        shift: track(-3)
    }

    it('places a track where the scan has its column', () => {
        // mean centroid of the holes measured on the scanner's track 94
        expect(columnOf(track(91), calibration)).toBeCloseTo(3556.6, 0)
        // ... and on its track 24, the lowest note used on that roll
        expect(columnOf(track(21), calibration)).toBeCloseTo(913.1, 0)
    })

    it('inverts', () => {
        const tracks = Array.from({ length: 100 }, (_, i) => track(i + 1))
        tracks.forEach(position => {
            expect(trackAt(columnOf(position, calibration), calibration)).toBeCloseTo(position, 9)
        })
    })

    it('spans a run of tracks from outer edge to outer edge', () => {
        const span = columnsOf(track(11), track(13), calibration)
        expect(span.width).toBeCloseTo(3 * calibration.separation, 9)
        expect(span.from).toBeCloseTo(columnOf(track(11), calibration) - calibration.separation / 2, 9)
    })

    it('does not care which way round the run is given', () => {
        expect(columnsOf(track(13), track(11), calibration)).toEqual(columnsOf(track(11), track(13), calibration))
    })
})

describe('a place measured off a scan', () => {
    it('snaps to the position it is nearest', () => {
        // the one Mezzoforte-Off punch of the Licensee copy of WM 225 measures
        // track 1.06, and the rewind perforation track 89.0 within a hundredth
        expect(welteLicensee.meaningOf(track(1.06))).toEqual(welteLicensee.meaningOf(track(1)))
        expect(welteLicensee.meaningOf(track(0.8))).toEqual(welteLicensee.meaningOf(track(1)))
        expect(welteLicensee.roleOf(track(8.4))).toEqual('bass-expression')
        expect(welteLicensee.meaningOf(track(9.4))).toEqual({ type: 'note', pitch: 24 })
    })

    it('gives a whole pitch, never a fraction of one', () => {
        const meaning = welteLicensee.meaningOf(track(45.4))
        expect(meaning).toEqual({ type: 'note', pitch: 60 })
        expect(Number.isInteger(meaning!.type === 'note' ? meaning.pitch : 0)).toBe(true)
    })

    it('reads nothing off a place beyond the bar', () => {
        expect(welteLicensee.meaningOf(track(0.4))).toBeUndefined()
        expect(welteLicensee.meaningOf(track(98.6))).toBeUndefined()
    })
})

describe('a feature lying across the bar', () => {
    it('reads one command where it covers one position', () => {
        expect(welteLicensee.meaningsOf({ from: track(4) }))
            .toEqual([welteLicensee.meaningOf(track(4))])
        expect(welteLicensee.meaningsOf({ from: track(4), to: track(4) }))
            .toEqual([welteLicensee.meaningOf(track(4))])
    })

    /**
     * The opening at the head of the Licensee copy of WM 225 spans tracks
     * 0.80 to 2.46, so it uncovers the bar holes of Mezzoforte-Off and
     * Mezzoforte-On together.
     */
    it('reads both commands where it covers two positions', () => {
        expect(welteLicensee.meaningsOf({ from: track(0.8), to: track(2.46) })).toEqual([
            { type: 'expression', expressionType: 'MezzoforteOff', scope: 'bass' },
            { type: 'expression', expressionType: 'MezzoforteOn', scope: 'bass' }
        ])
        expect(welteLicensee.positionsIn({ from: track(0.8), to: track(2.46) })).toEqual([1, 2])
    })

    it('takes its ends either way round', () => {
        expect(welteLicensee.meaningsOf({ from: track(2), to: track(1) }))
            .toEqual(welteLicensee.meaningsOf({ from: track(1), to: track(2) }))
    })

    it('reads nothing off a run the bar does not reach', () => {
        expect(welteLicensee.meaningsOf({ from: track(99), to: track(101) })).toEqual([])
    })

    it('leaves out the positions the bar does not read, and keeps the rest', () => {
        const across = welteT98.meaningsOf({ from: track(97), to: track(100) })
        expect(across).toEqual([welteT98.meaningOf(track(97)), welteT98.meaningOf(track(98))])
    })
})
