import { v4 } from "uuid";
import { AtonParser } from "./AtonParser.js";
import { HoleChain } from "../model/Feature.js";
import { RollCopy, Tear } from "../model/RollCopy.js";
import { assignDate, Measurement, ObjectAssumption } from "../model/Assumption.js";
import { TrackCalibration } from "../model/TrackCalibration.js";
import { systemOf, TrackerBar } from "../systems/TrackerBar.js";
import { welteT100 } from "../systems/welteT100/bar.js";
import { inMillimeters, mean, Millimeters, mm, Pixels, pixelsPerInch, px, subtract, Track, track } from "../model/Quantity.js";
import { medianOf } from "../collation/statistics.js";

/** A hole record as the Stanford analysis files spell it. */
interface AtonHole {
    TRACKER_HOLE: string
    CENTROID_COL: string
    ORIGIN_COL: string
    WIDTH_COL: string
    CIRCULARITY: string
    PERIMETER: string
    NOTE_ATTACK?: string
    OFF_TIME?: string
}

/** A tear record, as the analysis lists the edge tears on either side. */
interface AtonTear {
    ORIGIN_ROW: string
    ORIGIN_COL: string
    WIDTH_ROW: string
    WIDTH_COL: string
}

/** The tears an analysis lists, those on the bass edge apart from those on the treble. */
interface AtonTears {
    BASS_TEARS?: { TEAR?: AtonTear | AtonTear[] }
    TREBLE_TEARS?: { TEAR?: AtonTear | AtonTear[] }
}

/** Values in these files carry their unit as a suffix, e.g. "37.7646px". */
const readPx = (value: string): Pixels => px(parseFloat(value))

/** The parser writes one record as an object and several as an array. */
const listOf = <T,>(value: T | T[] | undefined): T[] =>
    value === undefined ? [] : Array.isArray(value) ? value : [value]

/**
 * Holes the parser set aside as suspicious after it had already chained
 * them into a note: the head of such a chain is usually a punch that
 * came out a little short, and leaving it out would lose the whole
 * chain. They carry no track number of their own, so the column says
 * which track they sit on.
 */
const chainedBadHoles = (holes: AtonHole[], calibration: TrackCalibration): AtonHole[] =>
    holes
        .filter(hole => hole.NOTE_ATTACK && hole.OFF_TIME)
        .map(hole => ({
            ...hole,
            TRACKER_HOLE: `${Math.round((readPx(hole.CENTROID_COL) - calibration.offset) / calibration.separation)}`
        }))

const mostFrequent = (values: number[]) => {
    const counts = values.reduce(
        (acc, value) => acc.set(value, (acc.get(value) || 0) + 1),
        new Map<number, number>()
    )
    return [...counts].sort(([, a], [, b]) => b - a)[0]?.[0]
}

/**
 * Only the first hole of a chain carries an attack and an off time;
 * the rest continue it. The rewind perforation carries neither, and it
 * is the last thing punched on the roll, so whatever the holes past the
 * final musical attack sit on is the rewind track, in the scanner's
 * own numbering.
 */
const rewindTrackIn = (holes: AtonHole[]) => {
    const lastMusical = holes.findLastIndex(hole => hole.NOTE_ATTACK)
    const trailing = holes.slice(lastMusical + 1).map(hole => +hole.TRACKER_HOLE)
    return mostFrequent(trailing)
}

/**
 * The columns themselves, for a roll that punches its outermost
 * positions. A hole can only sit on a position the bar reads, so
 * columns spanning exactly as many positions as the bar has must run
 * from its first to its last, and the lowest column is position one.
 * Fewer columns leave the phase open and more mean something outside
 * the bar was measured, and neither settles anything.
 */
const spannedShiftIn = (holes: AtonHole[], bar: TrackerBar): Track | undefined => {
    const columns = holes.map(hole => +hole.TRACKER_HOLE).filter(Number.isFinite)
    if (columns.length === 0) return undefined

    const lowest = Math.min(...columns)
    return Math.max(...columns) - lowest + 1 === bar.trackCount ? track(1 - lowest) : undefined
}

/** The columns of the chains, each with how many chains it holds. */
const chainsByColumn = (holes: AtonHole[]): Map<number, number> => {
    const counts = new Map<number, number>()
    for (const hole of holes) {
        const column = +hole.TRACKER_HOLE
        if (hole.NOTE_ATTACK && Number.isFinite(column)) counts.set(column, (counts.get(column) ?? 0) + 1)
    }
    return counts
}

/** How many chains a shift leaves on positions the bar does not read. */
const lostUnder = (columns: ReadonlyMap<number, number>, bar: TrackerBar) => (shift: number): number =>
    [...columns].reduce((sum, [column, chains]) => bar.meaningOf(track(column + shift)) ? sum : sum + chains, 0)

/**
 * The shifts that leave the fewest chains on positions the bar does not
 * read, and how many those leave there. A roll is punched for its bar,
 * so a shift that puts chains beside it is wrong by as much as it puts
 * there; one that keeps them all is right only where the columns span
 * the whole bar, and one of several otherwise.
 */
const fittingShiftsIn = (columns: ReadonlyMap<number, number>, bar: TrackerBar): { shifts: Track[], lost: number } => {
    if (columns.size === 0) return { shifts: [], lost: 0 }

    const lowest = Math.min(...columns.keys())
    const highest = Math.max(...columns.keys())
    // Every shift that still puts a column on the bar.
    const shifts = Array.from({ length: highest - lowest + bar.trackCount }, (_, i) => 1 - highest + i)
    const losses = shifts.map(lostUnder(columns, bar))
    const lost = Math.min(...losses)
    return { shifts: shifts.filter((_, i) => losses[i] === lost).map(shift => track(shift)), lost }
}

/**
 * The share of a roll's chains that may lie beside the bar without
 * calling the rewind into question: dust or a tear taken for a hole,
 * which an analysis has a few of, and far less than a shift off by a
 * track puts there.
 */
const STRAY_SHARE = 0.01

/**
 * Where the paper puts the bar: the positions lie centred between the
 * edges of the roll, so the column at the middle of the paper is the
 * middle of the bar. It is a measurement and comes out between two
 * positions as often as on one, which is why it only chooses among
 * shifts the holes admit. Nothing where the file does not say where the
 * paper lies in the image.
 */
const centredShiftIn = (rollinfo: Record<string, string>, bar: TrackerBar): number | undefined => {
    const width = readPx(rollinfo.IMAGE_WIDTH)
    const bass = readPx(rollinfo.HARD_MARGIN_BASS)
    const treble = readPx(rollinfo.HARD_MARGIN_TREBLE)
    const offset = readPx(rollinfo.HOLE_OFFSET)
    const separation = readPx(rollinfo.HOLE_SEPARATION)
    if (![width, bass, treble, offset, separation].every(Number.isFinite) || separation <= 0) return undefined

    const middle = (bass + (width - treble)) / 2
    return (bar.trackCount + 1) / 2 - (middle - offset) / separation
}

/**
 * How far the scanner's own hole numbering has to move to reach the
 * bar. The rewind perforation is the usual landmark, and is taken where
 * it leaves the chains on the bar, give or take a stray. It cannot
 * be told on every scan: a rewind slot punched in one piece is a chain
 * like any other and nothing trails the last attack, a stray hole past
 * the end is taken for it, and rolls carry punches after it, as Dyer's
 * T-98 scans do. There the holes themselves say which shifts keep them
 * on the bar, and where they admit several, the middle of the paper
 * chooses.
 */
const calibrationShiftIn = (holes: AtonHole[], bar: TrackerBar, rollinfo: Record<string, string>): Track => {
    const columns = chainsByColumn(holes)
    const chains = [...columns.values()].reduce((sum, count) => sum + count, 0)
    const fitting = fittingShiftsIn(columns, bar)

    const rewind = rewindTrackIn(holes)
    const byRewind = rewind === undefined ? undefined : track(bar.rewindTrack - rewind)
    if (byRewind !== undefined && lostUnder(columns, bar)(byRewind) - fitting.lost <= STRAY_SHARE * chains) return byRewind
    if (fitting.shifts.length === 1) return fitting.shifts[0]

    const centred = centredShiftIn(rollinfo, bar)
    if (centred !== undefined && fitting.shifts.length > 0) {
        return fitting.shifts.reduce((nearest, shift) => Math.abs(shift - centred) < Math.abs(nearest - centred) ? shift : nearest)
    }
    return spannedShiftIn(holes, bar) ?? byRewind ?? track(0)
}

/**
 * The phase of the tracker grid within the image. The analysis file
 * usually states it; where it does not, the holes themselves give it away,
 * since each sits close to the centre of its column.
 */
const gridOffsetOf = (holes: AtonHole[], separation: Pixels, stated?: string): Pixels => {
    if (stated !== undefined) return readPx(stated)

    return medianOf(holes.map(hole => px(readPx(hole.CENTROID_COL) - +hole.TRACKER_HOLE * separation))) ?? px(0)
}

/** The head of a chain of holes, with the attack and the off time it carries read once. */
type Chain = { hole: AtonHole, attack: Pixels, release: Pixels }

const chainsAmong = (holes: AtonHole[]): Chain[] =>
    holes
        .filter(hole => hole.NOTE_ATTACK && hole.OFF_TIME)
        .map(hole => ({ hole, attack: readPx(hole.NOTE_ATTACK!), release: readPx(hole.OFF_TIME!) }))
        .sort((a, b) => a.attack - b.attack)

const punchDiameterOf = (holes: AtonHole[], dpi: number): Millimeters | undefined => {
    const circular = holes
        .filter(hole => parseFloat(hole.CIRCULARITY) > 0.95)
        .map(hole => mm(inMillimeters(readPx(hole.PERIMETER), dpi) / Math.PI))

    return circular.length > 0 ? mean(circular) : undefined
}

/**
 * How `readFromStanfordAton` reads an analysis file: how its hole
 * numbering is shifted onto the tracker bar, which bar the roll was cut
 * for, and where its scan can be seen.
 * @category Sources
 */
export interface StanfordAtonOptions {
    /**
     * Added to the scanning software's hole numbering to reach the
     * tracker bar. Left out, it is inferred by putting the rewind
     * perforation on the bar's rewind track, and where that cannot be
     * told, by keeping the chains on the bar.
     */
    trackShift?: Track

    /**
     * The bar the scanned roll was cut for. The scan is calibrated on
     * it and the holes keep its numbering, since a copy is read by the
     * bar it was cut for and by no other.
     */
    system?: TrackerBar

    /**
     * Where the scan the analysis was made from can be seen. Stanford's
     * files name their scan by DRUID, so this is only needed for an
     * analysis of a scan hosted elsewhere.
     */
    scan?: string
}

/**
 * The image service Stanford keeps for a scan, and a crop of a
 * feature from it.
 */
const stanfordScan = (druid: string) => ({
    scan: `https://stacks.stanford.edu/image/iiif/${druid}%2F${druid}_0001/`,
    depictionOf: (column: Pixels, row: Pixels, width: Pixels, height: Pixels) =>
        `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${row},${width},${height}/128,/270/default.jpg`
})

/**
 * The edge tears the analysis found, one condition each. The analysis
 * lists only those that reach deeper into the paper than a tenth of an
 * inch, and measures each by the box around it, so the tear runs across
 * the roll as far as the box is wide.
 */
const tearsIn = (
    tears: AtonTears | undefined,
    dpi: number,
    depictionOf?: (column: Pixels, row: Pixels, width: Pixels, height: Pixels) => string
): Tear[] => {
    const onEdge = (edge: 'bass' | 'treble', listed?: AtonTear | AtonTear[]) =>
        listOf(listed).map((tear): Tear => {
            const row = readPx(tear.ORIGIN_ROW)
            const length = readPx(tear.WIDTH_ROW)
            const column = readPx(tear.ORIGIN_COL)
            const depth = readPx(tear.WIDTH_COL)
            return {
                conditionType: 'torn',
                horizontal: {
                    unit: 'mm',
                    from: inMillimeters(row, dpi),
                    to: inMillimeters(px(row + length), dpi)
                },
                edge,
                depth: { value: inMillimeters(depth, dpi), unit: 'mm' },
                ...(depictionOf && { depiction: depictionOf(column, row, depth, length) })
            }
        })

    return [...onEdge('bass', tears?.BASS_TEARS?.TEAR), ...onEdge('treble', tears?.TREBLE_TEARS?.TEAR)]
        .sort((a, b) => a.horizontal.from - b.horizontal.from)
}

/**
 * The software behind an analysis and the day it was run, as the
 * analysis file states them: the measurement the dimensions and the
 * hole separation it gives rest on.
 */
const measurementOf = (rollinfo: Record<string, string>): Measurement | undefined => {
    const date = new Date(rollinfo.ANALYSIS_DATE)
    if (!rollinfo.HOLE_SOFTWARE || isNaN(date.getTime())) return undefined

    return {
        type: 'measurement',
        software: [{ name: rollinfo.HOLE_SOFTWARE, ...(rollinfo.SOFTWARE_DATE && { version: rollinfo.SOFTWARE_DATE }) }],
        date: assignDate(new Date(date.getFullYear(), date.getMonth(), date.getDate()))
    }
}

/** The value held on the strength of the measurement, where the file names one, and plainly where it does not. */
const takenBy = (measurement: Measurement | undefined) => <O extends object>(value: O): ObjectAssumption<O> =>
    measurement
        ? { ...value, '@annotation': { id: v4(), belief: { type: 'belief', id: v4(), certainty: 'true', reasons: [measurement] } } }
        : value

/**
 * The description of the roll in a parsed analysis. A file that never
 * closes it, as bb988jx6754 of Stanford's archive ends on `@END:` for
 * `@@END:`, is left by the parser standing inside it, and is read all
 * the same. Anything without holes is not an analysis, and is refused
 * by name rather than by whatever reading it would have tripped first.
 */
const rollinfoOf = (parsed: any): any => {
    const rollinfo = parsed?.ROLLINFO ?? parsed
    if (!rollinfo?.HOLES?.HOLE) {
        throw new Error('This is not a roll analysis: it describes no roll with holes (ROLLINFO, HOLES)')
    }
    return rollinfo
}

/**
 * Reads a hole analysis of a scan, in the ATON format of Stanford's
 * SUPRA collection, as a copy of the roll: its chains of holes in
 * millimetres of paper on the bar it was cut for, its edge tears, its
 * dimensions and hole separation as the analysis measured them, and how
 * the scan relates to the bar. A position the bar does not read is left
 * out, as the bar would leave it.
 * @category Sources
 */
export function readFromStanfordAton(
    atonString: string,
    { trackShift, system = welteT100, scan }: StanfordAtonOptions = {}
): RollCopy {
    const rollinfo = rollinfoOf(new AtonParser().parse(atonString))
    const json = { ROLLINFO: rollinfo }

    const holes: AtonHole[] = listOf(rollinfo.HOLES.HOLE)
    const druid: string = json.ROLLINFO.DRUID
    const stanford = druid ? stanfordScan(druid) : undefined
    const separation = readPx(json.ROLLINFO.HOLE_SEPARATION)
    const dpi = parseFloat(json.ROLLINFO.LENGTH_DPI)
    const measured = takenBy(measurementOf(json.ROLLINFO))

    const shift = trackShift ?? calibrationShiftIn(holes, system, json.ROLLINFO)

    const calibration: TrackCalibration = {
        unit: 'px',
        offset: gridOffsetOf(holes, separation, json.ROLLINFO.HOLE_OFFSET),
        separation,
        shift
    }

    const punchDiameter = punchDiameterOf(holes, dpi)

    const chains = chainsAmong([...holes, ...chainedBadHoles(listOf(json.ROLLINFO.BADHOLES?.HOLE), calibration)])


    const features = chains
        .flatMap(({ hole, attack, release }): HoleChain[] => {
            const position = track(+hole.TRACKER_HOLE + shift)
            if (!system.meaningOf(position)) return []

            const column = readPx(hole.ORIGIN_COL)
            const columnWidth = readPx(hole.WIDTH_COL)

            return [{
                type: 'HoleChain',
                id: v4(),
                ...(stanford && {
                    depiction: stanford.depictionOf(column, attack, columnWidth, subtract(release, attack))
                }),
                vertical: {
                    from: position,
                    unit: 'track'
                },
                horizontal: {
                    unit: 'mm',
                    from: inMillimeters(attack, dpi),
                    to: inMillimeters(release, dpi)
                }
            }]
        })

    return {
        type: 'RollCopy',
        id: v4(),
        conditions: tearsIn(json.ROLLINFO.TEARS, dpi, stanford?.depictionOf),
        production: {
            system: systemOf(system),
            ...(punchDiameter !== undefined && {
                perforator: {
                    type: 'Perforator',
                    id: `perforator_${v4()}`,
                    condition: {
                        conditionType: 'setting',
                        punchDiameter: { value: punchDiameter, unit: 'mm' }
                    }
                }
            }),
            produced: features
        },
        modifications: [],
        ...((scan ?? stanford) && { scan: scan ?? stanford?.scan }),
        measurements: {
            dimensions: measured({
                width: inMillimeters(readPx(json.ROLLINFO.ROLL_WIDTH), dpi),
                height: inMillimeters(readPx(json.ROLLINFO.IMAGE_LENGTH), dpi),
                unit: 'mm' as const
            }),
            holeSeparation: measured({
                value: separation,
                unit: 'px' as const
            }),
            margins: {
                treble: readPx(json.ROLLINFO.HARD_MARGIN_TREBLE),
                bass: readPx(json.ROLLINFO.HARD_MARGIN_BASS),
                unit: 'px'
            },
            ...(Number.isFinite(dpi) && {
                scanResolution: { value: pixelsPerInch(dpi), unit: 'px/in' }
            }),
            trackCalibration: calibration
        }
    }
}
