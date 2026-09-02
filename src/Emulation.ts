import { AnyEvent, MidiFile } from "midifile-ts";
import {
    aperturePorts,
    DAMPER_CC,
    DEFAULT_PUNCH_MM,
    geometryInMm,
    Grid,
    levelChanges,
    mezzoforteTravel,
    noteDensity,
    paperSeconds,
    pedalDefaults,
    playbackParameters,
    pneumaticModel,
    ROWS_PER_MM,
    runPedals,
    SOFT_CC,
    TRACKER_BORE_MM,
    travelBetweenRails,
    WELTE_SPOOL,
    Action,
    Control,
    Half,
    Parameters,
    PedalMode,
    Punch,
    Spool,
} from "welte-t100-emulator";
import { Expression, ExpressionScope, ExpressionType, Note } from "./Symbol";
import { welteT100 } from "./TrackerBar";
import { Version } from "./Version";
import { Hole } from "./Feature";
import { EditionView } from "./EditionView";
import { ValueAssumption, valueOf } from "./Assumption";

interface PerformedRollFeature<T> {
    type: T
    performs: NegotiatedEvent
    /** Seconds from the start of the emulation. */
    at: number
}

interface PerformedNoteEvent<T> extends PerformedRollFeature<T> {
    pitch: number;
    velocity: number;
}

export interface PerformedNoteOnEvent extends PerformedNoteEvent<'noteOn'> { }
export interface PerformedNoteOffEvent extends PerformedNoteEvent<'noteOff'> { }

/**
 * One step of a pedal controller. A pedal is a bellows and takes time to
 * travel, so a single perforation results in a run of these; `performs` is
 * the perforation whose reading the step follows from.
 */
export interface PerformedPedalEvent extends PerformedRollFeature<'damper' | 'hammerRail'> {
    /** Controller value, 0 with the pedal up and 127 with it fully down. */
    value: number
}

export type AnyPerformedRollFeature =
    PerformedNoteOnEvent |
    PerformedNoteOffEvent |
    PerformedPedalEvent

export type NegotiatedEvent =
    Omit<Note | Expression, 'carriers'>
    & Pick<Hole, 'horizontal' | 'vertical'>

/**
 * MIDI velocity at the open rail of the Nuancierbalg, at the Mezzoforte pin,
 * and at the closed rail, joined linearly in between. Nothing in the
 * mechanism determines how bellows travel maps onto hammer velocity, so
 * these are anchors rather than measurements; the three values are the
 * ones midi2exp publishes.
 */
export type VelocityMap = {
    piano: number
    mezzoforte: number
    forte: number
}

export type EmulationOptions = {
    /**
     * The take-up spool, which sets the time axis: it is held at a constant
     * rate of revolution, so the paper runs faster as the spool fills.
     */
    spool: Spool

    /** Constants of the nuancing mechanism, one set for each half of the keyboard. */
    nuance: Record<Half, Parameters>

    /** Constants of the two pedal actions. */
    pedals: Parameters

    velocity: VelocityMap

    /**
     * How the pedals go out: as a continuous controller carrying the travel
     * of the bellows, or thresholded to the two values a switching renderer
     * understands.
     */
    pedalMode: PedalMode

    /** Diameter of the tracker-bar bore, in mm. */
    trackerBore: number

    /** Punch diameter in mm, for an edition whose copies record none. */
    punchDiameter: number

    /**
     * The track at which the keyboard is divided, so that notes from
     * here upwards follow the treble expression and the ones below it
     * the bass. Which side an expression perforation itself belongs to
     * is not decided here but read off the tracker bar.
     */
    division: number
}

export const defaultEmulationOptions: EmulationOptions = {
    spool: WELTE_SPOOL,
    nuance: {
        bass: playbackParameters('bass'),
        treble: playbackParameters('treble')
    },
    pedals: pedalDefaults,
    velocity: { piano: 35, mezzoforte: 60, forte: 90 },
    pedalMode: 'continuous',
    trackerBore: TRACKER_BORE_MM,
    punchDiameter: DEFAULT_PUNCH_MM,
    division: 54
}

/** One curve of the mechanism, sampled along the roll. */
export type EmulatedCurve = {
    /** Paper position of each sample, in mm from the beginning of the roll. */
    readonly place: Float64Array
    readonly seconds: Float64Array
    /**
     * Position between the two ends of the travel: 0 with the bellows open
     * and 1 with it closed, 0 with a pedal up and 1 with it down.
     */
    readonly travel: Float64Array
}

export type NuanceCurve = EmulatedCurve & {
    readonly velocity: Float64Array
}

export type EmulatedCurves = {
    readonly nuance: Record<Half, NuanceCurve>
    readonly pedals: {
        readonly damper: EmulatedCurve
        readonly hammerRail: EmulatedCurve
    }
}

export type EmulationScope = {
    /** Only notes whose onset lies within this span of the roll, in mm, are played. */
    range?: [number, number]

    /** Start the clock at the first note rather than at the beginning of the roll. */
    skipToFirstNote?: boolean
}

/** What each expression code operates, in the emulator's terms. */
const CODES: ReadonlyMap<ExpressionType, readonly [Control, Action]> = new Map([
    ['MezzoforteOn', ['mezzoforte', 'on']],
    ['MezzoforteOff', ['mezzoforte', 'off']],
    ['SlowCrescendoOn', ['crescendo', 'on']],
    ['SlowCrescendoOff', ['crescendo', 'off']],
    ['ForzandoOn', ['sforzando', 'on']],
    ['ForzandoOff', ['sforzando', 'off']],
    ['SustainPedalOn', ['sustainPedal', 'on']],
    ['SustainPedalOff', ['sustainPedal', 'off']],
    ['SoftPedalOn', ['hammerRail', 'on']],
    ['SoftPedalOff', ['hammerRail', 'off']],
    ['MotorOn', ['windResistance', 'on']],
    ['MotorOff', ['windResistance', 'off']],
    ['Rewind', ['rewind', 'on']],
    ['ElectricCutOff', ['electricCutoff', 'on']]
])

/** Paper the grid runs on past the last hole, so that a final pedal release completes. */
const RUN_OUT_MM = 100

/**
 * Which stack of valves an expression perforation belongs to. The symbol
 * usually says so, having been read off the tracker bar already; where it
 * does not, the bar is asked again, since sending a perforation to neither
 * side would quietly flatten the dynamics.
 */
const scopeOf = (
    event: { scope?: ExpressionScope } & Pick<Hole, 'vertical'>
): ExpressionScope | undefined => {
    if (event.scope) return event.scope

    const meaning = welteT100.meaningOf(event.vertical.from)
    return meaning?.type === 'expression' ? meaning.scope : undefined
}

const isNote = (event: NegotiatedEvent): event is NegotiatedEvent & Note => event.type === 'note'
const isExpression = (event: NegotiatedEvent): event is NegotiatedEvent & Expression => event.type === 'expression'

const rowOf = (mm: number) => mm * ROWS_PER_MM

/** A perforation as the tracker bar meets it, kept with the symbol it carries. */
type Reading = {
    readonly event: NegotiatedEvent & Expression
    readonly punch: Punch
}

const readingOf = (event: NegotiatedEvent & Expression): Reading | undefined => {
    const code = CODES.get(event.expressionType)
    const half = scopeOf(event)
    if (!code || !half) return undefined

    const [control, action] = code
    return {
        event,
        punch: { half, control, action, rowOn: rowOf(event.horizontal.from), rowOff: rowOf(event.horizontal.to) }
    }
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/**
 * The velocity map joined linearly through its three anchors, with the
 * middle one at the Mezzoforte pin of the half in question.
 */
const velocityOf = (travel: number, hook: number, map: VelocityMap): number => {
    const position = clamp(travel, 0, 1)
    if (position <= hook) {
        return map.piano + (position / hook) * (map.mezzoforte - map.piano)
    }
    return map.mezzoforte + ((position - hook) / (1 - hook)) * (map.forte - map.mezzoforte)
}

/** The punch diameter the edition's copies report, where any of them does. */
const punchDiameterOf = (view: EditionView, fallback: number): number => {
    const measured = view.edition.copies
        .map(copy => copy.measurements.punchDiameter)
        .filter((diameter): diameter is { value: number, unit: string } => diameter !== undefined && diameter.value > 0)
        .map(diameter => diameter.value)
    if (measured.length === 0) return fallback
    return measured.reduce((sum, value) => sum + value, 0) / measured.length
}

export class Emulation {
    midiEvents: AnyPerformedRollFeature[] = []

    // sorted list of events with the negotiated assumptions already applied
    negotiatedEvents: NegotiatedEvent[] = []

    curves?: EmulatedCurves

    source?: string

    options: EmulationOptions

    constructor(options: EmulationOptions = defaultEmulationOptions) {
        this.options = options
    }

    /** When the spool brings a place on the roll, in mm, to the tracker bar. */
    secondsAt(mm: number): number {
        return paperSeconds(this.options.spool, mm / 10)
    }

    applyConstraints() {
        this.negotiatedEvents
            .filter((e): e is NegotiatedEvent & { alignedWith: ValueAssumption<string> } => e.alignedWith !== undefined)
            .forEach(e => {
                const ref = this.negotiatedEvents.find(ev => ev.id === valueOf(e.alignedWith));
                if (!ref) return;

                const distance = ref.horizontal.from - e.horizontal.from;
                e.horizontal.from += distance;
                e.horizontal.to += distance;
            })
    }

    emulateVersion(
        version: Version,
        view: EditionView,
        { range, skipToFirstNote = false }: EmulationScope = {}
    ) {
        this.source = version.id

        this.negotiatedEvents =
            view.snapshot(version.id)
                .filter(s => s.type === 'note' || s.type === 'expression')
                .filter(s => {
                    if (range && s.type === 'note') {
                        const dimensions = view.dimensionOf(s)
                        if (!dimensions) return true // in case of doubt, include the note

                        // check if the note onset is within the specified range
                        const onset = dimensions.horizontal.from
                        return onset > range[0] && onset < range[1]
                    }
                    return true
                })
                .map((e) => view.simplifySymbol(e))
                .filter(s => s !== null)

        if (this.negotiatedEvents.length === 0) {
            this.midiEvents = []
            return this.midiEvents
        }

        this.applyConstraints();

        const readings = this.negotiatedEvents
            .filter(isExpression)
            .map(readingOf)
            .filter((reading): reading is Reading => reading !== undefined)
        const grid = this.gridOver(this.negotiatedEvents)
        const geometry = geometryInMm(punchDiameterOf(view, this.options.punchDiameter), this.options.trackerBore)
        const ports = aperturePorts(grid, readings.map(reading => reading.punch), geometry)

        this.curves = {
            nuance: this.emulateNuance(grid, ports),
            pedals: this.emulatePedals(grid, ports)
        }

        const performed = [
            ...this.performNotes(grid),
            ...this.performPedal('damper', this.curves.pedals.damper, grid, readings.filter(r => r.punch.control === 'sustainPedal')),
            ...this.performPedal('hammerRail', this.curves.pedals.hammerRail, grid, readings.filter(r => r.punch.control === 'hammerRail'))
        ]

        const firstNote = this.negotiatedEvents.find(isNote)
        const origin = skipToFirstNote && firstNote ? this.secondsAt(firstNote.horizontal.from) : 0

        this.midiEvents = performed
            .map(event => ({ ...event, at: event.at - origin }))
            .filter(event => event.at >= 0)
            .sort((a, b) => a.at - b.at)
        return this.midiEvents
    }

    /**
     * One sample per row of the scan the constants were fitted on, from the
     * beginning of the roll to a little past the last hole. The rows are
     * equally spaced on the paper and not in time, which is what the
     * emulator expects.
     */
    private gridOver(events: readonly NegotiatedEvent[]): Grid {
        const lastMm = events.reduce((furthest, event) => Math.max(furthest, event.horizontal.to), 0)
        const length = Math.ceil(rowOf(lastMm + RUN_OUT_MM)) + 1
        const seconds = Float64Array.from({ length }, (_, row) => this.secondsAt(row / ROWS_PER_MM))
        return new Grid(0, seconds)
    }

    private emulateNuance(grid: Grid, ports: ReturnType<typeof aperturePorts>): Record<Half, NuanceCurve> {
        const onsetRows = (half: Half) =>
            this.negotiatedEvents
                .filter(isNote)
                .filter(note => this.halfOf(note) === half)
                .map(note => rowOf(note.horizontal.from))
        const density = {
            bass: noteDensity(grid, onsetRows('bass')),
            treble: noteDensity(grid, onsetRows('treble')),
        }
        const totalNoteDensity = Float64Array.from(density.bass, (value, index) => value + density.treble[index])
        const place = Float64Array.from(grid.seconds, (_, row) => row / ROWS_PER_MM)

        const curveOf = (half: Half): NuanceCurve => {
            const params = this.options.nuance[half]
            const output = pneumaticModel.run(
                { grid, half, ports, noteDensity: density[half], totalNoteDensity },
                params
            )
            const travel = travelBetweenRails(output, params)
            const hook = clamp(mezzoforteTravel(params), 0.01, 0.99)
            return {
                place,
                seconds: grid.seconds,
                travel,
                velocity: Float64Array.from(travel, value => velocityOf(value, hook, this.options.velocity))
            }
        }

        return { bass: curveOf('bass'), treble: curveOf('treble') }
    }

    private emulatePedals(grid: Grid, ports: ReturnType<typeof aperturePorts>): EmulatedCurves['pedals'] {
        const travel = runPedals({ grid, ports }, this.options.pedals)
        const place = Float64Array.from(grid.seconds, (_, row) => row / ROWS_PER_MM)
        return {
            damper: { place, seconds: grid.seconds, travel: travel.damper },
            hammerRail: { place, seconds: grid.seconds, travel: travel.hammerRail }
        }
    }

    private halfOf(note: NegotiatedEvent): Half {
        return note.vertical.from >= this.options.division ? 'treble' : 'bass'
    }

    private performNotes(grid: Grid): (PerformedNoteOnEvent | PerformedNoteOffEvent)[] {
        return this.negotiatedEvents
            .filter(isNote)
            .flatMap((note): (PerformedNoteOnEvent | PerformedNoteOffEvent)[] => {
                const curve = this.curves!.nuance[this.halfOf(note)]
                const velocity = curve.velocity[grid.indexOfRow(rowOf(note.horizontal.from))]
                return [
                    { type: 'noteOn', performs: note, pitch: note.pitch, velocity, at: this.secondsAt(note.horizontal.from) },
                    { type: 'noteOff', performs: note, pitch: note.pitch, velocity: 127, at: this.secondsAt(note.horizontal.to) }
                ]
            })
    }

    /**
     * The travel of one pedal as controller steps. Each step is attributed to
     * the last perforation of that pedal the tracker bar has reached, which is
     * the one whose reading it follows from.
     */
    private performPedal(
        type: PerformedPedalEvent['type'],
        curve: EmulatedCurve,
        grid: Grid,
        readings: readonly Reading[]
    ): PerformedPedalEvent[] {
        if (readings.length === 0) return []

        const ordered = readings.toSorted((a, b) => a.punch.rowOn - b.punch.rowOn)
        const causeOf = (row: number): NegotiatedEvent =>
            ordered[Math.max(ordered.findLastIndex(reading => reading.punch.rowOn <= row), 0)].event

        return levelChanges(curve.travel, { mode: this.options.pedalMode })
            .filter(change => change.index > 0)
            .map(change => ({
                type,
                performs: causeOf(grid.rowAt(change.index)),
                value: change.value,
                at: curve.seconds[change.index]
            }))
    }

    findEventsPerforming(id: string) {
        return this.midiEvents.filter(event => event.performs.id === id)
    }

    asMIDI(): MidiFile {
        const TICKS_PER_SECOND = 1000
        const events: AnyEvent[] = []
        this.midiEvents.sort((a, b) => a.at - b.at)

        const text = (text: string, deltaTime = 0): AnyEvent => ({ type: 'meta', subtype: 'text', text, deltaTime })
        const controller = (controllerType: number, value: number, deltaTime = 0): AnyEvent =>
            ({ type: 'channel', subtype: 'controller', controllerType, value, deltaTime, channel: 0 })
        const controllerOf = (event: PerformedPedalEvent) => event.type === 'damper' ? DAMPER_CC : SOFT_CC

        events.push(text('linked-rolls (welte-t100-emulator)'))
        if (this.source) {
            events.push(text(this.source))
        }
        for (const [key, value] of Object.entries(this.options)) {
            events.push(text(`${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`))
        }

        events.push({
            type: 'meta',
            subtype: 'setTempo',
            microsecondsPerBeat: 1000000,
            deltaTime: 0
        })

        // both pedals start at rest
        events.push(controller(DAMPER_CC, 0), controller(SOFT_CC, 0))

        // a pedal step is labelled with its perforation only where that
        // perforation changes, so the file is not swamped with labels
        const lastCause: Partial<Record<PerformedPedalEvent['type'], string>> = {}

        let currentTick = 0
        for (const event of this.midiEvents) {
            const tick = Math.round(event.at * TICKS_PER_SECOND)
            const deltaTime = tick - currentTick
            currentTick = tick

            if (event.type === 'noteOn') {
                events.push(text(event.performs.id, deltaTime))
                events.push({
                    type: 'channel',
                    subtype: 'noteOn',
                    noteNumber: event.pitch,
                    velocity: +event.velocity.toFixed(0),
                    deltaTime: 0,
                    channel: 0
                })
            }
            else if (event.type === 'noteOff') {
                events.push({
                    type: 'channel',
                    subtype: 'noteOff',
                    noteNumber: event.pitch,
                    velocity: 127,
                    deltaTime,
                    channel: 0
                })
            }
            else {
                const labelled = lastCause[event.type] === event.performs.id
                lastCause[event.type] = event.performs.id
                if (!labelled) {
                    events.push(text(event.performs.id, deltaTime))
                }
                events.push(controller(controllerOf(event), event.value, labelled ? deltaTime : 0))
            }
        }

        return {
            header: {
                ticksPerBeat: TICKS_PER_SECOND,
                formatType: 0,
                trackCount: 1
            },
            tracks: [events]
        }
    }
}
