import type { Concept } from "./Agent"
import { Expression, ExpressionScope, Note } from "./Symbol"
import { Millimeters, mm, SpeedMeasure, Track, track } from "./Quantity"

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

    /**
     * Where the roll's own content ends, from its perforations alone, or
     * `undefined` where nothing on the paper says. A copy that reads
     * `undefined` runs to the end of whatever was scanned, which is a fact
     * about the scan rather than about the roll and should be reported as one.
     *
     * Takes anything with a place and a position, so a reader can ask it of a
     * copy's features before there are symbols, and a collation can ask it of
     * the symbols afterwards.
     */
    endsAt(features: readonly PlacedOnBar[]): RollEnd | undefined

    /**
     * `undefined` for a position the bar does not read. A measured place
     * is snapped to the nearest position: perforations sit on the grid and
     * measurements of them scatter around it.
     */
    meaningOf(position: Track): TrackMeaning | undefined

    /**
     * What the bar reads off a feature, which may lie across more than one
     * position. A perforation lifts every valve whose bar hole it uncovers,
     * so an opening across two positions reads as two commands; one on a
     * single position reads as the one `meaningOf` gives, and one on
     * positions the bar does not read as none at all.
     */
    meaningsOf(span: OnBar): readonly TrackMeaning[]

    /**
     * `meaningOf` inverted: the position this bar reads the meaning on,
     * or `undefined` where it does not read it at all. A symbol's track
     * is this rather than anything measured, since a note of one pitch
     * sits on exactly one position of a given bar.
     */
    positionOf(meaning: TrackMeaning): Track | undefined

    /** `undefined` for a position the bar does not read; snapped as `meaningOf` is. */
    roleOf(position: Track): TrackRole | undefined

    /** The positions a feature lies across, snapped to the grid. */
    positionsIn(span: OnBar): readonly Track[]
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
/**
 * Where a roll's own content ends, as far as its perforations say.
 *
 * This is a question about the paper, not about the mechanism: it asks where
 * the rewind is *punched*, not when the rewind pneumatic takes hold. The second
 * is a matter of valve lift and belongs to whatever performs the roll. Keeping
 * them apart is what lets collation and counting ask this without an emulator.
 */
export type RollEnd = {
    readonly at: Millimeters
    readonly because: 'rewind'
}

/** Anything carrying a place on the roll and a position on the bar. */
export type PlacedOnBar = {
    readonly horizontal: { readonly from: Millimeters, readonly to: Millimeters }
    readonly vertical: { readonly from: Track }
}

/**
 * Where a feature lies across the bar: one place, or a run of them where
 * `to` is given. Structural, so a feature's `vertical` passes as it is and
 * this module need know nothing about features.
 */
export type OnBar = {
    readonly from: Track
    readonly to?: Track
}

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
    /**
     * How long a perforation on a *shared* rewind position has to be before it
     * is the rewind rather than the command the position usually carries. Only
     * meaningful with `rewindTrack`: a system that gives the rewind a line of
     * its own needs no threshold, since anything there is the rewind.
     */
    rewindHold?: Millimeters
}

const areasOf = ({ notes, trackCount }: TrackerBarSpec): TrackArea[] => [
    { role: 'bass-expression', from: track(1), to: track(notes.from - 1) },
    { role: 'note', from: track(notes.from), to: track(notes.to) },
    { role: 'treble-expression', from: track(notes.to + 1), to: track(trackCount) }
]

const scopeOf = (role: TrackRole): ExpressionScope =>
    role === 'bass-expression' ? 'bass' : 'treble'

/**
 * The bar position a measured place falls on. Places are measured off a
 * scan and scatter around the grid, while the bar has holes only at whole
 * positions, so the nearest one is the one uncovered.
 */
const snap = (place: Track): Track => track(Math.round(place))

/** The positions a span reaches, both ends snapped and the run between them. */
const positionsBetween = (span: OnBar): Track[] => {
    const ends = [snap(span.from), snap(span.to ?? span.from)]
    const [first, last] = [Math.min(...ends), Math.max(...ends)]
    return Array.from({ length: last - first + 1 }, (_, step) => track(first + step))
}

export const describeTrackerBar = (spec: TrackerBarSpec): TrackerBar => {
    const areas = areasOf(spec)

    const areaAt = (position: Track) =>
        areas.find(area => position >= area.from && position <= area.to)?.role

    const roleOf = (position: Track) => areaAt(snap(position))

    const meaningOf = (position: Track): TrackMeaning | undefined => {
        const place = snap(position)
        const role = areaAt(place)
        if (!role) return undefined

        if (role === 'note') {
            return {
                type: 'note',
                pitch: place - spec.notes.from + spec.notes.lowestPitch
            }
        }

        const expressionType = spec.expressions.get(place)
        if (!expressionType) return undefined

        return { type: 'expression', expressionType, scope: scopeOf(role) }
    }

    const meaningsOf = (span: OnBar): TrackMeaning[] =>
        positionsBetween(span).flatMap(position => {
            const meaning = meaningOf(position)
            return meaning ? [meaning] : []
        })

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

    // A rewind on a line of its own is unambiguous; one sharing a line is only
    // the rewind when it is far longer than that line's usual command.
    const shared = spec.rewindTrack !== undefined
    const endsAt = (features: readonly PlacedOnBar[]): RollEnd | undefined => {
        const hold = spec.rewindHold ?? mm(0)
        const candidates = features
            .filter(feature => snap(feature.vertical.from) === rewind)
            .filter(feature => !shared || feature.horizontal.to - feature.horizontal.from >= hold)
            .map(feature => feature.horizontal.from)
        return candidates.length ? { at: mm(Math.min(...candidates)), because: 'rewind' } : undefined
    }

    return {
        id: spec.id,
        name: spec.name,
        width: spec.width,
        trackCount: spec.trackCount,
        endsAt,
        areas,
        expressionTypes: [...new Set(spec.expressions.values())],
        rewindTrack: track(rewind),
        ...(spec.paperSpeed && { paperSpeed: spec.paperSpeed }),
        meaningOf,
        meaningsOf,
        positionOf: meaning => positions.get(keyOf(meaning)),
        roleOf,
        positionsIn: positionsBetween
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
