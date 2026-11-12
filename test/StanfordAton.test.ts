import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import * as path from 'path'
import { asSymbols, calibrationOf, featuresOf, measuringSoftwareOf, punchDiameterOf, unreadTracks } from '../src/model/RollCopy'
import { readFromStanfordAton } from '../src/readers/stanfordAton'
import { welteT100 } from '../src/systems/welteT100/bar'
import { welteLicensee } from '../src/systems/welteLicensee/bar'
import { welteT98 } from '../src/systems/welteT98/bar'
import { columnOf } from '../src/model/TrackCalibration'
import { Expression } from '../src/model/Symbol'
import { inPixels, mm, track } from '../src/model/Quantity'

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

const countByExpression = (copy: ReturnType<typeof readFromStanfordAton>, bar = welteT100) =>
    asSymbols(featuresOf(copy), bar)
        .filter((symbol): symbol is Expression => symbol.type === 'expression')
        .reduce((counts, symbol) => {
            const key = `${symbol.scope} ${symbol.expressionType}`
            return counts.set(key, (counts.get(key) || 0) + 1)
        }, new Map<string, number>())

const pitchesOf = (copy: ReturnType<typeof readFromStanfordAton>, bar = welteT100) =>
    asSymbols(featuresOf(copy), bar)
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
        expect([...unreadTracks(featuresOf(copy), welteT100).keys()]).toEqual([])
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
     * A roll is calibrated on the bar it was cut for and keeps that
     * bar's numbering. Read as a Licensee roll, this T-100 scan has its
     * rewind chain taken for the Licensee's, two positions nearer the
     * notes, so the notes and the treble valves still mean what they
     * did while the bass valves slip by two tracks. That slip is how a
     * wrongly declared system shows itself.
     */
    it('reads a roll on the bar it was cut for and keeps its numbering', () => {
        const asLicensee = readFromStanfordAton(aton, { system: welteLicensee })
        expect(asLicensee.production?.system?.id).toEqual('https://w3id.org/reo/type/system/welte-licensee')
        expect(asLicensee.measurements.trackCalibration?.shift).toEqual(-5)
        expect([...unreadTracks(featuresOf(asLicensee), welteLicensee).keys()]).toEqual([])

        expect(pitchesOf(asLicensee, welteLicensee)).toEqual(pitchesOf(copy))

        const counts = countByExpression(asLicensee, welteLicensee)
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
        expect(inPixels(featuresOf(copy)[0].horizontal.from, resolution)).toBeCloseTo(8083, 6)
    })

    it('states no resolution where the file gives none', () => {
        const silent = readFromStanfordAton(aton.replace(/^@LENGTH_DPI:.*$/m, '@LENGTH_DPI:'))
        expect(silent.measurements.scanResolution).toBeUndefined()
    })

    it('measures a plausible punch diameter', () => {
        const diameter = punchDiameterOf(copy)
        expect(diameter).toBeGreaterThan(1)
        expect(diameter).toBeLessThan(3)
    })

    it('takes an explicit shift when the rewind is not to be trusted', () => {
        const uncalibrated = readFromStanfordAton(aton, { trackShift: track(0) })
        expect(uncalibrated.measurements.trackCalibration?.shift).toEqual(0)
        expect(featuresOf(uncalibrated)[0].vertical.from)
            .toEqual(featuresOf(copy)[0].vertical.from + 3)
    })

    it('puts a track back on the image column it was measured at', () => {
        const calibration = calibrationOf(copy)!
        // the rewind chain was measured with its centroids around 3554px
        expect(columnOf(welteT100.rewindTrack, calibration)).toBeCloseTo(3556.6, 0)
    })

    it('points at the scan Stanford keeps under the DRUID', () => {
        expect(copy.scan).toEqual('https://stacks.stanford.edu/image/iiif/mf320jq4997%2Fmf320jq4997_0001/')
        expect(featuresOf(copy)[0].depiction).toContain('mf320jq4997_0001')
    })

    /**
     * Files from 2019 do not yet say which software measured them, and
     * nothing is made up for them; later ones do.
     */
    it('records the software and the day of the analysis where stated', () => {
        expect(measuringSoftwareOf(copy)).toEqual([])
        expect(copy.measurements.holeSeparation!['@annotation']).toBeUndefined()

        const stated = readFromStanfordAton(aton.replace(
            '@SOFTWARE_DATE:',
            '@HOLE_SOFTWARE:\thttps://github.com/pianoroll/roll-image-parser\n@SOFTWARE_DATE:'
        ))
        const measurement = {
            type: 'measurement',
            software: [{ name: 'https://github.com/pianoroll/roll-image-parser', version: 'Mar 26 2019 16:32:26' }],
            date: { within: new Date(2019, 4, 24) }
        }
        expect(stated.measurements.holeSeparation!['@annotation']!.belief.reasons).toEqual([measurement])
        expect(stated.measurements.dimensions!['@annotation']!.belief.reasons).toEqual([measurement])
        expect(stated.measurements.scanResolution!['@annotation']).toBeUndefined()
        expect(measuringSoftwareOf(stated)).toEqual(measurement.software)
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

        const rescued = featuresOf(withBadHead).filter(feature => feature.horizontal.from > 4229 && feature.horizontal.from < 4231)
        expect(rescued).toHaveLength(1)
        expect(rescued[0].vertical.from).toEqual(welteT100.rewindTrack)
        expect(featuresOf(withBadHead)).toHaveLength(featuresOf(copy).length + 1)
    })

    /**
     * What the parser sets aside is not always a punch. Torn paper is
     * far wider than a track, and a speck too small for a hole is
     * given an attack with an off time of nought, which would make a
     * chain that ends before the roll begins.
     */
    it('takes neither torn paper nor a speck among the bad holes for a chain', () => {
        const bad = (id: string, widthRow: number, widthCol: number, offTime: number, reason: string) => [
            '@@BEGIN: HOLE', `@ID:\t${id}`,
            '@ORIGIN_ROW:\t50000px', '@ORIGIN_COL:\t3543px', `@WIDTH_ROW:\t${widthRow}px`, `@WIDTH_COL:\t${widthCol}px`,
            '@CENTROID_ROW:\t50009px', '@CENTROID_COL:\t3556px', '@AREA:\t380px', '@PERIMETER:\t70px',
            '@CIRCULARITY:\t0.85', '@NOTE_ATTACK:\t50000px', `@OFF_TIME:\t${offTime}px`,
            '@TRACKER_HOLE:\t0', '@MIDI_KEY:\t-1', `@REASON:\t${reason}`,
            '@@END: HOLE'
        ].join('\n')
        const setAside = [
            '@@BEGIN: BADHOLES',
            bad('bad001', 642, 3618, 50642, 'wide'),
            bad('bad002', 10, 16, 0, 'small'),
            '@@END: BADHOLES'
        ].join('\n')
        const torn = readFromStanfordAton(aton.replace('@@END: HOLES', `@@END: HOLES\n${setAside}`))

        expect(featuresOf(torn)).toHaveLength(featuresOf(copy).length)
        expect(featuresOf(torn).every(feature => feature.horizontal.to >= feature.horizontal.from)).toBe(true)
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
        expect(featuresOf(elsewhere).every(feature => feature.depiction === undefined)).toBe(true)
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

describe('reading a file that is not quite an analysis', () => {
    it('reads an analysis that never closes its description of the roll', () => {
        // bb988jx6754 of Stanford's archive ends on `@END: ROLLINFO`.
        const unclosed = aton.replace(/@@END:\s*ROLLINFO\s*$/, '@END: ROLLINFO\n')
        expect(unclosed).not.toEqual(aton)

        expect(featuresOf(readFromStanfordAton(unclosed))).toHaveLength(featuresOf(readFromStanfordAton(aton)).length)
    })

    it('says so where a file describes no roll with holes', () => {
        expect(() => readFromStanfordAton('@@BEGIN: ROLLINFO\n@DRUID:\tnone\n@@END: ROLLINFO\n')).toThrow(/not a roll analysis/)
        expect(() => readFromStanfordAton('MThd, or anything else')).toThrow(/not a roll analysis/)
    })
})

describe('calibrating a scan whose rewind cannot be found', () => {
    it('reads the phase off columns that span the whole bar', () => {
        const copy = readFromStanfordAton(t98Analysis(spanning(13, 110)), {
            system: welteT98, bar: welteT98
        })

        expect(copy.measurements.trackCalibration?.shift).toEqual(-12)
        expect([...unreadTracks(featuresOf(copy), welteT98).keys()]).toEqual([])

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

    /**
     * Stanford's analyses show both ways the columns miss the span of
     * the bar while the rewind cannot be told: a stray hole beside the
     * bar makes them one too many, as on vj076nk8220, and a roll that
     * leaves an outermost position unpunched makes them too few. Read at
     * a shift of nought, such a copy comes out three tracks off without
     * a word, and aligns with no other copy of its roll.
     */
    it('keeps the chains on the bar where a stray hole lies beside it', () => {
        // Every position punched twice, and one hole beyond the last.
        const copy = readFromStanfordAton(t98Analysis([...spanning(13, 110), ...spanning(13, 110), 111]), {
            system: welteT98, bar: welteT98
        })

        expect(copy.measurements.trackCalibration?.shift).toEqual(-12)
        expect(featuresOf(copy)).toHaveLength(196)
    })

    it('lets the middle of the paper choose where the columns fall short of the bar', () => {
        // The paper lies between columns 358 and 3738 of the image, so its
        // middle is at 2048 px, which the grid puts between the columns 61
        // and 62: the middle of a bar of 98 positions, twelve further down.
        const stated = t98Analysis(spanning(20, 100)).replace('@IMAGE_LENGTH:', '@IMAGE_WIDTH:\t4096px\n\n@IMAGE_LENGTH:')
        const copy = readFromStanfordAton(stated, { system: welteT98, bar: welteT98 })

        expect(copy.measurements.trackCalibration?.shift).toEqual(-12)
    })

    it('does not take a stray hole past the last attack for the rewind', () => {
        // One hole trails the last attack, far from the rewind track, as on gx107hd3026.
        const trailing = [
            '@@BEGIN: HOLE', '@ORIGIN_ROW:\t99000px', `@ORIGIN_COL:\t${40 * 33.2957}px`, '@WIDTH_ROW:\t20px', '@WIDTH_COL:\t19px',
            `@CENTROID_COL:\t${40 * 33.2957 + 1.51476}px`, '@PERIMETER:\t60px', '@CIRCULARITY:\t0.9', '@TRACKER_HOLE:\t40', '@@END: HOLE'
        ].join('\n')
        const analysis = t98Analysis(spanning(13, 110)).replace('@@END: HOLES', `${trailing}\n\n@@END: HOLES`)
        const copy = readFromStanfordAton(analysis, { system: welteT98, bar: welteT98 })

        expect(copy.measurements.trackCalibration?.shift).toEqual(-12)
    })
})

/**
 * A roll with a ragged end, as the parser describes WM 1253's second
 * copy (hp956bx4547): it takes its average hole width before it sets
 * the torn paper aside, so the average comes out several times the
 * width of a hole, and since it joins what lies closer than 1.37 of
 * those widths, a note repeated within two centimetres is joined with
 * the one before it.
 */
const raggedAnalysis = (averageHoleWidth: number): string => {
    const hole = (row: number, attack?: { off: number }) => [
        '@@BEGIN: HOLE',
        `@ORIGIN_ROW:\t${row}px`,
        '@ORIGIN_COL:\t1870px',
        '@WIDTH_ROW:\t28px',
        '@WIDTH_COL:\t28px',
        '@CENTROID_COL:\t1884px',
        '@PERIMETER:\t88px',
        '@CIRCULARITY:\t0.97',
        ...(attack ? [`@NOTE_ATTACK:\t${row}px`, `@OFF_TIME:\t${attack.off}px`] : []),
        '@TRACKER_HOLE:\t50',
        '@@END: HOLE'
    ].join('\n')

    return [
        '@@BEGIN: ROLLINFO',
        '@DRUID:',
        '@ROLL_TYPE:\twelte-red',
        '@LENGTH_DPI:\t300.25ppi',
        '@IMAGE_LENGTH:\t57120px',
        '@ROLL_WIDTH:\t3888.3px',
        '@HARD_MARGIN_BASS:\t34px',
        '@HARD_MARGIN_TREBLE:\t144px',
        `@AVG_HOLE_WIDTH:\t${averageHoleWidth}px`,
        '@HOLE_SEPARATION:\t37.8269px',
        '@HOLE_OFFSET:\t11.9463px',
        '@BRIDGE_FACTOR:\t1.37',
        '@@BEGIN: HOLES',
        // a note held over three punches, 10px of paper between them
        hole(1000, { off: 1104 }), hole(1038), hole(1076),
        // and the same key struck three more times, 265px apart: the
        // parser has joined the last two
        hole(1400, { off: 1428 }),
        hole(1700, { off: 2021 }), hole(1993),
        '@@END: HOLES',
        '@@END: ROLLINFO'
    ].join('\n')
}

describe('reading a roll whose torn end widened the parser\'s bridge', () => {
    const extents = (analysis: string) =>
        featuresOf(readFromStanfordAton(analysis, { trackShift: track(0) }))
            .map(feature => [feature.horizontal.from, feature.horizontal.to].map(place => Math.round(inPixels(place, 300.25))))

    it('chains the holes anew over a bridge as wide as the holes it lists', () => {
        expect(extents(raggedAnalysis(197.71))).toEqual([[1000, 1104], [1400, 1428], [1700, 1728], [1993, 2021]])
    })

    it('takes the parser\'s chains where its average is that of the holes', () => {
        expect(extents(raggedAnalysis(28))).toEqual([[1000, 1104], [1400, 1428], [1700, 2021]])
    })

    /**
     * On round punches 28px wide the parser joins over 38px of paper,
     * which is more than lies between two strokes of a fast
     * repetition. Whoever reads the file can say how much paper a
     * chain may hold instead.
     */
    it('chains over the bridge it is given', () => {
        const within = (bridge: number) =>
            featuresOf(readFromStanfordAton(raggedAnalysis(28), { trackShift: track(0), bridge: mm(bridge) }))
                .map(feature => [feature.horizontal.from, feature.horizontal.to].map(place => Math.round(inPixels(place, 300.25))))

        expect(within(1)).toEqual([[1000, 1104], [1400, 1428], [1700, 1728], [1993, 2021]])
        expect(within(0.5)).toHaveLength(6)
    })
})
