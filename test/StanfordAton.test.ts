import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { asSymbols, calibrationOf, unreadTracks } from '../src/RollCopy'
import { readFromStanfordAton } from '../src/readers/stanfordAton'
import { welteT100 } from '../src/systems/welteT100/bar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { welteT98 } from '../src/systems/welteT98/bar'
import { columnOf } from '../src/TrackCalibration'
import { Expression } from '../src/Symbol'
import { inPixels, track } from '../src/Quantity'

/**
 * mf320jq4997, a red Welte roll scanned at Stanford, reduced to its
 * expression tracks, a sample of notes and the rewind chain. Its holes
 * were measured on the scanner's tracks 5 to 102, so the numbering has
 * to be moved down by three before it means anything on the bar.
 */
const aton = readFileSync(
    path.join(__dirname, 'fixtures', 'mf320jq4997_analysis.txt'),
    'utf8'
)

const countByExpression = (copy: ReturnType<typeof readFromStanfordAton>) =>
    asSymbols(copy.features)
        .filter((symbol): symbol is Expression => symbol.type === 'expression')
        .reduce((counts, symbol) => {
            const key = `${symbol.scope} ${symbol.expressionType}`
            return counts.set(key, (counts.get(key) || 0) + 1)
        }, new Map<string, number>())

const pitchesOf = (copy: ReturnType<typeof readFromStanfordAton>, bar = welteT100) =>
    asSymbols(copy.features, bar)
        .filter(symbol => symbol.type === 'note')
        .map(symbol => symbol.pitch)

describe('reading a Stanford analysis file', () => {
    const copy = readFromStanfordAton(aton)

    it('calibrates the scan by putting the rewind chain on the rewind track', () => {
        expect(copy.measurements.trackCalibration?.shift).toEqual(-3)
        expect(copy.measurements.trackCalibration?.separation).toBeCloseTo(37.7646, 4)
        expect(copy.measurements.trackCalibration?.offset).toBeCloseTo(6.71627, 4)
    })

    it('leaves no hole on a position the bar cannot read', () => {
        expect([...unreadTracks(copy.features).keys()]).toEqual([])
    })

    /**
     * The check that the calibration is right rather than merely
     * consistent: the Welte valves are punched in on/off pairs, so a
     * correct shift lands them in near-equal numbers on facing tracks,
     * and the motor is switched on and off exactly once.
     */
    it('lands the expression valves on their pairs', () => {
        const counts = countByExpression(copy)

        expect(counts.get('bass MotorOn')).toEqual(1)
        expect(counts.get('bass MotorOff')).toEqual(1)

        expect(counts.get('bass SoftPedalOn')).toEqual(3)
        expect(counts.get('bass SoftPedalOff')).toEqual(3)

        expect(counts.get('treble SustainPedalOn')).toEqual(52)
        expect(counts.get('treble SustainPedalOff')).toEqual(51)

        expect(counts.get('bass SlowCrescendoOn')).toEqual(50)
        expect(counts.get('bass SlowCrescendoOff')).toEqual(48)

        expect(counts.get('treble SlowCrescendoOn')).toEqual(63)
        expect(counts.get('treble SlowCrescendoOff')).toEqual(64)
    })

    /**
     * A shift off by one moves the whole bar, so the pairing collapses
     * and the rewind chain reads as something else. That is what makes
     * the check above evidence rather than a restatement of the input.
     */
    it.each([-2, -4])('breaks the pairing at a shift of %i', shift => {
        const counts = countByExpression(readFromStanfordAton(aton, { trackShift: track(shift) }))

        expect(counts.get('treble Rewind')).toBeUndefined()
        expect(counts.get('bass ForzandoOn')).not.toEqual(15)
        expect(counts.get('bass SoftPedalOn')).not.toEqual(counts.get('bass SoftPedalOff'))
    })

    it('reads the notes within the T100 compass', () => {
        const pitches = pitchesOf(copy)

        expect(Math.min(...pitches)).toBeGreaterThanOrEqual(24)
        expect(Math.max(...pitches)).toBeLessThanOrEqual(103)
    })

    it('names the system the roll was cut for', () => {
        expect(copy.production?.system?.id).toEqual('https://w3id.org/reo/type/system/welte-t100')
    })

    /**
     * A roll cut for another bar is calibrated on that bar and then
     * put onto the edition's. Read as a Licensee roll, this T-100 scan
     * has its rewind chain taken for the Licensee's, two positions
     * nearer the notes, so the notes and the treble valves still land
     * where they belong while the bass valves slip by two tracks. That
     * slip is how a wrongly declared system shows itself.
     */
    it('reads a roll on the bar it was cut for and puts it onto the edition’s', () => {
        const asLicensee = readFromStanfordAton(aton, { system: welteLicensee })
        expect(asLicensee.production?.system?.id).toEqual('https://w3id.org/reo/type/system/welte-licensee')
        expect(asLicensee.measurements.trackCalibration?.shift).toEqual(-5)
        expect([...unreadTracks(asLicensee.features).keys()]).toEqual([])

        expect(pitchesOf(asLicensee)).toEqual(pitchesOf(copy))

        const counts = countByExpression(asLicensee)
        expect(counts.get('treble SustainPedalOn')).toEqual(52)
        expect(counts.get('bass SlowCrescendoOn')).toEqual(countByExpression(copy).get('bass ForzandoOn'))
        expect(counts.get('bass MotorOn')).toBeUndefined()
    })

    /**
     * The file states the resolution along the roll, and the copy keeps
     * it. Taking the first hole back into the scan at the resolution the
     * copy carries lands on the row the analysis measured it at, which
     * is what shows the number to be this scan's own rather than one
     * assumed for every scan.
     */
    it('keeps the resolution the scan was read at', () => {
        expect(copy.measurements.scanResolution).toEqual({ value: 300.25, unit: 'px/in' })

        // the first chain of the file attacks at row 8083
        const resolution = copy.measurements.scanResolution!.value
        expect(inPixels(copy.features[0].horizontal.from, resolution)).toBeCloseTo(8083, 6)
    })

    it('states no resolution where the file gives none', () => {
        const silent = readFromStanfordAton(aton.replace(/^@LENGTH_DPI:.*$/m, '@LENGTH_DPI:'))
        expect(silent.measurements.scanResolution).toBeUndefined()
    })

    it('measures a plausible punch diameter', () => {
        const diameter = copy.measurements.punchDiameter?.value
        expect(diameter).toBeGreaterThan(1)
        expect(diameter).toBeLessThan(3)
    })

    it('takes an explicit shift when the rewind is not to be trusted', () => {
        const uncalibrated = readFromStanfordAton(aton, { trackShift: track(0) })
        expect(uncalibrated.measurements.trackCalibration?.shift).toEqual(0)
        expect(uncalibrated.features[0].vertical.from)
            .toEqual(copy.features[0].vertical.from + 3)
    })

    it('puts a track back on the image column it was measured at', () => {
        const calibration = calibrationOf(copy)!
        // the rewind chain was measured with its centroids around 3554px
        expect(columnOf(welteT100.rewindTrack, calibration)).toBeCloseTo(3556.6, 0)
    })

    it('points at the scan Stanford keeps under the DRUID', () => {
        expect(copy.scan).toEqual('https://stacks.stanford.edu/image/iiif/mf320jq4997%2Fmf320jq4997_0001/')
        expect(copy.features[0].depiction).toContain('mf320jq4997_0001')
    })

    /**
     * Files from 2019 do not yet say which software measured them, and
     * nothing is made up for them; later ones do.
     */
    it('records the software and the day of the analysis where stated', () => {
        expect(copy.measurements.measuredBy).toBeUndefined()

        const stated = readFromStanfordAton(aton.replace(
            '@SOFTWARE_DATE:',
            '@HOLE_SOFTWARE:\thttps://github.com/pianoroll/roll-image-parser\n@SOFTWARE_DATE:'
        ))
        expect(stated.measurements.measuredBy).toEqual({
            software: 'https://github.com/pianoroll/roll-image-parser',
            version: 'Mar 26 2019 16:32:26',
            date: new Date(2019, 4, 24, 18, 13, 8)
        })
    })

    /**
     * The parser sets a punch aside when it is wider than it is long,
     * even when it has already chained it into a note. The chain is
     * still there on the paper, so its head comes back in, on the
     * track its column falls on.
     */
    it('keeps a chain whose head the parser found suspicious', () => {
        const badHead = [
            '@@BEGIN: BADHOLES', '@@BEGIN: HOLE', '@ID:\tbad001',
            '@ORIGIN_ROW:\t50000px', '@ORIGIN_COL:\t3543px', '@WIDTH_ROW:\t19px', '@WIDTH_COL:\t24px',
            '@CENTROID_ROW:\t50009px', '@CENTROID_COL:\t3556px', '@AREA:\t380px', '@PERIMETER:\t70px',
            '@CIRCULARITY:\t0.85', '@NOTE_ATTACK:\t50000px', '@OFF_TIME:\t50600px',
            '@TRACKER_HOLE:\t0', '@MIDI_KEY:\t-1', '@REASON:\taspect',
            '@@END: HOLE', '@@END: BADHOLES'
        ].join('\n')
        const withBadHead = readFromStanfordAton(aton.replace('@@END: HOLES', `@@END: HOLES\n${badHead}`))

        const rescued = withBadHead.features.filter(feature => feature.horizontal.from > 4229 && feature.horizontal.from < 4231)
        expect(rescued).toHaveLength(1)
        expect(rescued[0].vertical.from).toEqual(welteT100.rewindTrack)
        expect(withBadHead.features).toHaveLength(copy.features.length + 1)
    })

    /**
     * An analysis of a scan hosted elsewhere names its own scan, and
     * since only an image server can crop a feature out of it, the
     * holes carry no depiction of their own.
     */
    it('takes the scan of an analysis made elsewhere', () => {
        const elsewhere = readFromStanfordAton(aton.replace(/^@DRUID:.*$/m, '@DRUID:'), {
            scan: '/facsimiles/WR0225_02'
        })
        expect(elsewhere.scan).toEqual('/facsimiles/WR0225_02')
        expect(elsewhere.features.every(feature => feature.depiction === undefined)).toBe(true)
    })
})

/**
 * A T-98 scan the way Dyer's is: the rewind is not the last thing on
 * the roll, since a pattern of test punches follows it, so nothing
 * trails the final attack and the rewind chain cannot be picked out.
 */
const t98Analysis = (columns: readonly number[]): string => {
    const hole = (column: number, row: number) => [
        '@@BEGIN: HOLE',
        `@ORIGIN_ROW:\t${row}px`,
        `@ORIGIN_COL:\t${column * 33.2957}px`,
        '@WIDTH_ROW:\t110px',
        '@WIDTH_COL:\t19px',
        `@CENTROID_COL:\t${column * 33.2957 + 1.51476}px`,
        '@PERIMETER:\t190.091px',
        '@CIRCULARITY:\t0.46',
        `@NOTE_ATTACK:\t${row}px`,
        `@OFF_TIME:\t${row + 110}px`,
        `@TRACKER_HOLE:\t${column}`,
        '@@END: HOLE'
    ].join('\n')

    return [
        '@@BEGIN: ROLLINFO',
        '@DRUID:',
        '@ROLL_TYPE:\twelte-green',
        '@LENGTH_DPI:\t300.25ppi',
        '@IMAGE_LENGTH:\t96038px',
        '@ROLL_WIDTH:\t3372.67px',
        '@HARD_MARGIN_BASS:\t358px',
        '@HARD_MARGIN_TREBLE:\t358px',
        '@HOLE_SEPARATION:\t33.2957px',
        '@HOLE_OFFSET:\t1.51476px',
        '@@BEGIN: HOLES',
        ...columns.map((column, i) => hole(column, 1000 + i * 200)),
        '@@END: HOLES',
        '@@END: ROLLINFO'
    ].join('\n\n')
}

const spanning = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i)

describe('calibrating a scan whose rewind cannot be found', () => {
    it('reads the phase off columns that span the whole bar', () => {
        const copy = readFromStanfordAton(t98Analysis(spanning(13, 110)), {
            system: welteT98, bar: welteT98
        })

        expect(copy.measurements.trackCalibration?.shift).toEqual(-12)
        expect([...unreadTracks(copy.features, welteT98).keys()]).toEqual([])

        const pitches = pitchesOf(copy, welteT98)
        expect(Math.min(...pitches)).toEqual(21)
        expect(Math.max(...pitches)).toEqual(108)
    })

    it('leaves the phase open where the columns fall short of the bar', () => {
        const copy = readFromStanfordAton(t98Analysis(spanning(20, 100)), {
            system: welteT98, bar: welteT98
        })

        expect(copy.measurements.trackCalibration?.shift).toEqual(0)
    })

    it('still prefers the rewind chain where the roll has one', () => {
        expect(readFromStanfordAton(aton).measurements.trackCalibration?.shift).toEqual(-3)
    })
})
