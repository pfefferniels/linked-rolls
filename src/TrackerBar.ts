import type { Concept } from "./Agent"
import { Expression, ExpressionScope, Note } from "./Symbol"
import { Millimeters, SpeedMeasure, Track, track } from "./Quantity"

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
    readonly from: Track
    readonly to: Track
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

    /** Width of the roll the bar reads. */
    readonly width: Millimeters

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
    readonly rewindTrack: Track

    /**
     * The paper speed the system runs its rolls at, where the
     * literature states one. A system whose rolls each carry a tempo
     * of their own, as the Licensee's do, states none.
     */
    readonly paperSpeed?: SpeedMeasure

    /** `undefined` for a position the bar does not read. */
    meaningOf(position: Track): TrackMeaning | undefined

    /**
     * `meaningOf` inverted: the position this bar reads the meaning on,
     * or `undefined` where it does not read it at all. A symbol's track
     * is this rather than anything measured, since a note of one pitch
     * sits on exactly one position of a given bar.
     */
    positionOf(meaning: TrackMeaning): Track | undefined

    /** `undefined` for a position the bar does not read. */
    roleOf(position: Track): TrackRole | undefined
}

/**
 * What a position says, as a key. Two bars read the same thing exactly
 * where their keys agree, which is what lets a symbol cross from one
 * system to another and what decides whether two symbols collate.
 */
export const keyOf = (meaning: TrackMeaning): string =>
    meaning.type === 'note'
        ? `note ${meaning.pitch}`
        : `expression ${meaning.scope} ${meaning.expressionType}`

const SYSTEM_IRI = 'https://w3id.org/reo/type/system/'

/** The roll system a tracker bar belongs to, as the roll metadata states it. */
export const systemOf = (bar: TrackerBar): Concept =>
    ({ id: SYSTEM_IRI + bar.id, name: bar.name, sameAs: [] })

/** The identifier of a system the type vocabulary knows, from the IRI naming it. */
export const systemIdIn = (id: string | undefined): string | undefined =>
    id?.startsWith(SYSTEM_IRI) ? id.slice(SYSTEM_IRI.length) : undefined

/** The identifier of a system the type vocabulary knows, from its concept. */
export const systemIdOf = (system: Concept | undefined): string | undefined =>
    systemIdIn(system?.id)

/**
 * A tracker bar as written down, with its positions as plain numbers
 * in the bar's own 1-based numbering; `describeTrackerBar` gives them
 * their type.
 */
export interface TrackerBarSpec {
    id: string
    name: string
    width: Millimeters
    trackCount: number
    /** The contiguous block of note positions. */
    notes: { from: number, to: number, lowestPitch: number }
    /** Every position outside the note block, keyed by track. */
    expressions: ReadonlyMap<number, string>
    /**
     * The position the rewind runs on, where the system gives it no
     * valve of its own to be named after. The T-98 drives its rewind
     * with a long perforation on the bass sforzando-piano position.
     * Left out, it is the position typed `Rewind`.
     */
    rewindTrack?: number
    /** The speed the system runs its rolls at, where the literature states one. */
    paperSpeed?: SpeedMeasure
}

const areasOf = ({ notes, trackCount }: TrackerBarSpec): TrackArea[] => [
    { role: 'bass-expression', from: track(1), to: track(notes.from - 1) },
    { role: 'note', from: track(notes.from), to: track(notes.to) },
    { role: 'treble-expression', from: track(notes.to + 1), to: track(trackCount) }
]

const scopeOf = (role: TrackRole): ExpressionScope =>
    role === 'bass-expression' ? 'bass' : 'treble'

export const describeTrackerBar = (spec: TrackerBarSpec): TrackerBar => {
    const areas = areasOf(spec)

    const roleOf = (position: Track) =>
        areas.find(area => position >= area.from && position <= area.to)?.role

    const meaningOf = (position: Track): TrackMeaning | undefined => {
        const role = roleOf(position)
        if (!role) return undefined

        if (role === 'note') {
            return {
                type: 'note',
                pitch: position - spec.notes.from + spec.notes.lowestPitch
            }
        }

        const expressionType = spec.expressions.get(position)
        if (!expressionType) return undefined

        return { type: 'expression', expressionType, scope: scopeOf(role) }
    }

    const positions = new Map(
        Array.from({ length: spec.trackCount }, (_, i) => track(i + 1))
            .flatMap(position => {
                const meaning = meaningOf(position)
                return meaning ? [[keyOf(meaning), position] as const] : []
            })
    )

    const rewind = spec.rewindTrack
        ?? [...spec.expressions].find(([, type]) => type === 'Rewind')?.[0]

    if (rewind === undefined) {
        throw new Error(`${spec.name} declares no rewind track`)
    }

    return {
        id: spec.id,
        name: spec.name,
        width: spec.width,
        trackCount: spec.trackCount,
        areas,
        expressionTypes: [...new Set(spec.expressions.values())],
        rewindTrack: track(rewind),
        ...(spec.paperSpeed && { paperSpeed: spec.paperSpeed }),
        meaningOf,
        positionOf: meaning => positions.get(keyOf(meaning)),
        roleOf
    }
}

/**
 * Puts a position of one bar onto the position of another that reads
 * the same thing, or nowhere when the other bar does not read it. This
 * is how a copy read in one system's numbering is put into another's,
 * as the migration does for a Licensee copy stored on T-100 tracks.
 */
export const translationBetween = (from: TrackerBar, to: TrackerBar) =>
    (position: Track): Track | undefined => {
        const meaning = from.meaningOf(position)
        return meaning && to.positionOf(meaning)
    }
