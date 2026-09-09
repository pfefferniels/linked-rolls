import { HorizontalSpan } from "./Feature"
import { AnySymbol } from "./Symbol"
import { keyOf } from "./TrackerBar"
import { distance, Millimeters, mm } from "./Quantity"
import { partitionPoint } from "./sorted"

/**
 * Tolerance used in collation of roll copies: the acceptable deviation
 * at either end when aligning features across copies.
 */
export interface CollationTolerance {
    /** Tolerance at the start position of a feature. */
    toleranceStart: Millimeters

    /** Tolerance at the end position of a feature. */
    toleranceEnd: Millimeters
}

export const defaultCollationTolerance: CollationTolerance = { toleranceStart: mm(5), toleranceEnd: mm(5) }

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

const nearby = (here: HorizontalSpan, there: HorizontalSpan, tolerance: CollationTolerance): boolean =>
    distance(here.from, there.from) <= tolerance.toleranceStart
    && distance(here.to, there.to) <= tolerance.toleranceEnd

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

const groupBy = <T,>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> =>
    items.reduce((groups, item) => {
        const key = keyOf(item)
        const group = groups.get(key)
        if (group) group.push(item)
        else groups.set(key, [item])
        return groups
    }, new Map<string, T[]>())

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
    const lowest = span.from - tolerance.toleranceStart - WINDOW_SLACK
    const highest = span.from + tolerance.toleranceStart + WINDOW_SLACK
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
