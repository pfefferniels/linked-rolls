import { v4 } from "uuid";
import { AtonParser } from "./AtonParser";
import { Hole } from "../Feature";
import { RollCopy } from "../RollCopy";
import { TrackCalibration } from "../TrackCalibration";
import { TrackerBar } from "../TrackerBar";
import { welteT100 } from "../systems/welteT100/bar";

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

/** Values in these files carry their unit as a suffix, e.g. "37.7646px". */
const px = (value: string) => parseFloat(value)

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
            TRACKER_HOLE: `${Math.round((px(hole.CENTROID_COL) - calibration.offset) / calibration.separation)}`
        }))

const millimeters = (pixels: number, dpi: number) => pixels / dpi * 25.4

const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

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
 * final musical attack sit on is the rewind track.
 */
const rewindTrackIn = (holes: AtonHole[]) => {
    const lastMusical = holes.findLastIndex(hole => hole.NOTE_ATTACK)
    const trailing = holes.slice(lastMusical + 1).map(hole => +hole.TRACKER_HOLE)
    return mostFrequent(trailing)
}

/**
 * The phase of the tracker grid within the image. The analysis file
 * usually states it; where it does not, the holes themselves give it away,
 * since each sits close to the centre of its column.
 */
const gridOffsetOf = (holes: AtonHole[], separation: number, stated?: string) => {
    if (stated !== undefined) return px(stated)

    return median(holes.map(hole => px(hole.CENTROID_COL) - +hole.TRACKER_HOLE * separation))
}

const punchDiameterOf = (holes: AtonHole[], dpi: number) => {
    const circular = holes
        .filter(hole => px(hole.CIRCULARITY) > 0.95)
        .map(hole => millimeters(px(hole.PERIMETER), dpi) / Math.PI)

    if (!circular.length) return undefined

    return circular.reduce((sum, diameter) => sum + diameter, 0) / circular.length
}

export interface StanfordAtonOptions {
    /**
     * Added to the scanning software's hole numbering to reach the
     * tracker bar. Left out, it is inferred by putting the rewind
     * perforation on the bar's rewind track.
     */
    trackShift?: number

    bar?: TrackerBar

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
    depictionOf: (column: number, row: number, width: number, height: number) =>
        `https://stacks.stanford.edu/image/iiif/${druid}/${druid}_0001/${column},${row},${width},${height}/128,/270/default.jpg`
})

/**
 * The software behind an analysis and when it was run, as the
 * analysis file states them.
 */
const measuredByOf = (rollinfo: Record<string, string>) => {
    const date = new Date(rollinfo.ANALYSIS_DATE)
    if (!rollinfo.HOLE_SOFTWARE || isNaN(date.getTime())) return undefined

    return {
        software: rollinfo.HOLE_SOFTWARE,
        version: rollinfo.SOFTWARE_DATE ?? '',
        date
    }
}

export function readFromStanfordAton(
    atonString: string,
    { trackShift, bar = welteT100, scan }: StanfordAtonOptions = {}
): RollCopy {
    const parser = new AtonParser()
    const json = parser.parse(atonString)

    const holes: AtonHole[] = json.ROLLINFO.HOLES.HOLE
    const druid: string = json.ROLLINFO.DRUID
    const stanford = druid ? stanfordScan(druid) : undefined
    const separation = px(json.ROLLINFO.HOLE_SEPARATION)
    const dpi = parseFloat(json.ROLLINFO.LENGTH_DPI)
    const measuredBy = measuredByOf(json.ROLLINFO)

    const rewindTrack = rewindTrackIn(holes)
    const shift = trackShift
        ?? (rewindTrack === undefined ? 0 : bar.rewindTrack - rewindTrack)

    const calibration: TrackCalibration = {
        unit: 'px',
        offset: gridOffsetOf(holes, separation, json.ROLLINFO.HOLE_OFFSET),
        separation,
        shift
    }

    const punchDiameter = punchDiameterOf(holes, dpi)

    const chains = [...holes, ...chainedBadHoles(listOf(json.ROLLINFO.BADHOLES?.HOLE), calibration)]
        .filter(hole => hole.NOTE_ATTACK && hole.OFF_TIME)
        .sort((a, b) => px(a.NOTE_ATTACK!) - px(b.NOTE_ATTACK!))

    const features = chains
        .map((hole): Hole => {
            const attack = px(hole.NOTE_ATTACK!)
            const release = px(hole.OFF_TIME!)
            const column = px(hole.ORIGIN_COL)
            const columnWidth = px(hole.WIDTH_COL)

            return {
                type: 'Hole',
                id: v4(),
                ...(stanford && {
                    depiction: stanford.depictionOf(column, attack, columnWidth, release - attack)
                }),
                vertical: {
                    from: +hole.TRACKER_HOLE + shift,
                    unit: 'track'
                },
                horizontal: {
                    unit: 'mm',
                    from: millimeters(attack, dpi),
                    to: millimeters(release, dpi)
                }
            }
        })

    return {
        type: 'RollCopy',
        id: v4(),
        ops: [],
        conditions: [],
        keeper: { name: '', sameAs: [] },
        modifications: [],
        ...((scan ?? stanford) && { scan: scan ?? stanford?.scan }),
        measurements: {
            dimensions: {
                width: millimeters(px(json.ROLLINFO.ROLL_WIDTH), dpi),
                height: millimeters(px(json.ROLLINFO.IMAGE_LENGTH), dpi),
                unit: 'mm'
            },
            ...(punchDiameter !== undefined && {
                punchDiameter: { value: punchDiameter, unit: 'mm' }
            }),
            holeSeparation: {
                value: separation,
                unit: 'px'
            },
            margins: {
                treble: px(json.ROLLINFO.HARD_MARGIN_TREBLE),
                bass: px(json.ROLLINFO.HARD_MARGIN_BASS),
                unit: 'px'
            },
            trackCalibration: calibration,
            ...(measuredBy && { measuredBy })
        },
        features
    }
}

