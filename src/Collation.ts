import { Edit, EditType } from "./Edit"
import { HorizontalSpan } from "./Feature"
import { AnySymbol } from "./Symbol"
import { keyOf } from "./TrackerBar"
import { distance, Millimeters, mm } from "./Quantity"
import { partitionPoint } from "./sorted"
import { groupBy } from "./utils"

/** A value taken at each end of a feature: where it begins and where it stops. */
export interface BothEnds<T> {
    from: T
    to: T
}

/** How far one text puts a feature from where another puts it, at either end. */
export type Displacement = BothEnds<Millimeters>

/**
 * The window two readings of one feature must fall in to be collated:
 * how far apart they may lie at either end, and where that window is
 * centred.
 *
 * The centre is worth stating. Two copies of one roll differ by a
 * systematic offset as well as by scatter, and a window centred on
 * nothing has to be widened by the whole of that offset before it
 * admits what the offset alone displaces. Naming the offset lets the
 * tolerance stand for the scatter only. A window that names none is
 * centred on nothing, which is what every window written before the
 * offset was held here means.
 */
export interface CollationTolerance {
    /** How far the two readings may lie apart at the start of a feature, measured from `offsetStart`. */
    toleranceStart: Millimeters

    /** How far they may lie apart at the end, measured from `offsetEnd`. */
    toleranceEnd: Millimeters

    /**
     * How much later the derived version puts the start of a feature
     * than the version it is read against, where the two differ
     * systematically. Nothing where they do not.
     *
     * The direction is the one a collation measures in, the child less
     * the parent, and it is not symmetric: stored the other way round
     * the window sits on the wrong side of the readings and merges what
     * it should separate. A measurement taken over the parent's copies
     * gives the negative of this, which is what `toleranceAcross` asks
     * the side for.
     */
    offsetStart?: Millimeters

    /** The same at the end of a feature, in the same direction. */
    offsetEnd?: Millimeters
}

export const defaultCollationTolerance: CollationTolerance = { toleranceStart: mm(5), toleranceEnd: mm(5) }

/** Where the window is centred at the start of a feature, on nothing where it names no offset. */
export const offsetStartOf = (tolerance: CollationTolerance): Millimeters => tolerance.offsetStart ?? mm(0)

/** Where the window is centred at the end of a feature. */
export const offsetEndOf = (tolerance: CollationTolerance): Millimeters => tolerance.offsetEnd ?? mm(0)

/**
 * Whether the window admits the displacement at each end, taken apart.
 *
 * The two ends answer different questions. The onset, with the kind,
 * decides identity: whether the two copies read one command. The end
 * decides duration: whether the same command was lengthened or
 * shortened. A collation joins two readings only where both admit, so a
 * separation may be the work of either, and an editor looking at one
 * wants to know which.
 *
 * A difference at the end alone has at least three causes and only the
 * first is an editorial act. A punch may genuinely have been lengthened
 * or shortened. A chain of punches, bridged to keep the paper strong,
 * may have been read as one perforation on one copy and as repeated
 * notes on the other, which Phillips names as a common error of roll
 * scanning and which runs in both directions (p. 173). Or a reading may
 * report something other than the punched slot, as a pneumatic reader
 * reports how long a valve stayed open. Long held notes are where the
 * second is likeliest, since that is where the chains are.
 */
export const admittedAtEnds = (tolerance: CollationTolerance, displacement: Displacement): BothEnds<boolean> => ({
    from: distance(displacement.from, offsetStartOf(tolerance)) <= tolerance.toleranceStart,
    to: distance(displacement.to, offsetEndOf(tolerance)) <= tolerance.toleranceEnd
})

/** Whether the window admits the displacement: within the tolerance of the offset, at both ends. */
export const admits = (tolerance: CollationTolerance, displacement: Displacement): boolean => {
    const ends = admittedAtEnds(tolerance, displacement)
    return ends.from && ends.to
}

/** Where a symbol lies along the roll, as its carriers put it, or nothing for a symbol without a place. */
export type Locate = (symbol: AnySymbol) => Readonly<HorizontalSpan> | undefined

/**
 * What a symbol says, as a key: the pitch of a note, the type and scope
 * of an expression. Symbols collate within one key only. This is the
 * same key the tracker bars are indexed by, so two symbols collate
 * exactly where two bars would read them as the same thing, which is
 * what carries a note across a transfer between systems.
 */
const kindOf = (symbol: AnySymbol): string =>
    symbol.type === 'text' ? 'text' : keyOf(symbol)

const displacementBetween = (here: HorizontalSpan, there: HorizontalSpan): Displacement =>
    ({ from: mm(here.from - there.from), to: mm(here.to - there.to) })

const nearby = (here: HorizontalSpan, there: HorizontalSpan, tolerance: CollationTolerance): boolean =>
    admits(tolerance, displacementBetween(here, there))

/**
 * Two symbols collate when they are of one kind, say the same thing
 * (pitch, or expression type and scope), and lie at about the same
 * place along the roll.
 */
export const isCollatable = (
    a: AnySymbol,
    b: AnySymbol,
    locate: Locate,
    tolerance: CollationTolerance = defaultCollationTolerance
): boolean => {
    if (kindOf(a) !== kindOf(b)) return false

    const here = locate(a)
    const there = locate(b)
    return here !== undefined && there !== undefined && nearby(here, there, tolerance)
}

export type Collation = { symbol: Readonly<AnySymbol>, counterpart: Readonly<AnySymbol> }

/** A symbol that has a place, with its place and its position in the list it came from. */
type Placed = { symbol: Readonly<AnySymbol>, index: number, horizontal: HorizontalSpan }

const placed = (symbols: readonly Readonly<AnySymbol>[], locate: Locate): Placed[] =>
    symbols.flatMap((symbol, index) => {
        const horizontal = locate(symbol)
        return horizontal ? [{ symbol, index, horizontal }] : []
    })

/** The placed symbols by kind, each kind in order of onset. */
const byKindInOrderOfOnset = (symbols: readonly Placed[]): Map<string, Placed[]> => {
    const groups = groupBy(symbols, ({ symbol }) => kindOf(symbol))
    groups.forEach(group => group.sort((a, b) => a.horizontal.from - b.horizontal.from))
    return groups
}

/** Widens the onset window by a hair, so that rounding in its bounds cannot leave out what `nearby` accepts. */
const WINDOW_SLACK = 1e-9

/** The symbols of a kind whose onset lies within the start tolerance of the span. */
const nearOnsetOf = (kind: readonly Placed[], span: HorizontalSpan, tolerance: CollationTolerance): Placed[] => {
    const centre = span.from - offsetStartOf(tolerance)
    const lowest = centre - tolerance.toleranceStart - WINDOW_SLACK
    const highest = centre + tolerance.toleranceStart + WINDOW_SLACK
    const first = partitionPoint(kind, candidate => candidate.horizontal.from < lowest)
    const end = partitionPoint(kind, candidate => candidate.horizontal.from <= highest)
    return kind.slice(first, end)
}

/** Each of the own symbols with every inherited symbol it collates with, both in the order given. */
export const collationsOf = (
    own: readonly Readonly<AnySymbol>[],
    inherited: readonly Readonly<AnySymbol>[],
    locate: Locate,
    tolerance: CollationTolerance = defaultCollationTolerance
): Collation[] => {
    const kinds = byKindInOrderOfOnset(placed(inherited, locate))

    return placed(own, locate).flatMap(({ symbol, horizontal }) =>
        nearOnsetOf(kinds.get(kindOf(symbol)) ?? [], horizontal, tolerance)
            .filter(candidate => nearby(horizontal, candidate.horizontal, tolerance))
            .sort((a, b) => a.index - b.index)
            .map(({ symbol: counterpart }) => ({ symbol, counterpart })))
}

/** The edit type a collation draws by itself, from the two systems' vocabularies rather than off the paper. */
const drawnByCollation: EditType = 'replace-with-equivalent'

/**
 * Whether the edit is one a collation writes by itself: a bare
 * insertion or a bare deletion saying nothing further, or an
 * equivalence between two systems' spellings for one command.
 *
 * Collating again rewrites these and keeps the rest. An edit that says
 * what the change is, or why it was made, or what it rests on, is an
 * editor's reading of the difference between two texts, and collating
 * the two again is no reason to discard it.
 *
 * An equivalence counts as the collation's own even where an editor
 * added a motivation to it, because it is derived rather than read:
 * freezing it would leave the transfers, where nearly every edit is
 * one, unable to be collated again at all. What an editor wrote on it
 * is not lost by that, since `connectVersions` keeps an equivalence it
 * draws a second time over the very same symbols.
 */
export const isCollationsOwn = (edit: Readonly<Edit>): boolean =>
    edit.editType === drawnByCollation
    || (edit.editType === undefined && edit.motivation === undefined && edit['@annotation'] === undefined)
