import { AnyEvent, MIDIControlEvents, MidiFile } from "midifile-ts";
import { idOf } from "./Assumption";
import { EditionView } from "./EditionView";
import { pairsAmong } from "./Symbol";
import { Version } from "./Version";
import {
    AnyPerformedRollFeature,
    EmulatedCurve,
    NegotiatedEvent,
    PerformedPedalEvent,
    ReproducingSystem,
    RollProperties
} from "./ReproducingSystem";

export type EmulationScope = {
    /** Only notes whose onset lies within this span of the roll, in mm, are played. */
    range?: [number, number]

    /** Start the clock at the first note rather than at the beginning of the roll. */
    skipToFirstNote?: boolean
}

/** The punch diameter the edition's copies report, where any of them does. */
const punchDiameterOf = (view: EditionView): number | undefined => {
    const measured = view.edition.copies
        .map(copy => copy.measurements.punchDiameter?.value)
        .filter((value): value is number => value !== undefined && value > 0)
    if (measured.length === 0) return undefined
    return measured.reduce((sum, value) => sum + value, 0) / measured.length
}

const propertiesOf = (view: EditionView): RollProperties => ({
    punchDiameter: punchDiameterOf(view),
    tempo: view.edition.tempoAdjustment
})

/**
 * How far each event has to move, in mm, for the alignments to hold:
 * an aligned event takes the onset of its reference, and a paired
 * event follows its partner so that the distance between the two
 * is kept. Events that stay where they are do not appear.
 */
const displacementsOf = (events: readonly NegotiatedEvent[]): Map<NegotiatedEvent, number> => {
    const byId = new Map(events.map(event => [event.id, event]))
    const referenceOf = (event: NegotiatedEvent) =>
        event.alignedWith && byId.get(idOf(event.alignedWith))

    const alignedOnsetOf = (event: NegotiatedEvent, visited = new Set<string>()): number => {
        const reference = referenceOf(event)
        if (!reference || visited.has(event.id)) return event.horizontal.from
        return alignedOnsetOf(reference, visited.add(event.id))
    }

    const displacements = new Map(
        events
            .filter(event => referenceOf(event) !== undefined)
            .map((event): [NegotiatedEvent, number] => [event, alignedOnsetOf(event) - event.horizontal.from])
    )

    pairsAmong(events).forEach(([one, other]) => {
        const shared = displacements.get(one) ?? displacements.get(other)
        if (shared === undefined) return
        displacements.set(one, shared)
        displacements.set(other, shared)
    })

    return displacements
}

/**
 * A version of the edition, performed: the symbols are negotiated into
 * placed events, the reproducing system plays them, and the result goes
 * out as MIDI in which every note and pedal step is labelled with the
 * symbol it performs.
 */
export class Emulation<Options extends object> {
    readonly system: ReproducingSystem<Options>
    options: Options

    midiEvents: AnyPerformedRollFeature[] = []

    // sorted list of events with the negotiated assumptions already applied
    negotiatedEvents: NegotiatedEvent[] = []

    curves: readonly EmulatedCurve[] = []

    source?: string

    constructor(system: ReproducingSystem<Options>, options: Options = system.defaultOptions) {
        this.system = system
        this.options = options
    }

    applyConstraints() {
        displacementsOf(this.negotiatedEvents).forEach((distance, event) => {
            event.horizontal.from += distance
            event.horizontal.to += distance
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
            this.curves = []
            return this.midiEvents
        }

        this.applyConstraints();

        const performance = this.system.perform(this.negotiatedEvents, this.options, propertiesOf(view))
        this.curves = performance.curves

        const onsets = performance.events.filter(event => event.type === 'noteOn').map(event => event.at)
        const origin = skipToFirstNote && onsets.length > 0 ? Math.min(...onsets) : 0

        this.midiEvents = performance.events
            .map(event => ({ ...event, at: event.at - origin }))
            .filter(event => event.at >= 0)
            .sort((a, b) => a.at - b.at)
        return this.midiEvents
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
        const controllerOf = (event: PerformedPedalEvent) =>
            event.type === 'damper' ? MIDIControlEvents.SUSTAIN : MIDIControlEvents.SOFT_PEDAL

        events.push(text(`linked-rolls (${this.system.name})`))
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
        events.push(controller(MIDIControlEvents.SUSTAIN, 0), controller(MIDIControlEvents.SOFT_PEDAL, 0))

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
