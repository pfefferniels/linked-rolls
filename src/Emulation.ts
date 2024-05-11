/**
 * The original code of the calculateVelocities() method,
 * written by Kitty Shi and Craig Stuart Sapp,
 * was taken from the midi2exp project (https://github.com/pianoroll/midi2exp)
 * and adapted to the different data representation.
 */
import { AnyEvent, MIDIControlEvents, MidiFile } from "midifile-ts";
import { Assumption, RelativePlacement, TempoAdjustment, CollatedEvent, Expression, Note } from "./types";

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

export type AnyPerformedRollEvent =
    PerformedNoteOnEvent |
    PerformedNoteOffEvent |
    PerformedSustainPedalOnEvent | PerformedSustainPedalOffEvent

type FromCollatedEvent = {
    fromCollatedEvent?: (CollatedEvent)
}

type AssumedPhysicalTimeSpan = {
    assumedPhysicalTime?: [number, number]
}

type NegotiatedEvent = (Note | Expression) & FromCollatedEvent & AssumedPhysicalTimeSpan

type EmulationOptions = {
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
        options.fastD_step = (options.welte_f - options.welte_p) / options.fastD_decay_rate
        this.options = options
    }

    private negotiateEvents(collatedEvents_: CollatedEvent[], assumptions: Assumption[]) {
        const collatedEvents = structuredClone(collatedEvents_)
        for (const collatedEvent of collatedEvents) {
            if (collatedEvent.isNonMusical) return
            if (!collatedEvent.wasCollatedFrom || !collatedEvent.wasCollatedFrom.length) return

            // try to negotiate the assumptions
            const mean = meanDimensionOf(collatedEvent)
            if (!mean) continue

            const placements = assumptions.filter(assumption =>
                assumption.type === 'relativePlacement' &&
                (assumption as RelativePlacement).placed === collatedEvent) as RelativePlacement[]

            let wasShifted = false
            for (const placement of placements) {
                for (const relativeTo of placement.relativeTo) {
                    const otherMean = meanDimensionOf(relativeTo)
                    if (!otherMean) continue

                    // check if the conditions are met and act only if not
                    if (placement.withPlacementType === 'startsBeforeTheStartOf') {
                        if (otherMean[0] <= mean[0]) {
                            if (wasShifted) {
                                // try to negotiate with another placement 
                                // that has been applied already
                                mean[0] = mean[0] + (otherMean[0] - 1) / 2
                            }
                            else {
                                mean[0] = otherMean[0] - 1
                                wasShifted = true
                            }
                        }
                    }
                }
            }

            const negotiated = collatedEvent.wasCollatedFrom[0] as NegotiatedEvent
            negotiated.hasDimension.from = mean[0]
            negotiated.hasDimension.to = mean[1]
            negotiated.fromCollatedEvent = collatedEvent
            this.negotiatedEvents.push(negotiated)
        }

        this.negotiatedEvents.sort((a, b) => a.hasDimension.from - b.hasDimension.from)
    }

    private findRollTempo(assumptions: Assumption[]) {
        const adjustments = assumptions
            .filter(assumption => assumption.type === 'tempoAdjustment') as TempoAdjustment[]

        if (adjustments.length === 0) {
            this.startTempo = 80
            this.endTempo = 80
            return
        }

        let meanStartTempo = 0
        let meanEndTempo = 0
        for (const adjustment of adjustments) {
            meanStartTempo += adjustment.startsWith
            meanEndTempo += adjustment.endsWith
        }
        this.startTempo = meanStartTempo / adjustments.length
        this.endTempo = meanEndTempo / adjustments.length
    }

    private applyRollTempo() {
        for (const event of this.negotiatedEvents) {
            if (!event.assumedPhysicalTime) {
                event.assumedPhysicalTime = [
                    this.placeToTime(event.hasDimension.from) || 0.1,
                    this.placeToTime(event.hasDimension.to) || 0.1
                ]
            }
        }
    }

    private applyTrackerBarExtension() {
        const correction = this.options.trackerBarDiameter * this.options.punchExtensionFraction + 0.5
        for (const event of this.negotiatedEvents) {
            event.hasDimension.to += correction
        }
    }

    private convertEventsToMIDI() {
        for (const event of this.negotiatedEvents) {
            if (event.type === 'expression') {
                const expression = event as Expression
                if (expression.P2HasType === 'SustainPedalOn') {
                    this.midiEvents.push({
                        type: 'sustainPedalOn',
                        performs: event.fromCollatedEvent || event,
                        at: event.assumedPhysicalTime![0],
                    })

                }
                else if (expression.P2HasType === 'SustainPedalOff') {
                    this.midiEvents.push({
                        type: 'sustainPedalOff',
                        performs: event.fromCollatedEvent || event,
                        at: event.assumedPhysicalTime![0],
                    })
                }
            }
            else if (event.type === 'note') {
                // TODO: check if there is a pitch correction

                // take velocity from the calculated velocity list
                const pitch = (event as Note).hasPitch
                if (event.trackerHole >= this.options.division) {
                    this.insertNote(event, pitch,
                        this.trebleVelocities[+(event.assumedPhysicalTime![0] * 1000).toFixed()])
                }
                else {
                    this.insertNote(event, pitch,
                        this.bassVelocities[+(event.assumedPhysicalTime![0] * 1000).toFixed()])
                }
            }
        }
    }

    emulateFromRoll(events: (Note | Expression)[]) {
        this.startTempo = 90
        this.endTempo = 90
        this.negotiatedEvents = structuredClone(events)
        this.applyTrackerBarExtension()
        this.applyRollTempo()
        this.applyTrackerBarExtension()
        this.calculateVelocities('treble')
        this.calculateVelocities('bass')
        this.convertEventsToMIDI()
        return this.midiEvents
    }

    emulateFromCollatedRoll(collatedEvents: CollatedEvent[], assumptions: Assumption[] = []) {
        this.negotiatedEvents = []
        this.negotiateEvents(collatedEvents, assumptions)
        this.findRollTempo(assumptions)
        this.applyTrackerBarExtension()
        this.applyRollTempo()
        this.calculateVelocities('treble')
        this.calculateVelocities('bass')
        this.convertEventsToMIDI()
        return this.midiEvents
    }

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

        console.log('last onset=', lastOnsetMs)

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

            if (scope === 'treble' && negotiatedEvent.trackerHole < this.options.division) continue
            else if (scope === 'bass' && negotiatedEvent.trackerHole >= this.options.division) continue

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

    placeToTime(place: number) {
        if (!this.startTempo || !this.endTempo) return

        return place / this.startTempo
    }

    timeToPlace(timeInS: number) {
        if (!this.startTempo || !this.endTempo) return

        return timeInS * this.startTempo
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
            microsecondsPerBeat: 60000000 / (this.startTempo || 80),
            deltaTime: 0
        })
        for (const event of this.midiEvents) {
            const deltaTime = this.timeToPlace(event.at)! - this.timeToPlace(currentTime)!

            if (event.type === 'noteOn') {
                events.push({
                    type: 'channel',
                    subtype: 'noteOn',
                    noteNumber: event.pitch,
                    velocity: +event.velocity.toFixed(0),
                    deltaTime: +deltaTime.toFixed(0),
                    channel: 0
                })
            }
            else if (event.type === 'noteOff') {
                events.push({
                    type: 'channel',
                    subtype: 'noteOff',
                    noteNumber: event.pitch,
                    velocity: +event.velocity.toFixed(0),
                    deltaTime: +deltaTime.toFixed(0),
                    channel: 0
                })
            }
            else if (event.type === 'sustainPedalOn') {
                events.push({
                    type: 'channel',
                    subtype: 'controller',
                    controllerType: MIDIControlEvents.SUSTAIN,
                    deltaTime: +deltaTime.toFixed(0),
                    channel: 0,
                    value: 127
                })
            }
            else if (event.type === 'sustainPedalOff') {
                events.push({
                    type: 'channel',
                    subtype: 'controller',
                    controllerType: MIDIControlEvents.SUSTAIN,
                    deltaTime: +deltaTime.toFixed(0),
                    channel: 0,
                    value: 0
                })
            }

            currentTime = event.at
        }

        return {
            header: {
                ticksPerBeat: 600,
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
        originalEvents.reduce((acc, cur) => acc + cur.hasDimension.from, 0) / originalEvents.length
    const meanEnd =
        originalEvents.reduce((acc, cur) => acc + cur.hasDimension.to, 0) / originalEvents.length

    return [meanStart, meanEnd]
}
