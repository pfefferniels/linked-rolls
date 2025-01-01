import { AnyEvent, MIDIControlEvents, MidiFile } from "midifile-ts";
import { CollatedEvent, Expression, ExpressionType, Note } from "./types";
import { TempoAdjustment } from "./EditorialActions";
import { GottschewskiConversion } from "./PlaceTimeConversion";
import { RollCopy } from "./RollCopy";
import { Edition } from "./Edition";

function resize<T>(arr: T[], newSize: number, defaultValue: T) {
    while (newSize > arr.length)
        arr.push(defaultValue);
}

interface PerformedRollEvent<T> {
    type: T
    performs: (CollatedEvent | NegotiatedEvent)
    at: number
}

interface PerformedNoteEvent<T> extends PerformedRollEvent<T> {
    pitch: number;
    velocity: number;
}

export interface PerformedNoteOnEvent extends PerformedNoteEvent<'noteOn'> { }
export interface PerformedNoteOffEvent extends PerformedNoteEvent<'noteOff'> { }
export interface PerformedSustainPedalOnEvent extends PerformedRollEvent<'sustainPedalOn'> { }
export interface PerformedSustainPedalOffEvent extends PerformedRollEvent<'sustainPedalOff'> { }
export interface PerformedSoftPedalOnEvent extends PerformedRollEvent<'softPedalOn'> { }
export interface PerformedSoftPedalOffEvent extends PerformedRollEvent<'softPedalOff'> { }

export type AnyPerformedRollEvent =
    PerformedNoteOnEvent |
    PerformedNoteOffEvent |
    PerformedSustainPedalOnEvent | PerformedSustainPedalOffEvent |
    PerformedSoftPedalOnEvent | PerformedSoftPedalOffEvent

type FromCollatedEvent = {
    fromCollatedEvent?: (CollatedEvent)
}

type AssumedPhysicalTimeSpan = {
    assumedPhysicalTime?: [number, number]
}

export type NegotiatedEvent = (Note | Expression) & FromCollatedEvent & AssumedPhysicalTimeSpan

export type EmulationOptions = {
    welte_p: number
    welte_f: number
    welte_mf: number
    welte_loud: number
    slow_decay_rate: number
    fastC_decay_rate: number
    fastD_decay_rate: number
    trackerBarDiameter: number
    punchExtensionFraction: number
    slow_step?: number
    fastC_step?: number
    fastD_step?: number
    division: number
}

export class Emulation {
    placeTimeConversion = new GottschewskiConversion()
    midiEvents: AnyPerformedRollEvent[] = []

    // sorted list of events with the negotiated assumptions already applied
    negotiatedEvents: NegotiatedEvent[] = []

    // stores a velocity for every millisecond
    trebleVelocities: number[] = []
    bassVelocities: number[] = []

    startTempo?: number
    endTempo?: number

    options: EmulationOptions

    constructor(options: EmulationOptions = {
        welte_p: 35,
        welte_f: 90,
        welte_mf: 60,
        welte_loud: 75,
        trackerBarDiameter: 1.413,
        punchExtensionFraction: 0.75,
        slow_decay_rate: 2380,
        fastC_decay_rate: 300,
        fastD_decay_rate: 400,
        division: 54
    }) {
        options.slow_step = (options.welte_mf - options.welte_p) / options.slow_decay_rate
        options.fastC_step = (options.welte_mf - options.welte_p) / options.fastC_decay_rate
        options.fastD_step = -(options.welte_f - options.welte_p) / options.fastD_decay_rate
        this.options = options
    }

    /**
     * This can be used to create something like a "Leithandschrift". 
     * @todo: Still needs implementation of incorporating corrections 
     * from versions that are likely deduced from the preferred source.
     */
    private negotiateEvents(
        collatedEvents_: CollatedEvent[],
        preferredSource: RollCopy,
    ) {
        const collatedEvents = structuredClone(collatedEvents_)
        for (const collatedEvent of collatedEvents) {
            if (!collatedEvent.wasCollatedFrom || !collatedEvent.wasCollatedFrom.length) return

            // try to negotiate the mean onset and offset
            // TODO: this should be controllable by parameter
            const mean = meanDimensionOf(collatedEvent)
            if (!mean) continue

            // drop events that are not from the preferred source
            if (!collatedEvent.wasCollatedFrom.some(event => preferredSource.hasEvent(event))) {
                continue
            }

            // TODO: incorporate corrections from other sources

            const negotiated = collatedEvent.wasCollatedFrom[0] as NegotiatedEvent
            negotiated.id = collatedEvent.id
            negotiated.hasDimension.horizontal.from = mean[0]
            negotiated.hasDimension.horizontal.to = mean[1]
            negotiated.fromCollatedEvent = collatedEvent
            this.negotiatedEvents.push(negotiated)
        }


        this.negotiatedEvents.sort((a, b) => a.hasDimension.horizontal.from - b.hasDimension.horizontal.from)
    }

    private findRollTempo(adjustment?: TempoAdjustment) {
        if (!adjustment) {
            this.startTempo = 104.331
            this.endTempo = 104.331
            return
        }

        this.startTempo = adjustment.startsWith
        this.endTempo = adjustment.endsWith
    }

    private assignPhysicalTime(skipToFirstNote = true) {
        if (this.negotiatedEvents.length === 0) return 

        const first = skipToFirstNote ? this.negotiatedEvents[0].hasDimension.horizontal.from : 0
        for (const event of this.negotiatedEvents) {
            if (!event.assumedPhysicalTime) {
                // convert from mm to cm and then to time
                event.assumedPhysicalTime = [
                    this.placeTimeConversion.placeToTime((event.hasDimension.horizontal.from - first) / 10),
                    this.placeTimeConversion.placeToTime((event.hasDimension.horizontal.to! - first) / 10)
                ]
            }
        }
    }

    private applyTrackerBarExtension() {
        const correction = this.options.trackerBarDiameter * this.options.punchExtensionFraction + 0.5
        for (const event of this.negotiatedEvents) {
            if (event.hasDimension.horizontal.to) {
                event.hasDimension.horizontal.to += correction
            }
        }
    }

    private convertEventsToMIDI() {
        for (const event of this.negotiatedEvents) {
            if (event.type === 'expression') {
                const expression = event as Expression

                const map = new Map<ExpressionType, string>([
                    ['SustainPedalOn', 'sustainPedalOn'],
                    ['SustainPedalOff', 'sustainPedalOff'],
                    ['SoftPedalOn', 'softPedalOn'],
                    ['SoftPedalOff', 'softPedalOff']
                ])

                if (map.has(expression.P2HasType)) {
                    this.midiEvents.push({
                        type: map.get(expression.P2HasType)! as 'sustainPedalOn' | 'sustainPedalOff' | 'softPedalOn' | 'softPedalOff',
                        performs: event.fromCollatedEvent || event,
                        at: event.assumedPhysicalTime![0],
                    })
                }
            }
            else if (event.type === 'note') {
                // take velocity from the calculated velocity list
                const pitch = (event as Note).hasPitch
                if (event.hasDimension.vertical.from >= this.options.division) {
                    this.insertNote(
                        event,
                        pitch,
                        this.trebleVelocities[+(event.assumedPhysicalTime![0] * 1000).toFixed()])
                }
                else {
                    this.insertNote(
                        event,
                        pitch,
                        this.bassVelocities[+(event.assumedPhysicalTime![0] * 1000).toFixed()])
                }
            }
        }

        this.midiEvents.sort((a, b) => a.at - b.at)
    }

    emulateFromRoll(events: (Note | Expression)[]) {
        this.startTempo = 104.331
        this.endTempo = 104.331
        this.negotiatedEvents = structuredClone(events)
        this.applyTrackerBarExtension()
        this.assignPhysicalTime()
        this.applyTrackerBarExtension()
        this.calculateVelocities('treble')
        this.calculateVelocities('bass')
        this.convertEventsToMIDI()
        return this.midiEvents
    }

    emulateFromEdition(
        edition: Edition,
        preferredSource: RollCopy
    ) {
        const { collationResult, tempoAdjustment } = edition
        const collatedEvents = collationResult.events

        this.negotiatedEvents = []
        this.negotiateEvents(collatedEvents, preferredSource)
        this.findRollTempo(tempoAdjustment)
        this.applyTrackerBarExtension()
        this.assignPhysicalTime()
        this.calculateVelocities('treble')
        this.calculateVelocities('bass')
        this.convertEventsToMIDI()
        return this.midiEvents
    }

    /**
     * The original code of the calculateVelocities() method,
     * written by Kitty Shi and Craig Stuart Sapp,
     * was taken from the midi2exp project (https://github.com/pianoroll/midi2exp)
     * and adapted to the different data representation.
     */
    calculateVelocities(scope: 'treble' | 'bass') {
        if (!this.negotiatedEvents.length) return

        const velocities = scope === 'treble' ? this.trebleVelocities : this.bassVelocities

        const isMF: boolean[] = [] // is MF hook on?
        const isSlowC: boolean[] = [] // is slow crescendo on?
        const isFastC: boolean[] = [] // is fast crescendo on?
        const isFastD: boolean[] = [] // is fast decrescendo on?

        let lastOnsetMs = this.negotiatedEvents[this.negotiatedEvents.length - 1].assumedPhysicalTime![0]
        if (!lastOnsetMs) {
            console.log('Failed calculating the last onset.')
            return
        }
        lastOnsetMs *= 1000

        // set all of the times to piano by default
        resize(velocities, lastOnsetMs, this.options.welte_p)

        // fill all hook maps with false
        for (const target of [isMF, isSlowC, isFastC, isFastD]) {
            resize(target, lastOnsetMs, false)
        }

        // Lock and Cancel
        let valve_mf_on = false;
        let valve_slowc_on = false;

        let valve_mf_starttime = 0;        // 0 for off
        let valve_slowc_starttime = 0;

        // First pass: For each time section calculate the current boolean
        // state of each expression.

        for (const negotiatedEvent of this.negotiatedEvents) {
            if (negotiatedEvent.type !== 'expression') continue

            if (scope === 'treble' && negotiatedEvent.hasDimension.vertical.from < this.options.division) continue
            else if (scope === 'bass' && negotiatedEvent.hasDimension.vertical.from >= this.options.division) continue

            const event = negotiatedEvent as Expression & AssumedPhysicalTimeSpan

            const startMs = event.assumedPhysicalTime![0] * 1000
            const endMs = event.assumedPhysicalTime![1] * 1000

            // console.log('encoutering expression', event.P2HasType["@id"], 'from', startMs, 'to', endMs)

            if (event.P2HasType === 'MezzoforteOn') {
                // update the mezzoforte start time
                // only if the mf valve is not on already
                if (!valve_mf_on) {
                    valve_mf_on = true
                    valve_mf_starttime = startMs
                }
            }
            else if (event.P2HasType === 'MezzoforteOff') {
                if (valve_mf_on) {
                    // fill from the mezzoforte start time to here ...
                    isMF.fill(true, valve_mf_starttime, startMs)
                }
                valve_mf_on = false
            }
            else if (event.P2HasType === 'SlowCrescendoOn') {
                // update the slow crescendo start time
                // only if slow crescendo is not on already
                if (!valve_slowc_on) {
                    valve_slowc_on = true;
                    valve_slowc_starttime = startMs;
                }
            }
            else if (event.P2HasType === 'SlowCrescendoOff') {
                if (valve_slowc_on) {
                    // fill from the mezzoforte start time to here ...
                    isSlowC.fill(true, valve_slowc_starttime, startMs)
                }
                valve_slowc_on = false;
            }
            else if (event.P2HasType === 'ForzandoOn') {
                // Forzando On/Off are a direct operations (length of perforation matters)
                isFastC.fill(true, startMs, endMs)
            }
            else if (event.P2HasType === 'ForzandoOff') {
                // Forzando On/Off are a direct operations (length of perforation matters)
                isFastD.fill(true, startMs, endMs)
            }
        }
        // TODO: deal with the last case (if crescendo OFF is missing)

        // Second pass, update the current velocity according to the previous one

        let amount = 0.0
        let eps = 0.0001

        for (let i = 1; i < lastOnsetMs; i++) {
            if (!isSlowC[i] && !isFastC[i] && !isFastD[i]) {
                // slow decrescendo is always on
                amount = -this.options.slow_step!;
            } else {
                amount =
                    (isSlowC[i] ? this.options.slow_step! : 0) +
                    (isFastC[i] ? this.options.fastC_step! : 0) +
                    (isFastD[i] ? this.options.fastD_step! : 0)
            }

            velocities[i] = velocities[i - 1] + amount

            if (isMF[i]) {
                if (velocities[i - 1] > this.options.welte_mf) {
                    if (amount < 0) {
                        velocities[i] = Math.max(this.options.welte_mf + eps, velocities[i])
                    }
                    else {
                        velocities[i] = Math.min(this.options.welte_f, velocities[i]);
                    }
                }
                else if (velocities[i - 1] < this.options.welte_mf) {
                    if (amount > 0) {
                        velocities[i] = Math.min(this.options.welte_mf - eps, velocities[i]);
                    }
                    else {
                        velocities[i] = Math.max(this.options.welte_p, velocities[i]);
                    }
                }
            }
            else {
                // slow crescendo will only reach welte_loud
                if (isSlowC[i] && !isFastC[i] && velocities[i - 1] < this.options.welte_loud) {
                    velocities[i] = Math.min(velocities[i], this.options.welte_loud - eps);
                }
            }
            // regulating max and min
            velocities[i] = Math.max(this.options.welte_p, velocities[i]);
            velocities[i] = Math.min(this.options.welte_f, velocities[i]);
        }
    }

    private insertNote(event: NegotiatedEvent, pitch: number, velocity: number) {
        this.midiEvents.push({
            type: 'noteOn',
            performs: event.fromCollatedEvent || event,
            velocity,
            at: event.assumedPhysicalTime![0],
            pitch
        })

        this.midiEvents.push({
            type: 'noteOff',
            performs: event.fromCollatedEvent || event,
            velocity: 127,
            at: event.assumedPhysicalTime![1],
            pitch
        } as PerformedNoteOffEvent)
    }

    findEventsPerforming(id: string) {
        return this.midiEvents.filter(event => event.performs.id === id)
    }

    asMIDI(): MidiFile {
        const events: AnyEvent[] = []
        this.midiEvents.sort((a, b) => a.at - b.at)

        let currentTime = 0
        events.push({
            type: 'meta',
            subtype: 'setTempo',
            microsecondsPerBeat: 1000000,
            deltaTime: 0
        })
        for (const event of this.midiEvents) {
            const deltaTimeMs = (event.at - currentTime) * 1000

            if (event.type === 'noteOn') {
                console.log('dealing with note on', event.pitch, event.at, deltaTimeMs)
                events.push({
                    type: 'meta',
                    subtype: 'text',
                    deltaTime: deltaTimeMs,
                    text: event.performs.id
                })
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
                    deltaTime: deltaTimeMs,
                    channel: 0
                })
            }
            else if (event.type === 'sustainPedalOn') {
                events.push({
                    type: 'meta',
                    subtype: 'text',
                    deltaTime: deltaTimeMs,
                    text: event.performs.id
                })
                events.push({
                    type: 'channel',
                    subtype: 'controller',
                    controllerType: MIDIControlEvents.SUSTAIN,
                    deltaTime: 0,
                    channel: 0,
                    value: 127
                })
            }
            else if (event.type === 'sustainPedalOff') {
                events.push({
                    type: 'meta',
                    subtype: 'text',
                    deltaTime: deltaTimeMs,
                    text: event.performs.id
                })
                events.push({
                    type: 'channel',
                    subtype: 'controller',
                    controllerType: MIDIControlEvents.SUSTAIN,
                    deltaTime: 0,
                    channel: 0,
                    value: 0
                })
            }
            else if (event.type === 'softPedalOn') {
                events.push({
                    type: 'meta',
                    subtype: 'text',
                    deltaTime: deltaTimeMs,
                    text: event.performs.id
                })
                events.push({
                    type: 'channel',
                    subtype: 'controller',
                    controllerType: MIDIControlEvents.SOFT_PEDAL,
                    deltaTime: 0,
                    channel: 0,
                    value: 127
                })
            }
            else if (event.type === 'softPedalOff') {
                events.push({
                    type: 'meta',
                    subtype: 'text',
                    deltaTime: deltaTimeMs,
                    text: event.performs.id
                })
                events.push({
                    type: 'channel',
                    subtype: 'controller',
                    controllerType: MIDIControlEvents.SOFT_PEDAL,
                    deltaTime: 0,
                    channel: 0,
                    value: 0
                })
            }
            currentTime = event.at
        }

        return {
            header: {
                ticksPerBeat: 1000,
                formatType: 0,
                trackCount: 1
            },
            tracks: [events]
        }
    }
}

const meanDimensionOf = (collatedEvent: CollatedEvent): [number, number] | undefined => {
    const originalEvents = collatedEvent.wasCollatedFrom
    if (!originalEvents) return

    const meanStart =
        originalEvents.reduce((acc, cur) => acc + cur.hasDimension.horizontal.from, 0) / originalEvents.length
    const meanEnd =
        originalEvents.reduce((acc, cur) => acc + cur.hasDimension.horizontal.to!, 0) / originalEvents.length

    return [meanStart, meanEnd]
}
