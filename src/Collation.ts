import { HorizontalSpan } from "./Feature"
import { AnySymbol } from "./Symbol"
import { distance, Millimeters, mm } from "./Quantity"

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
export type Locate = (symbol: AnySymbol) => Readonly<{ horizontal: HorizontalSpan }> | undefined

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
    if (a.type !== b.type) return false
    if (a.type === 'note' && b.type === 'note' && a.pitch !== b.pitch) return false
    if (a.type === 'expression' && b.type === 'expression'
        && (a.expressionType !== b.expressionType || a.scope !== b.scope)) return false

    const here = locate(a)?.horizontal
    const there = locate(b)?.horizontal
    if (!here || !there) return false

    return distance(here.from, there.from) <= tolerance.toleranceStart
        && distance(here.to, there.to) <= tolerance.toleranceEnd
}

export type Collation = { symbol: Readonly<AnySymbol>, counterpart: Readonly<AnySymbol> }

/** Each of the own symbols with every inherited symbol it collates with. */
export const collationsOf = (
    own: readonly Readonly<AnySymbol>[],
    inherited: readonly Readonly<AnySymbol>[],
    locate: Locate,
    tolerance: CollationTolerance = defaultCollationTolerance
): Collation[] =>
    own.flatMap(symbol =>
        inherited
            .filter(candidate => isCollatable(symbol, candidate, locate, tolerance))
            .map(counterpart => ({ symbol, counterpart })))
