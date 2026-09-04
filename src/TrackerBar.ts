import type { Concept } from "./Edition"
import { Expression, ExpressionScope, Note } from "./Symbol"

/**
 * What a tracker bar position does: sound a note, or operate one of
 * the expression valves on the bass or the treble side.
 */
export type TrackRole = 'bass-expression' | 'note' | 'treble-expression'

/**
 * A contiguous block of tracker bar positions serving one role.
 * Both bounds are inclusive.
 */
export interface TrackArea {
    readonly role: TrackRole
    readonly from: number
    readonly to: number
}

export type NoteMeaning = Pick<Note, 'type' | 'pitch'>
export type ExpressionMeaning = Pick<Expression, 'type' | 'expressionType' | 'scope'>
export type TrackMeaning = NoteMeaning | ExpressionMeaning

/**
 * Describes a tracker bar. Track numbers are 1-based and count from
 * the bass edge of the roll, which is the numbering used throughout
 * the edition: a feature's `vertical.from` is a track in this sense.
 *
 * This is the only place where track numbers are given a meaning.
 * Anything that needs to know where the note block ends, which side
 * an expression belongs to, or how a track maps to a pitch, should
 * ask the tracker bar rather than repeat the boundaries.
 */
export interface TrackerBar {
    /**
     * Names the reproducing system in the type vocabulary:
     * the system is `https://w3id.org/reo/type/system/<id>` and its
     * expression types live under `https://w3id.org/reo/type/<id>/`.
     */
    readonly id: string

    readonly name: string

    /** Width of the roll the bar reads, in mm. */
    readonly width: number

    /** Number of positions on the bar. Tracks run from 1 to this. */
    readonly trackCount: number

    /** The blocks of positions, from the bass edge upwards. */
    readonly areas: readonly TrackArea[]

    /** The expression types the bar reads, each a term of the system. */
    readonly expressionTypes: readonly string[]

    /**
     * The position carrying the rewind perforation, which runs at
     * the very end of a roll and is the usual landmark for calibrating
     * a scan against the bar.
     */
    readonly rewindTrack: number

    /** `undefined` for a position the bar does not read. */
    meaningOf(track: number): TrackMeaning | undefined

    /** `undefined` for a position the bar does not read. */
    roleOf(track: number): TrackRole | undefined
}

const SYSTEM_IRI = 'https://w3id.org/reo/type/system/'

/** The roll system a tracker bar belongs to, as the roll metadata states it. */
export const systemOf = (bar: TrackerBar): Concept =>
    ({ id: SYSTEM_IRI + bar.id, name: bar.name, sameAs: [] })

/** The identifier of a system the type vocabulary knows, from its concept. */
export const systemIdOf = (system: Concept | undefined): string | undefined =>
    system?.id?.startsWith(SYSTEM_IRI) ? system.id.slice(SYSTEM_IRI.length) : undefined

interface TrackerBarSpec {
    id: string
    name: string
    width: number
    trackCount: number
    /** The contiguous block of note positions. */
    notes: { from: number, to: number, lowestPitch: number }
    /** Every position outside the note block, keyed by track. */
    expressions: ReadonlyMap<number, string>
}

const areasOf = ({ notes, trackCount }: TrackerBarSpec): TrackArea[] => [
    { role: 'bass-expression', from: 1, to: notes.from - 1 },
    { role: 'note', from: notes.from, to: notes.to },
    { role: 'treble-expression', from: notes.to + 1, to: trackCount }
]

const scopeOf = (role: TrackRole): ExpressionScope =>
    role === 'bass-expression' ? 'bass' : 'treble'

const describe = (spec: TrackerBarSpec): TrackerBar => {
    const areas = areasOf(spec)

    const roleOf = (track: number) =>
        areas.find(area => track >= area.from && track <= area.to)?.role

    const meaningOf = (track: number): TrackMeaning | undefined => {
        const role = roleOf(track)
        if (!role) return undefined

        if (role === 'note') {
            return {
                type: 'note',
                pitch: track - spec.notes.from + spec.notes.lowestPitch
            }
        }

        const expressionType = spec.expressions.get(track)
        if (!expressionType) return undefined

        return { type: 'expression', expressionType, scope: scopeOf(role) }
    }

    const rewindTrack = [...spec.expressions]
        .find(([, type]) => type === 'Rewind')?.[0]

    if (rewindTrack === undefined) {
        throw new Error(`${spec.name} declares no rewind track`)
    }

    return {
        id: spec.id,
        name: spec.name,
        width: spec.width,
        trackCount: spec.trackCount,
        areas,
        expressionTypes: [...new Set(spec.expressions.values())],
        rewindTrack,
        meaningOf,
        roleOf
    }
}

/**
 * The commands of the Welte-Mignon T-100, as its tracker bar reads them.
 */
export const welteT100ExpressionTypes = [
    'SustainPedalOn',
    'SustainPedalOff',
    'SoftPedalOn',
    'SoftPedalOff',
    'MezzoforteOff',
    'MezzoforteOn',
    'SlowCrescendoOn',
    'SlowCrescendoOff',
    'ForzandoOn',
    'ForzandoOff',
    'MotorOff',
    'MotorOn',
    'Rewind',
    'ElectricCutOff'
] as const

export type WelteT100ExpressionType = typeof welteT100ExpressionTypes[number]

/**
 * Welte-Mignon T-100 ("red Welte"), cf. Hagmann, pp. 75 and 178.
 *
 * The note block spans 80 positions from C1 to g⁴, i.e. MIDI 24 to 103.
 * The expression valves are duplicated, bass below the note block and
 * treble above it, in mirrored order.
 */
export const welteT100: TrackerBar = describe({
    id: 'welte-t100',
    name: 'Welte-Mignon T100',
    width: 328,
    trackCount: 100,
    notes: { from: 11, to: 90, lowestPitch: 24 },
    expressions: new Map<number, WelteT100ExpressionType>([
        [1, 'MezzoforteOff'],
        [2, 'MezzoforteOn'],
        [3, 'SlowCrescendoOff'],
        [4, 'SlowCrescendoOn'],
        [5, 'ForzandoOff'],
        [6, 'ForzandoOn'],
        [7, 'SoftPedalOff'],
        [8, 'SoftPedalOn'],
        [9, 'MotorOff'],
        [10, 'MotorOn'],
        [91, 'Rewind'],
        [92, 'ElectricCutOff'],
        [93, 'SustainPedalOn'],
        [94, 'SustainPedalOff'],
        [95, 'ForzandoOn'],
        [96, 'ForzandoOff'],
        [97, 'SlowCrescendoOn'],
        [98, 'SlowCrescendoOff'],
        [99, 'MezzoforteOn'],
        [100, 'MezzoforteOff']
    ])
})
