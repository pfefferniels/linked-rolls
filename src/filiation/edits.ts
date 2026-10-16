/**
 * The edits of a version, proposed from what it inserts and deletes:
 * which of its changes belong together, and what shape each group
 * takes, from which the motivation a program can give it follows. Why
 * a musical change was made is left to the editor.
 */
import { v5 } from "uuid"
import { Draft } from "immer"
import { Edition } from "../model/Edition.js"
import { HorizontalSpan } from "../model/Feature.js"
import { AnyCommand, AnySymbol, Expression } from "../model/Symbol.js"
import { Edit, EditShape, motivationProposedFor, musicalChange, technicalChange } from "../model/Edit.js"
import { deletedBy, editsOf, insertedBy, Version } from "../model/Version.js"
import { distance, Millimeters, mm, subtract } from "../model/Quantity.js"
import { TrackerBar, TrackMeaning } from "../systems/TrackerBar.js"
import { trackerBarOf } from "../systems/index.js"
import { operationOf, substitutionsBetween } from "../collation/substitution.js"
import { isCollationsOwn } from "../collation/Collation.js"
import { predecessorOf } from "../analysis/stemma.js"
import { placeOf, snapshotOf } from "../analysis/text.js"
import { symbolsIn, versionIn } from "../lookup/lookup.js"
import { groupBy } from "../shared/utils.js"
import { EditionOp, reading } from "../ops/draft.js"
import { ineffectiveAmong } from "./presence.js"
import { reads } from "./readings.js"
import { editRules, madeWith } from "./record.js"

/**
 * How far a perforation may be put from where it stood for the two to be
 * one move. WM 225 moves commands by up to about 60 mm.
 * @category Filiation
 */
export const defaultShiftWithin = mm(60)

/**
 * How far an Off may follow an On for the two to be one function turned
 * on and off again, as an accent is. WM 225 has crescendo accents of up
 * to about 55 mm.
 * @category Filiation
 */
export const defaultPairWithin = mm(60)

/**
 * How near the onsets of a perforation and the one put in its place lie
 * for the one to be a longer or shorter version of the other rather than
 * a moved one. The figure `mergeEdits` guesses with.
 * @category Filiation
 */
export const defaultResizeWithin = mm(5)

/**
 * How near two perforations lie to stand at one place: the commands of a
 * cancel row, or an accent's On and the note set off for it.
 * @category Filiation
 */
export const defaultSamePlaceWithin = mm(2)

/**
 * What a proposal of edits is computed with. Every value has a default,
 * the one the edits of WM 225 are reproduced with.
 * @category Filiation
 */
export interface EditOptions {
    /** `defaultShiftWithin` */
    shiftWithin?: Millimeters
    /** `defaultPairWithin` */
    pairWithin?: Millimeters
    /** `defaultResizeWithin` */
    resizeWithin?: Millimeters
    /** `defaultSamePlaceWithin` */
    samePlaceWithin?: Millimeters
}

/**
 * Why changes were taken for one edit.
 * @category Filiation
 */
export type EditGrouping =
    /** A change nothing else on its line goes with. */
    | 'single'
    /** A latched function turned on and off again shortly after, as an accent is, or off and on again, added or withdrawn. */
    | 'pair'
    /** Notes of one pitch, or held commands of one function, that overlap: a note struck again, two tied into one, one made longer. */
    | 'overlap'
    /** What the version deletes on a line, and what it puts nearby in its place. */
    | 'move'
    /** A held command of the version standing for a latched pair of the parent's. */
    | 'substitution'
    /** Cancels punched across several lines at one place. */
    | 'row'

/**
 * An edit proposed from the changes of a version.
 * @category Filiation
 */
export interface ProposedEdit {
    /** The ids of the symbols it inserts, in the order of their places. */
    insert: string[]
    /** The ids of the symbols it deletes, in the order of their places. */
    delete: string[]
    /** The shape of the change, where it takes one the program knows. */
    shape?: EditShape
    grouping: EditGrouping
}

type Side = 'insert' | 'delete'

/** A symbol the version inserts or deletes, with where it lies and what it is. */
interface Change {
    symbol: AnyCommand
    side: Side
    place: HorizontalSpan
    /** Ineffective in the text it stands in: the version's for an insertion, the parent's for a deletion. */
    redundant: boolean
    /** A command the other text's system has no word for. */
    foreign: boolean
}

/** A group of changes on its way to an edit. */
type Group = { changes: Change[], grouping: EditGrouping }

const isExpression = (symbol: AnySymbol): symbol is Expression => symbol.type === 'expression'

/** The line a command stands on: a latched function, a held one, a command no other system shares, or a pitch. */
const lineOf = (symbol: AnyCommand): { key: string, latched: boolean } => {
    if (symbol.type === 'note') return { key: `note ${symbol.pitch}`, latched: false }
    const operation = operationOf(symbol.expressionType)
    if (!operation) return { key: `expression ${symbol.scope} ${symbol.expressionType}`, latched: false }
    const operates = operation.sided ? `${operation.operates} ${symbol.scope}` : operation.operates
    return operation.spelling === 'held'
        ? { key: `held ${operates}`, latched: false }
        : { key: operates, latched: true }
}

const spellingOf = (symbol: AnySymbol) =>
    isExpression(symbol) ? operationOf(symbol.expressionType)?.spelling : undefined

const isOn = (symbol: AnySymbol): boolean => spellingOf(symbol) === 'on'

const meaningOf = (symbol: AnyCommand): TrackMeaning =>
    symbol.type === 'note'
        ? { type: 'note', pitch: symbol.pitch }
        : { type: 'expression', expressionType: symbol.expressionType, scope: symbol.scope }

/** The ids of the commands of the text that its latched functions make no use of. */
const ineffectiveIn = (bar: TrackerBar | undefined, text: readonly AnySymbol[], placed: (symbol: AnySymbol) => HorizontalSpan | undefined): Set<string> =>
    bar
        ? ineffectiveAmong(bar, text.flatMap(symbol => {
            const place = placed(symbol)
            return symbol.type !== 'text' && place ? [{ id: symbol.id, meaning: meaningOf(symbol), place }] : []
        }))
        : new Set()

const lengthOf = (span: HorizontalSpan): Millimeters => subtract(span.to, span.from)
const ofSide = (changes: readonly Change[], side: Side) => changes.filter(change => change.side === side)
const byPlace = (a: Change, b: Change) => a.place.from - b.place.from || (a.symbol.id < b.symbol.id ? -1 : a.symbol.id > b.symbol.id ? 1 : 0)
const inOrder = (changes: readonly Change[]) => [...changes].sort(byPlace)
const typesOf = (changes: readonly Change[]) => inOrder(changes).map(change =>
    change.symbol.type === 'expression' ? change.symbol.expressionType : change.symbol.type)
const sameSequence = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((value, i) => value === b[i])
const onsetOf = (changes: readonly Change[]) => Math.min(...changes.map(change => change.place.from))

/**
 * The commands of one text that turn its function on and off again: an
 * Off with the Ons right before it within the window. Ons that follow
 * each other are one punched where the other stands, so an accent whose
 * On moved forward keeps the one it left behind. The changes are those
 * of one text on one line, in order, between two commands both texts keep.
 */
const pairsIn = (changes: readonly Change[], within: Millimeters): Change[][] =>
    changes.flatMap((change, index) => {
        if (isOn(change.symbol)) return []
        const ons: Change[] = []
        for (let i = index - 1; i >= 0 && isOn(changes[i].symbol) && change.place.from - changes[i].place.from <= within; i--) {
            ons.unshift(changes[i])
        }
        return ons.length > 0 ? [[...ons, change]] : []
    })

/**
 * Of the changes left, an On with the Off right before it in the same
 * text within the window, both of use to it: a function broken off and
 * taken up again.
 */
const breaksIn = (changes: readonly Change[], left: ReadonlySet<Change>, within: Millimeters): Change[][] => {
    const breaks: Change[][] = []
    changes.forEach((change, index) => {
        const before = changes[index - 1]
        if (!before || !left.has(change) || !left.has(before) || breaks.some(pair => pair.includes(before))) return
        if (before.redundant || change.redundant || !isOn(change.symbol) || isOn(before.symbol)) return
        if (change.place.from - before.place.from <= within) breaks.push([before, change])
    })
    return breaks
}

/** Whether the one unit puts the perforations of the other elsewhere, near enough and each moved by about as much. */
const movesRigidly = (deleted: readonly Change[], inserted: readonly Change[], options: Required<EditOptions>): boolean => {
    const before = inOrder(deleted)
    const after = inOrder(inserted)
    if (!sameSequence(typesOf(before), typesOf(after))) return false
    const shifts = after.map((change, index) => change.place.from - before[index].place.from)
    return Math.abs(shifts[0]) <= options.shiftWithin
        && Math.max(...shifts) - Math.min(...shifts) <= options.resizeWithin
}

/** What the version deletes, each with what it puts in its place: the nearest candidate first, each taken once. */
const nearestFirst = (deleted: readonly Change[][], inserted: readonly Change[][], fits: (deleted: Change[], inserted: Change[]) => boolean): Map<Change[], Change[]> => {
    const candidates = deleted.flatMap(one => inserted
        .filter(other => fits(one, other))
        .map(other => ({ one, other, gap: Math.abs(onsetOf(other) - onsetOf(one)) })))
    candidates.sort((a, b) => a.gap - b.gap || byPlace(inOrder(a.one)[0], inOrder(b.one)[0]) || byPlace(inOrder(a.other)[0], inOrder(b.other)[0]))
    const moves = new Map<Change[], Change[]>()
    const taken = new Set<Change[]>()
    for (const { one, other } of candidates) {
        if (moves.has(one) || taken.has(other)) continue
        moves.set(one, other)
        taken.add(other)
    }
    return moves
}

/** The units as groups, a deleted one together with what it moved to. */
const asGroups = (units: readonly Change[][], moves: ReadonlyMap<Change[], Change[]>): Group[] => {
    const partners = new Set(moves.values())
    return units.flatMap((unit): Group[] => {
        if (partners.has(unit)) return []
        const partner = moves.get(unit)
        if (partner) return [{ changes: [...unit, ...partner], grouping: 'move' }]
        return [{ changes: unit, grouping: unit.length === 1 ? 'single' : 'overlap' }]
    })
}

/**
 * The changes on a latched line. A command both texts keep sets the
 * function alike in both, so the line falls into segments between such
 * commands, and no edit runs across one.
 *
 * Within a segment, a pair one text turns the function on and off again
 * with is a unit. A pair the version withdraws and one it adds that puts
 * each command elsewhere by about as much is one move. Otherwise each
 * command the version deletes goes with the nearest of the same type it
 * puts nearby, a pair broken up only where every command of it moves.
 * What is left stands alone, but for an Off and an On right after it,
 * which break the function off and take it up again.
 */
const latchedGroups = (changes: readonly Change[], kept: readonly { symbol: AnyCommand, place: HorizontalSpan }[], options: Required<EditOptions>): Group[] => {
    type Entry = { at: number, on: boolean, id: string, change?: Change }
    const entries: Entry[] = [
        ...kept.map(({ symbol, place }) => ({ at: place.from, on: isOn(symbol), id: symbol.id })),
        ...changes.map(change => ({ at: change.place.from, on: isOn(change.symbol), id: change.symbol.id, change }))
    ]
    // At one place a cancel comes first, as the valves take it.
    entries.sort((a, b) => a.at - b.at || Number(a.on) - Number(b.on) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

    const segments: Change[][] = [[]]
    for (const entry of entries) {
        if (entry.change) segments[segments.length - 1].push(entry.change)
        else if (segments[segments.length - 1].length > 0) segments.push([])
    }

    return segments.flatMap(segment => {
        const added = pairsIn(ofSide(segment, 'insert'), options.pairWithin)
        const withdrawn = pairsIn(ofSide(segment, 'delete'), options.pairWithin)
        const paired = new Set([...added, ...withdrawn].flat())
        const singles = segment.filter(change => !paired.has(change))

        const pairMoves = nearestFirst(withdrawn, added, (one, other) => movesRigidly(one, other, options))
        const movedPairs = new Set([...pairMoves.keys(), ...pairMoves.values()])

        let open = [...added, ...withdrawn].filter(pair => !movedPairs.has(pair))
        let units: Change[][] = []
        let moves = new Map<Change[], Change[]>()
        for (;;) {
            units = [...singles, ...open.flat()].map(change => [change])
            moves = nearestFirst(
                units.filter(unit => unit[0].side === 'delete'),
                units.filter(unit => unit[0].side === 'insert'),
                (one, other) => movesRigidly(one, other, options))
            const moved = new Set([...moves.keys(), ...moves.values()].flat())
            const intact = open.filter(pair => !pair.every(change => moved.has(change)))
            if (intact.length === 0) break
            open = open.filter(pair => !intact.includes(pair))
        }
        const whole = [...added, ...withdrawn].filter(pair => !movedPairs.has(pair) && !open.includes(pair))
        const moved = new Set([...moves.keys(), ...moves.values()].flat())
        const left = new Set(units.flat().filter(change => !moved.has(change)))
        const breaks = [
            ...breaksIn(ofSide(segment, 'insert'), left, options.pairWithin),
            ...breaksIn(ofSide(segment, 'delete'), left, options.pairWithin)
        ]
        const broken = new Set(breaks.flat())
        return [
            ...asGroups([...pairMoves.keys(), ...pairMoves.values()], pairMoves),
            ...[...whole, ...breaks].map((pair): Group => ({ changes: pair, grouping: 'pair' })),
            ...asGroups(units.filter(unit => !broken.has(unit[0])), moves)
        ]
    })
}

/**
 * The changes on a line of perforations that last as long as they
 * sound: a pitch, or a held function. A perforation both texts keep
 * divides the line. Changes that overlap are a unit, a note struck again
 * or two tied into one, except where as many are deleted as inserted:
 * then each deleted one is a unit with the inserted one in its place, in
 * order. A unit the version deletes and one of the same shape it puts
 * nearby are one move.
 */
const spanGroups = (changes: readonly Change[], kept: readonly { place: HorizontalSpan }[], options: Required<EditOptions>): Group[] => {
    type Entry = { from: number, to: number, change?: Change }
    const entries: Entry[] = [
        ...kept.map(({ place }) => ({ from: place.from, to: place.to })),
        ...inOrder(changes).map(change => ({ from: change.place.from, to: change.place.to, change }))
    ].sort((a, b) => a.from - b.from)

    const units: Change[][] = []
    const segmentOf = new Map<Change[], number>()
    let segment = 0
    let open: Change[] = []
    let reach = -Infinity
    const close = () => {
        const inserted = ofSide(open, 'insert')
        const deleted = ofSide(open, 'delete')
        const closed = inserted.length > 1 && inserted.length === deleted.length
            ? inserted.map((change, index) => [deleted[index], change])
            : open.length > 0 ? [open] : []
        closed.forEach(unit => segmentOf.set(unit, segment))
        units.push(...closed)
        open = []
        reach = -Infinity
    }
    for (const entry of entries) {
        if (!entry.change) {
            close()
            segment++
            continue
        }
        if (entry.from > reach) close()
        open.push(entry.change)
        reach = Math.max(reach, entry.to)
    }
    close()

    const pure = units.filter(unit => unit.every(change => change.side === unit[0].side))
    const moves = nearestFirst(
        pure.filter(unit => unit[0].side === 'delete'),
        pure.filter(unit => unit[0].side === 'insert'),
        (one, other) => segmentOf.get(one) === segmentOf.get(other) && movesRigidly(one, other, options))
    return asGroups(units, moves)
}

/**
 * Cancels the version punches across three lines or more at one place,
 * none of them closing a pair or moved: a cancel row, as a roll has
 * before its first note.
 */
const rowsAmong = (groups: readonly Group[], within: Millimeters): Group[] => {
    const cancels = groups
        .filter(group => group.grouping === 'single')
        .flatMap(group => group.changes)
        .filter(change => change.side === 'insert' && spellingOf(change.symbol) === 'off')
        .sort(byPlace)
    const rows: Group[] = []
    for (let i = 0; i < cancels.length;) {
        let j = i + 1
        while (j < cancels.length && cancels[j].place.from - cancels[i].place.from <= within) j++
        const row = cancels.slice(i, j)
        if (new Set(row.map(change => lineOf(change.symbol).key)).size >= 3) rows.push({ changes: row, grouping: 'row' })
        i = j
    }
    return rows
}

/** Whether the bar spells an accent with exactly these commands. */
const spellsAccent = (bar: TrackerBar | undefined, types: readonly string[]): boolean =>
    (bar?.accents ?? []).some(accent => sameSequence(types, accent))

/** The shape a group of changes takes, where it is one the program knows. */
const shapeOfGroup = (group: Group, bar: TrackerBar | undefined, accentsAt: readonly number[], options: Required<EditOptions>): EditShape | undefined => {
    const inserted = inOrder(ofSide(group.changes, 'insert'))
    const deleted = inOrder(ofSide(group.changes, 'delete'))

    if (group.grouping === 'substitution' || group.changes.some(change => change.foreign)) return 'recoding'
    if (group.changes.every(change => change.redundant)) {
        if (deleted.length === 0) return 'add-redundancy'
        if (inserted.length === 0) return 'remove-redundancy'
    }
    if (group.grouping === 'pair') {
        return deleted.length === 0 && spellsAccent(bar, typesOf(inserted.slice(-2))) ? 'additional-accent' : undefined
    }
    if (inserted.length === 0 || deleted.length === 0) return undefined

    if (inserted.length === 1 && deleted.length === 1) {
        const [after, before] = [inserted[0].place, deleted[0].place]
        if (distance(after.from, before.from) >= options.resizeWithin) return 'shift'
        // A note set off from its chord where the version puts an accent serves the accent.
        const [early, late] = [Math.min(after.from, before.from), Math.max(after.from, before.from)]
        const setOff = inserted[0].symbol.type === 'note' && late - early >= options.samePlaceWithin
            && accentsAt.some(at => at >= early - options.samePlaceWithin && at <= late + options.samePlaceWithin)
        if (setOff) return 'additional-accent'
        return lengthOf(after) < lengthOf(before) ? 'shorten' : 'prolong'
    }
    const notes = group.changes.every(change => change.symbol.type === 'note')
    if (notes && deleted.length === 1) return 'shorten'
    if (notes && inserted.length === 1) return 'prolong'
    if (sameSequence(typesOf(inserted), typesOf(deleted))) return 'shift'
    return undefined
}

const settingsOf = (options: EditOptions): Required<EditOptions> => ({
    shiftWithin: options.shiftWithin ?? defaultShiftWithin,
    pairWithin: options.pairWithin ?? defaultPairWithin,
    resizeWithin: options.resizeWithin ?? defaultResizeWithin,
    samePlaceWithin: options.samePlaceWithin ?? defaultSamePlaceWithin
})

/**
 * The edits of the version, proposed from what its edits insert and
 * delete, however they group it now. The proposal depends on the
 * version's changes and the text of its parent alone, so it is the same
 * whatever order the changes come in.
 *
 * Changes are read line by line: a latched function on its side of the
 * keyboard, a held one, or a pitch. A command or a note both texts keep
 * divides its line, and no edit runs across one, so that every edit
 * stays at one place. On a latched line, a function turned on and off
 * again shortly after is one edit, as an accent is; a pair withdrawn and
 * put elsewhere whole is one move, and so is a command put elsewhere on
 * its own, the nearest first; an Off with an On right after it breaks
 * the function off and takes it up again. Notes, and commands held for
 * as long as they last, are one edit where they overlap, and one move
 * where a note is put nearby. Where the version's system has no word for
 * a command of the parent's, a held command standing for a latched pair
 * is one edit with it; what has no counterpart stands alone. Cancels
 * punched across three lines or more at one place are one edit, as a
 * cancel row is.
 *
 * The shape is read off the group: a pair the bar spells an accent with
 * is an additional accent, as is a note set off from its chord by a few
 * millimetres where the version puts an accent's On; a perforation put
 * elsewhere is a shift, or where it begins about where the other did,
 * shortened or prolonged; a note struck again is shortened, two tied
 * prolonged; a change the text makes no use of is a redundancy added or
 * removed; and a change the other system has no word for is a recoding.
 * Whether a shift corrects an error, and why any change was made, is
 * not read off the shape.
 *
 * A version that derives from none states its text, not a change of
 * another, and each of its symbols stands alone.
 * @category Filiation
 */
export const proposeEdits = (edition: Edition, versionId: string, options: EditOptions = {}): ProposedEdit[] => {
    const settings = settingsOf(options)
    const version = versionIn(edition, versionId)
    if (!version) return []
    const parent = predecessorOf(edition, versionId)
    if (!parent) {
        return insertedBy(version).map(symbol => ({ insert: [symbol.id], delete: [], grouping: 'single' as const }))
    }
    const bar = trackerBarOf(version.system)
    const parentBar = trackerBarOf(parent.system) ?? bar

    const placed = (symbol: AnySymbol) => placeOf(edition, symbol)
    const parentText = snapshotOf(edition, parent.id)
    const ineffectiveBefore = ineffectiveIn(parentBar, parentText, placed)
    const ineffectiveAfter = ineffectiveIn(bar, snapshotOf(edition, versionId), placed)

    const unplaced: ProposedEdit[] = []
    const changes: Change[] = []
    const add = (symbol: AnySymbol, side: Side) => {
        const place = placed(symbol)
        if (!place || symbol.type === 'text') {
            unplaced.push({ insert: side === 'insert' ? [symbol.id] : [], delete: side === 'delete' ? [symbol.id] : [], grouping: 'single' })
            return
        }
        const other = side === 'insert' ? parentBar : bar
        changes.push({
            symbol,
            side,
            place,
            redundant: (side === 'insert' ? ineffectiveAfter : ineffectiveBefore).has(symbol.id),
            foreign: isExpression(symbol) && !!other && !reads(other, meaningOf(symbol))
        })
    }
    insertedBy(version).forEach(symbol => add(symbol, 'insert'))
    symbolsIn(edition, deletedBy(version)).forEach(symbol => add(symbol, 'delete'))
    changes.sort(byPlace)

    // A held command of the version's system stands for a latched pair of the parent's.
    const foreign = changes.filter(change => change.foreign)
    const substituted = substitutionsBetween(
        ofSide(foreign, 'insert').map(change => change.symbol),
        ofSide(foreign, 'delete').map(change => change.symbol),
        placed
    ).map(({ replaced, by }): Group => {
        const ids = new Set([...replaced, ...by].map(symbol => symbol.id))
        return { changes: foreign.filter(change => ids.has(change.symbol.id)), grouping: 'substitution' }
    })
    const substitutedIds = new Set(substituted.flatMap(group => group.changes.map(change => change.symbol.id)))
    const recoded = foreign
        .filter(change => !substitutedIds.has(change.symbol.id))
        .map((change): Group => ({ changes: [change], grouping: 'single' }))

    const changed = new Set(changes.map(change => change.symbol.id))
    const keptOn = new Map<string, { symbol: AnyCommand, place: HorizontalSpan }[]>()
    for (const symbol of parentText) {
        const place = placed(symbol)
        if (changed.has(symbol.id) || symbol.type === 'text' || !place) continue
        const key = lineOf(symbol).key
        keptOn.set(key, [...(keptOn.get(key) ?? []), { symbol, place }])
    }
    const groupLines = (among: readonly Change[]): Group[] =>
        [...groupBy(among, change => lineOf(change.symbol).key)].flatMap(([key, onLine]) =>
            lineOf(onLine[0].symbol).latched
                ? latchedGroups(onLine, keptOn.get(key) ?? [], settings)
                : spanGroups(onLine, keptOn.get(key) ?? [], settings))

    const native = changes.filter(change => !change.foreign)
    const first = groupLines(native)
    const rows = rowsAmong(first, settings.samePlaceWithin)
    const inRow = new Set(rows.flatMap(row => row.changes))
    const lines = inRow.size > 0 ? groupLines(native.filter(change => !inRow.has(change))) : first

    // Where the version puts the On of one of its bar's accents.
    const accentOns = new Set((bar?.accents ?? []).map(accent => accent[0]))
    const accentsAt = ofSide(native, 'insert')
        .filter(change => isExpression(change.symbol) && accentOns.has(change.symbol.expressionType))
        .map(change => change.place.from)

    const proposed = [...substituted, ...recoded, ...lines, ...rows]
        .sort((a, b) => byPlace(inOrder(a.changes)[0], inOrder(b.changes)[0]))
        .map((group): ProposedEdit => {
            const shape = shapeOfGroup(group, bar, accentsAt, settings)
            return {
                insert: inOrder(ofSide(group.changes, 'insert')).map(change => change.symbol.id),
                delete: inOrder(ofSide(group.changes, 'delete')).map(change => change.symbol.id),
                ...(shape && { shape }),
                grouping: group.grouping
            }
        })
    return [...proposed, ...unplaced]
}

/** The namespace the ids of adopted edits are minted in, so that adopting again gives them again. */
const EDITS = '3c9e0f62-1d4b-4a7e-9b55-8e2f7a6d1c04'

const exchangeKey = (inserted: readonly string[], deleted: readonly string[]): string =>
    `${[...inserted].sort().join(',')}/${[...deleted].sort().join(',')}`

/**
 * The motivation a program states for each change the version makes,
 * by the id of the symbol it inserts or deletes: the one the shape of
 * the proposed edit it belongs to calls for (`motivationProposedFor`),
 * musical or technical. A version that derives from none makes no
 * change, and its symbols are given none.
 * @category Filiation
 */
export const proposedMotivations = (edition: Edition, versionId: string, options: EditOptions = {}): ReadonlyMap<string, string> => {
    const motivations = new Map<string, string>()
    if (!predecessorOf(edition, versionId)) return motivations
    for (const edit of proposeEdits(edition, versionId, options)) {
        const motivation = motivationProposedFor(edit.shape)
        for (const id of [...edit.insert, ...edit.delete]) motivations.set(id, motivation)
    }
    return motivations
}

/**
 * The motivation a program states for an edit making these changes:
 * the generic musical one where any of them is a musical change, or one
 * the proposal does not see, and the technical one where all are
 * technical.
 */
export const motivationOfChanges = (motivations: ReadonlyMap<string, string>, symbolIds: readonly string[]): string =>
    symbolIds.some(id => (motivations.get(id) ?? musicalChange) === musicalChange) ? musicalChange : technicalChange

/**
 * The edits the version comes to state when the proposal is adopted:
 * those it keeps, and those put in place of the rest.
 */
const adoptedEditsOf = (edition: Edition, version: Readonly<Version>, options: EditOptions): { held: Edit[], proposed: Edit[] } => {
    const edits = editsOf(version)
    const held = edits.filter(edit => !isCollationsOwn(edit))
    const spoken = new Set(held.flatMap(edit => [...(edit.insert ?? []).map(symbol => symbol.id), ...(edit.delete ?? [])]))
    const symbolOf = new Map(insertedBy(version).map(symbol => [symbol.id, symbol]))
    const stated = new Map(edits.map(edit => [exchangeKey((edit.insert ?? []).map(symbol => symbol.id), edit.delete ?? []), edit]))

    const made = (inserted: readonly string[], deleted: readonly string[], motivation: string): Edit => {
        const key = exchangeKey(inserted, deleted)
        const same = stated.get(key)
        // An edit over the same changes stays, with the kind of change it states, which the editor may have said.
        if (same) return same.motivation === undefined ? { ...same, motivation } : same
        return {
            type: 'edit',
            id: v5(`edit|${version.id}|${key}`, EDITS),
            motivation,
            ...(inserted.length > 0 && { insert: inserted.map(id => symbolOf.get(id)!) }),
            ...(deleted.length > 0 && { delete: [...deleted] })
        }
    }

    const proposed = proposeEdits(edition, version.id, options).flatMap(edit => {
        const motivation = motivationProposedFor(edit.shape)
        const free = (ids: readonly string[]) => ids.filter(id => !spoken.has(id))
        const [inserted, deleted] = [free(edit.insert), free(edit.delete)]
        if (inserted.length === edit.insert.length && deleted.length === edit.delete.length) {
            return [made(inserted, deleted, motivation)]
        }
        // What an edit that stays leaves of a proposed one stands symbol by symbol.
        return [...inserted.map(id => made([id], [], motivation)), ...deleted.map(id => made([], [id], motivation))]
    })
    return { held, proposed }
}

/**
 * Puts the proposed edits (`proposeEdits`) in place of the program's
 * edits of the versions, every version but the root where none are
 * named: those that say nothing of why they were made, or only that they
 * are musical or technical changes (`isCollationsOwn`). An edit with a
 * motivation of the editor's or held under a belief stays as it is, and
 * what a proposed edit shares with it stands symbol by symbol beside it.
 * An edit stated already over the very same symbols as a proposed one
 * is kept with its id and the kind of change it states, which the
 * editor may have said otherwise than the program read it; the others
 * are new, with ids that adopting again gives again. An edit that
 * states no kind has the motivation its shape calls for
 * (`motivationProposedFor`): the generic musical one for a musical
 * change, whose reason is left to the editor, and the technical one for
 * a technical change.
 *
 * Applied on the same draft after `adoptStemma`, it proposes the edits of
 * the stemma adopted, as one undo step. The edition's creation comes to
 * name the rule that keeps an edit at one place among its principles,
 * and this release among its software.
 * @category Operations
 */
export const adoptEdits = (versionIds?: readonly string[], options: EditOptions = {}): EditionOp => reading(edition => {
    const targets = (versionIds ?? edition.versions.map(version => version.id))
        .map(id => versionIn(edition, id))
        .filter((version): version is Readonly<Version> => version !== undefined && predecessorOf(edition, version.id) !== undefined)
    const adopted = new Map(targets.flatMap(version => {
        const { held, proposed } = adoptedEditsOf(edition, version, options)
        const edits = [...held, ...proposed]
        const stated = editsOf(version)
        if (edits.length === stated.length && edits.every((edit, index) => edit === stated[index])) return []
        return [[version.id, { ...version, edits }]]
    }))
    const creation = madeWith(edition.creation, [editRules.onePlace])
    // Each version is put in place whole: one that an operation before put
    // on the same draft, as adopting a stemma does, is no draft to write to.
    return draft => {
        draft.versions.forEach((version, index) => {
            const changed = adopted.get(version.id)
            if (changed) draft.versions[index] = changed as Draft<Version>
        })
        if (adopted.size > 0) draft.creation = creation as Draft<Edition['creation']>
    }
})
