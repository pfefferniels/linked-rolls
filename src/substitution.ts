import { CollationTolerance, defaultCollationTolerance, Locate } from "./Collation.js"
import { AnySymbol, Expression } from "./Symbol.js"
import { distance, Millimeters, mm, Track, track } from "./Quantity.js"
import { Operation, Spelling, TrackerBar } from "./TrackerBar.js"
import { trackerBars } from "./systems/index.js"

export type { Operation, Spelling } from "./TrackerBar.js"

/**
 * What an expression type operates, as the bar that reads it says, or
 * nothing for a word no bar here knows or one without a counterpart in
 * another scale. The bars share their words where they share a scale,
 * as the Licensee does the T-100's, so the first that reads it answers.
 */
export const operationOf = (expressionType: string): Operation | undefined => {
    for (const bar of trackerBars) {
        const operation = bar.operationOf(expressionType)
        if (operation) return operation
    }
    return undefined
}

/**
 * A latched function of the older version and the held command of the
 * newer one that stands for it.
 */
export interface Substitution {
    /** The command that turned the function on, and the one that cancelled it. */
    replaced: readonly [Expression, Expression]

    /**
     * The commands that say the same thing in the other scale's words.
     * Usually one, but a held command is punched as a chain of round
     * holes with paper bridges rather than as a slot, and a scan whose
     * analysis reports those singly gives one symbol per punch.
     */
    by: readonly Expression[]
}

/**
 * How wide a paper bridge may be for two held perforations to be one
 * command. The T-98 punches a hold as a chain of round holes on a
 * 2.66 mm grid with bridges of about a millimetre, so a scan read hole
 * by hole shows a run where the paper shows one command.
 */
export const defaultChainGap = mm(3)

const isExpression = (symbol: AnySymbol): symbol is Expression => symbol.type === 'expression'

/** The key a command is matched on: the function, and the side where the side counts. */
const functionKey = (symbol: Pick<Expression, 'scope'>, operation: Operation): string =>
    operation.sided ? `${operation.operates} ${symbol.scope}` : operation.operates

/**
 * The position a bar reads its own command for the same function on,
 * where it has no word for this one.
 *
 * A version keeps the commands it does away with in its deletions, and
 * those may be a scale the version is not coded for: a green version
 * deletes the red `SlowCrescendoOn` it inherits. That has no position on
 * the green bar, so drawing it as a perforation is out of the question,
 * but an edit still has to be shown somewhere, and the lane the green
 * scale gives the same function is where it belongs.
 */
export const positionOfSameFunction = (bar: TrackerBar, symbol: Expression): Track | undefined => {
    const wanted = operationOf(symbol.expressionType)
    if (!wanted) return undefined

    const positions = Array.from({ length: bar.trackCount }, (_, index) => track(index + 1))

    return positions.find(position => {
        const meaning = bar.meaningOf(position)
        if (meaning?.type !== 'expression') return false

        const operation = operationOf(meaning.expressionType)
        return operation !== undefined
            && operation.operates === wanted.operates
            && functionKey(meaning, operation) === functionKey(symbol, wanted)
    })
}

type Latched = { on: Expression, off: Expression, from: Millimeters, to: Millimeters, key: string }

/**
 * The intervals the older version latches: each command that turns a
 * function on, with the one that cancels it next on the same line.
 */
const latchedIn = (symbols: readonly AnySymbol[], locate: Locate): Latched[] => {
    const byFunction = new Map<string, { symbol: Expression, at: Millimeters, spelling: Spelling }[]>()

    symbols.filter(isExpression).forEach(symbol => {
        const operation = operationOf(symbol.expressionType)
        const at = locate(symbol)?.from
        if (!operation || operation.spelling === 'held' || at === undefined) return

        const key = functionKey(symbol, operation)
        const group = byFunction.get(key) ?? []
        group.push({ symbol, at, spelling: operation.spelling })
        byFunction.set(key, group)
    })

    return [...byFunction.values()].flatMap(group => {
        const inOrder = [...group].sort((a, b) => a.at - b.at)

        return inOrder.reduce<{ open?: { on: Expression, from: Millimeters }, closed: Latched[] }>(
            (state, entry) => {
                // A second On while the function already stands is
                // redundant, and the interval began at the first, which
                // is how a red copy reads that reaches the end of the
                // roll with two Ons and one Off.
                if (entry.spelling === 'on') {
                    return state.open ? state : { ...state, open: { on: entry.symbol, from: entry.at } }
                }

                return state.open
                    ? {
                        open: undefined,
                        closed: [...state.closed, {
                            on: state.open.on,
                            off: entry.symbol,
                            from: state.open.from,
                            to: entry.at,
                            key: functionKey(state.open.on, operationOf(state.open.on.expressionType)!)
                        }]
                    }
                    : state
            },
            { closed: [] }
        ).closed
    })
}

/** One function the newer version holds: a single held command, or the chain of punches that is one. */
type Run = { of: Expression[], from: Millimeters, to: Millimeters, key: string }

/**
 * The functions the newer version holds, a chain of punches counting as
 * the one command the paper shows rather than as a run of them.
 */
const heldRunsIn = (symbols: readonly AnySymbol[], locate: Locate, chainGap: Millimeters): Run[] => {
    const byFunction = new Map<string, { symbol: Expression, from: Millimeters, to: Millimeters }[]>()

    symbols.filter(isExpression).forEach(symbol => {
        const operation = operationOf(symbol.expressionType)
        const place = locate(symbol)
        if (!operation || operation.spelling !== 'held' || !place) return

        const key = functionKey(symbol, operation)
        const group = byFunction.get(key) ?? []
        group.push({ symbol, from: place.from, to: place.to })
        byFunction.set(key, group)
    })

    return [...byFunction.entries()].flatMap(([key, group]) =>
        [...group]
            .sort((a, b) => a.from - b.from)
            .reduce<Run[]>((runs, punch) => {
                const open = runs[runs.length - 1]
                if (open && punch.from - open.to <= chainGap) {
                    open.of.push(punch.symbol)
                    open.to = punch.to > open.to ? punch.to : open.to
                    return runs
                }
                return [...runs, { of: [punch.symbol], from: punch.from, to: punch.to, key }]
            }, []))
}

/** The only item of the list, or nothing where there is none or a rival. */
const theOnly = <T,>(items: readonly T[]): T | undefined =>
    items.length === 1 ? items[0] : undefined

/**
 * Where a held command of the newer version stands for a latched
 * function of the older one: the same function, on the same side where
 * the side counts, spanning the same stretch of the roll.
 *
 * Only unambiguous correspondences are reported. Where two held commands
 * answer one latched interval, or one answers two, none of them is
 * reported and the editor is left to say what happened. Nothing is
 * invented either: both sides are perforations somebody punched, and all
 * this asserts is which stands for which.
 */
export const substitutionsBetween = (
    own: readonly AnySymbol[],
    inherited: readonly AnySymbol[],
    locate: Locate,
    tolerance: CollationTolerance = defaultCollationTolerance,
    chainGap: Millimeters = defaultChainGap
): Substitution[] => {
    const latched = latchedIn(inherited, locate)

    const spans = (run: Run, interval: Latched): boolean =>
        distance(run.from, interval.from) <= tolerance.toleranceStart
        && distance(run.to, interval.to) <= tolerance.toleranceEnd

    const candidates = heldRunsIn(own, locate, chainGap).flatMap(run => {
        const answered = latched.filter(interval =>
            interval.key === run.key && spans(run, interval))

        const only = theOnly(answered)
        return only ? [{ run, interval: only }] : []
    })

    // A latched interval two runs both answer is ambiguous from its side
    // as well, so neither of them is reported.
    const claims = candidates.reduce(
        (counts, { interval }) => counts.set(interval.on.id, (counts.get(interval.on.id) ?? 0) + 1),
        new Map<string, number>())

    return candidates
        .filter(({ interval }) => claims.get(interval.on.id) === 1)
        .map(({ run, interval }) => ({ replaced: [interval.on, interval.off] as const, by: run.of }))
}
