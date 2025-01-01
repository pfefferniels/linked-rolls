import { MidiFile, AnyEvent, MIDIControlEvents, NoteOnEvent, NoteOffEvent } from "midifile-ts";

const isNoteOn = (event: AnyEvent) => event.type === 'channel' && event.subtype === 'noteOn'
const isNoteOff = (event: AnyEvent) => event.type === 'channel' && event.subtype === 'noteOff'

const isPedalOn = (event: AnyEvent) => (
    event.type === 'channel'
    && event.subtype === 'controller'
    && event.controllerType === MIDIControlEvents.SUSTAIN
    && event.value > 63
)

const isPedalOff = (event: AnyEvent) => (
    event.type === 'channel'
    && event.subtype === 'controller'
    && event.controllerType === MIDIControlEvents.SUSTAIN
    && event.value <= 63
)

const isSoftPedalOn = (event: AnyEvent) => {
    return event.type === 'channel'
        && event.subtype === 'controller'
        && event.controllerType === MIDIControlEvents.SOFT_PEDAL
        && event.value > 63
}

const isSoftPedalOff = (event: AnyEvent) => {
    return event.type === 'channel'
        && event.subtype === 'controller'
        && event.controllerType === MIDIControlEvents.SOFT_PEDAL
        && event.value <= 63
}

export function midiTickToMilliseconds(ticks: number, microsecondsPerBeat: number, ppq: number): number {
    const beats = ticks / ppq;
    return (beats * microsecondsPerBeat) / 1000;
}

interface Span<T extends string> {
    type: T
    id: string
    onset: number
    offset: number

    onsetMs: number
    offsetMs: number

    link?: string
}

export interface NoteSpan extends Span<'note'> {
    pitch: number;
    velocity: number;
    channel: number;
}

export interface SustainSpan extends Span<'sustain'> { }
export interface SoftSpan extends Span<'soft'> { }

export type AnySpan = NoteSpan | SustainSpan | SoftSpan

export const asSpans = (file: MidiFile, readLinks = false): AnySpan[] => {
    const resultingSpans = [];

    type Tempo = { atTick: number; microsecondsPerBeat: number; };
    const tempoMap: Tempo[] = [];
    const currentSpans: AnySpan[] = [];
    let bufferedMetaText

    for (let i = 0; i < file.tracks.length; i++) {
        const track = file.tracks[i];
        let currentTime = 0;
        for (const event of track) {
            currentTime += event.deltaTime;

            if (event.type === 'meta' && event.subtype === 'setTempo') {
                tempoMap.push({
                    atTick: currentTime,
                    microsecondsPerBeat: event.microsecondsPerBeat
                });
            }
            if (readLinks && event.type === 'meta' && event.subtype === 'text') {
                bufferedMetaText = event.text
            }
            else if (isNoteOn(event) || isPedalOn(event) || isSoftPedalOn(event)) {
                const type = isNoteOn(event) ? 'note' : isPedalOn(event) ? 'sustain' : 'soft'
                const currentTempo = tempoMap.slice().reverse().find(tempo => tempo.atTick <= currentTime);
                if (!currentTempo) {
                    console.log('No tempo event found. Skipping');
                    continue;
                }

                const onsetMs = midiTickToMilliseconds(currentTime, currentTempo.microsecondsPerBeat, file.header.ticksPerBeat)
                const link = bufferedMetaText

                if (type === 'note') {
                    const pitch = (event as NoteOnEvent).noteNumber
                    currentSpans.push({
                        type,
                        id: `${i}-${currentTime}-${pitch}`,
                        onset: currentTime,
                        offset: 0,
                        velocity: (event as NoteOnEvent).velocity,
                        pitch,
                        channel: i,
                        onsetMs,
                        offsetMs: 0,
                        link
                    });
                }
                else {
                    currentSpans.push({
                        type,
                        id: `${i}-${currentTime}-${type}`,
                        onset: currentTime,
                        offset: 0,
                        onsetMs,
                        offsetMs: 0,
                        link
                    });
                }

                bufferedMetaText = undefined
            }
            else if (isNoteOff(event) || isPedalOff(event) || isSoftPedalOff(event)) {
                const type = isNoteOff(event) ? 'note' : isPedalOff(event) ? 'sustain' : 'soft'

                const currentTempo = tempoMap.slice().reverse().find(tempo => tempo.atTick <= currentTime);
                if (!currentTempo) {
                    console.log('No tempo event found. Skipping');
                    continue;
                }

                const counterpart =
                    isNoteOff(event)
                        ? currentSpans.find(e => e.type === 'note' && e.pitch === (event as NoteOffEvent).noteNumber)
                        : currentSpans.find(e => e.type === type)
                if (!counterpart) {
                    console.log('Found an off event of type', type, 'at', currentTime, 'without a previous on.', 'Event:', event, 'Current spans: ', currentSpans.map(span => span.type).join(' '));
                    continue;
                }
                counterpart.offset = currentTime;
                counterpart.offsetMs = midiTickToMilliseconds(currentTime, currentTempo.microsecondsPerBeat, file.header.ticksPerBeat)
                if (bufferedMetaText && counterpart.link) {
                    counterpart.link += ` ${bufferedMetaText}`
                }
                resultingSpans.push(counterpart);
                currentSpans.splice(currentSpans.indexOf(counterpart), 1);
            }
        }
    }

    return resultingSpans
        .filter(span => span.offsetMs > span.onsetMs)
        .sort((a, b) => a.onset - b.onset);
};

