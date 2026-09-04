import { AtonParser } from "./aton/AtonParser";
import { v4 } from "uuid";
import { ConditionState } from "./ConditionState";
import { AnySymbol } from "./Symbol";
import { read } from "midifile-ts";
import { asSpans } from "./asMIDISpans";
import { TrackerBar, welteT100 } from "./TrackerBar";
import { TrackCalibration } from "./TrackCalibration";
import { AnyFeature, Hole } from "./Feature";
import { assignReference, idsOf, ObjectAssumption, ValueAssumption } from "./Assumption";
import { WithId, WithType } from "./utils";
import { ActorAssignment } from "./Edit";

/**
 * This condition state is used to describe the roll's
 * paper shrinkage or stretching. It might be calculated
 * on the basis of comparing the vertical or horizontal
 * extent with other witnesses of the same roll.
 */
export interface PaperStretch extends ConditionState<'paper-stretch'> {
    /**
     * The stretch factor, e.g. 1.02 means the paper has
     * stretched by 2% compared to its original dimensions.
     * @see rdf:value
     */
    factor: number
}

/**
 * A general condition description for a roll copy, e.g.
 * overall wear, discoloration, or other observations.
 * @see crm:E3 Condition State
 */
export interface GeneralRollCondition extends ConditionState<'general'> { }

/**
 * An assignment of a condition (general or paper-stretch)
 * to a roll copy, annotatable with a belief about its certainty.
 */
export type RollConditionAssignment = ObjectAssumption<GeneralRollCondition | PaperStretch>

export const rollConditions = [
    'general',
    'paper-stretch'
] as const

/**
 * A shift correction applied to a roll copy to align it
 * with other copies. The shift is defined as horizontal
 * (along the roll length, in mm) and vertical (across tracks).
 */
export interface Shift {
    /**
     * Horizontal shift in millimeters (along the roll length).
     */
    horizontal: number

    /**
     * Vertical shift in track numbers (across the tracker bar).
     */
    vertical: number
}

export const applyShift = (shift: Shift, copy: RollCopy) => {
    if (copy.ops.includes('shifted')) return

    const to = copy.features
    for (const event of to) {
        event.horizontal.from += shift.horizontal
        if (event.horizontal.to) {
            event.horizontal.to += shift.horizontal
        }

        event.vertical.from += shift.vertical
        if (event.vertical.to) {
            event.vertical.to += shift.vertical
        }
    }
    copy.ops = [...copy.ops, 'shifted']
    copy.measurements.shift = shift
}

export const applyStretch = (
    paperStretch: ObjectAssumption<PaperStretch>,
    copy: RollCopy
) => {
    if (copy.ops.includes('stretched')) return

    const stretch = paperStretch.factor
    const to = copy.features
    for (const event of to) {
        event.horizontal.from *= stretch
        if (event.horizontal.to) {
            event.horizontal.to *= stretch
        }
    }
    copy.ops = [...copy.ops, 'stretched']
    copy.conditions.push(paperStretch)
}

/**
 * A date value wrapped as an assumption, so that the date
 * can be annotated with a belief about its certainty and source.
 */
export type DateAssignment = ValueAssumption<Date> & {
    /**
     * The datatype of the value. Written on export so that
     * RDF reads the value as a date rather than a string.
     */
    '@type'?: 'xsd:date'
}

/**
 * Describes the production of a roll copy, including the
 * manufacturing company, the roll system, and the paper used.
 * @see lrmoo:F32 Item Production Event
 */
export interface ProductionEvent {
    /**
     * The company that produced the roll copy
     * (e.g. "M. Welte & Söhne").
     * @see crm:P14 carried out by
     */
    company: string

    /**
     * The roll system used for production
     * (e.g. "Welte-Mignon T100", "Welte-Mignon T98").
     * @see crm:P32 used general technique
     */
    system: string

    /**
     * The paper type used for the roll copy.
     * @see crm:P126 employed
     */
    paper: string

    /**
     * The date of production, if known.
     * @see dcterms:date
     */
    date?: DateAssignment
}

/**
 * This type denotes identifiable activities that modified
 * the roll copy after its production, e.g. annotations, repairs,
 * etc.
 * @see crm:E79 Part Addition, crm:E80 Part Removal
 */
export type Modification = Partial<{
    /**
     * Who carried out the modification.
     * @see crm:P14 carried out by
     */
    actor: ActorAssignment
    /**
     * When the modification took place.
     * @see dcterms:date
     */
    date: DateAssignment
}> & ({
    type: 'Addition',

    /**
     * @see crm:P111 added
     */
    added: string[],

    /**
     * @see crm:P21 had general purpose
     */
    purpose:
    'musical-improvement' |
    'technical-improvement' |
    'repair' |
    'labeling' |
    'control' |
    'dating' |
    'glossing'

} | {
    type: 'Removal',

    /**
     * @see crm:P113 removed
     */
    removed: string[],

    /**
     * Usually, roll features are being added.
     * Sometimes however, we may see traces of features
     * that have been removed, e.g. through bright spots on
     * the roll.
     * @see crm:P21 had general purpose
     */
    purpose: 'delabeling'
})

/**
 * A physical copy of a roll, held at a specific location.
 * Each roll copy has its own set of features, measurements,
 * conditions, and modifications. Multiple copies of the same
 * roll may exist across different archives or collections.
 * @see lrmoo:F5 Item
 */
export interface RollCopy extends WithType<'RollCopy'>, WithId {
    /**
     * A list of operations that have been applied to this copy's features
     * (e.g. 'shifted', 'stretched') to normalize measurements
     * for comparison with other copies. Not exported to RDF.
     */
    ops: Array<'shifted' | 'stretched'>

    /**
     * Physical measurements of this roll copy, including
     * dimensions, punch diameter, hole separation, margins,
     * shift corrections, and information about the measuring software.
     * @see crm:P39i was measured by
     */
    measurements: Partial<{
        /**
         * The physical dimensions of the roll.
         * @see reo:dimensions
         */
        dimensions: {
            /**
             * The width of the roll in the given unit.
             * @see reo:width
             */
            width: number,
            /**
             * The total height (length) of the roll in the given unit.
             * @see reo:height
             */
            height: number,
            /**
             * The unit of measurement (e.g. 'mm').
             * @see crm:P91 has unit
             */
            unit: string
        }

        /**
         * The average diameter of punched holes.
         * @see reo:punchDiameter
         */
        punchDiameter: {
            /**
             * The measured punch diameter value.
             * @see crm:P90 has value
             */
            value: number
            /**
             * The unit of measurement (e.g. 'mm').
             * @see crm:P91 has unit
             */
            unit: string
        }

        /**
         * The distance between adjacent tracker bar holes.
         * @see reo:holeSeparation
         */
        holeSeparation: {
            /**
             * The measured hole separation value.
             * @see crm:P90 has value
             */
            value: number
            /**
             * The unit of measurement (e.g. 'px', 'mm').
             * @see crm:P91 has unit
             */
            unit: string
        }

        /**
         * The margins on the treble and bass sides of the roll.
         * Not exported to RDF.
         */
        margins: {
            /**
             * The margin on the treble side.
             */
            treble: number
            /**
             * The margin on the bass side.
             */
            bass: number
            /**
             * The unit of measurement (e.g. 'px', 'mm').
             */
            unit: string
        }

        /**
         * The shift applied to align this copy with the others.
         * Not exported to RDF.
         */
        shift: Shift

        /**
         * Relates this copy's scan to the tracker bar: how the scanning
         * software's hole numbering was shifted onto the bar, and where
         * the track grid sits in the image. Not exported to RDF.
         */
        trackCalibration: TrackCalibration

        /**
         * Information about the software used to take the measurements.
         * @see crmdig:L23 used software or firmware
         */
        measuredBy: {
            /**
             * The name of the measurement software.
             * @see rdfs:label
             */
            software: string,
            /**
             * The version of the measurement software.
             * @see owl:versionInfo
             */
            version: string
            /**
             * The date on which the measurements were taken.
             * @format date
             * @see dcterms:date
             */
            date: Date
        }
    }>

    /**
     * The production event that created this roll copy.
     * @see lrmoo:R28i was produced by
     */
    production?: ProductionEvent

    /**
     * Condition assessments of this roll copy (e.g. paper stretch,
     * general wear). Each condition is an assumption annotatable
     * with a belief.
     * @see crm:P44 has condition
     */
    conditions: RollConditionAssignment[]

    /**
     * The current physical location or archive where this copy is held.
     * @see crm:P55 has current location
     */
    location: string

    /**
     * The physical features found on this copy, with shift
     * and stretch already applied when `ops` says so.
     * @see crm:P56 bears feature
     */
    features: AnyFeature[]

    /**
     * @see crm:P31i was modified by
     */
    modifications: Modification[]

    /**
     * The scan URL or IIIF URL of the roll.
     * @see crm:P138i has representation
     */
    scan?: string
}

/**
 * Reads the features of a copy as the tracker bar would read them.
 * Holes on a position the bar does not read carry no symbol and are
 * dropped, which is what happens physically as well.
 */
export function asSymbols(
    features: AnyFeature[],
    bar: TrackerBar = welteT100
): AnySymbol[] {
    return features
        .filter(feature => feature.type === 'Hole')
        .flatMap((feature): AnySymbol[] => {
            const meaning = bar.meaningOf(feature.vertical.from)
            if (!meaning) return []

            return [{
                id: `symbol_${v4()}`,
                ...meaning,
                carriers: [assignReference(feature.id)]
            }]
        })
}

/**
 * The tracks a copy carries holes on that the tracker bar does not read.
 * A non-empty result usually means the scan is calibrated wrongly.
 */
export function unreadTracks(
    features: AnyFeature[],
    bar: TrackerBar = welteT100
): Map<number, number> {
    const counts = new Map<number, number>()
    features
        .filter(feature => feature.type === 'Hole')
        .filter(feature => !bar.meaningOf(feature.vertical.from))
        .forEach(feature => {
            const track = feature.vertical.from
            counts.set(track, (counts.get(track) || 0) + 1)
        })
    return counts
}

/**
 * Falls back to the way the scan geometry was reconstructed before the
 * calibration was recorded: the bass hard margin stood in for the phase
 * of the tracker grid, with a constant making up most of the difference.
 *
 * The constant of one and a half tracks is the one the facsimile tiles
 * were laid out with, and on the rolls measured so far it comes within
 * about a quarter of a track. It is kept for copies imported before the
 * calibration was written down; anything read since carries its own.
 */
export const calibrationOf = (copy: RollCopy): TrackCalibration | undefined => {
    if (copy.measurements.trackCalibration) {
        return copy.measurements.trackCalibration
    }

    const separation = copy.measurements.holeSeparation?.value
    const bassMargin = copy.measurements.margins?.bass
    if (separation === undefined || bassMargin === undefined) return undefined

    return {
        unit: 'px',
        offset: bassMargin + 1.5 * separation,
        separation,
        shift: 0
    }
}

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
        location: '',
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

/**
 * How a MIDI key number in one of Spencer Chase's roll files names a
 * tracker bar track.
 *
 * The note block follows the obvious rule, `pitch - 13`, which puts
 * track 11 on MIDI 24 as the T100 compass requires. The bass expression
 * block does not: it reads two tracks high, and subtracting two is what
 * has made these files come out right so far.
 *
 * The boundary between the two rules is unresolved. Taken literally the
 * rules leave tracks 8 and 9 unreachable and jump from track 7 to track 10,
 * which no lateral offset can produce, so at least one of them is
 * approximate. Settling it needs a Spencer file whose expression holes
 * can be checked against the roll, hence the option to override.
 */
export const spencerTrackOf = (pitch: number) => {
    const track = pitch - 13
    return track < 10 ? track - 2 : track
}

const MM_PER_FOOT = 304.8

/**
 * Spencer Chase's rolls seem to be scanned at a roll speed of
 * 83 (=8.3 feet per minute). A scanner feeds the paper at one
 * speed, so time in his files is proportional to place.
 */
export const SPENCER_FEET_PER_MINUTE = 8.3

/** Place on the roll in mm after `seconds` at a constant `feetPerMinute`. */
export const atConstantSpeed = (feetPerMinute: number) =>
    (seconds: number): number => feetPerMinute * MM_PER_FOOT / 60 * seconds

export function readFromSpencerMIDI(
    midiBuffer: ArrayBuffer,
    placeAt: (seconds: number) => number = atConstantSpeed(SPENCER_FEET_PER_MINUTE),
    trackOf: (pitch: number) => number = spencerTrackOf
): RollCopy {
    const features = asSpans(read(midiBuffer))
        .filter(span => span.type === 'note')
        .map((span): Hole => ({
            type: 'Hole',
            id: v4(),
            vertical: {
                from: trackOf(span.pitch),
                unit: 'track'
            },
            horizontal: {
                from: placeAt(span.onsetMs / 1000),
                to: placeAt(span.offsetMs / 1000),
                unit: 'mm'
            }
        }))

    return {
        type: 'RollCopy',
        id: v4(),
        ops: [],
        conditions: [],
        location: '',
        measurements: {},
        modifications: [],
        features
    }
}

/**
 * Moves features across the tracker bar. What the new position means is
 * left to the tracker bar to say, since meaning belongs to the symbols
 * read off a copy rather than to the holes themselves.
 */
export function shiftVertically(features: AnyFeature[], amount: number) {
    features.forEach(feature => {
        feature.vertical.from += amount
        if (feature.vertical.to !== undefined) {
            feature.vertical.to += amount
        }
    })
}

export const findCopiesCarrying = (sources: RollCopy[], symbol: AnySymbol) => {
    const result: Set<string> = new Set()

    for (const feature of idsOf(symbol.carriers)) {
        for (const copy of sources) {
            if (copy.features.findIndex(f => f.id === feature)) {
                result.add(copy.id)
            }
        }
    }
    return result
}