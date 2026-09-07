import { EditionView } from "./EditionView"
import { idOf } from "./Assumption"
import { AnyPerforation, AnySymbol, Expression, PlacementRelation, isPerforation, pairsAmong, placementsOf } from "./Symbol"
import { TrackerBar } from "./TrackerBar"

export type ConstraintProblem = {
    version: string
    symbol: string
    problem:
        | 'alignment-reference-missing'
        | 'before-reference-missing'
        | 'after-reference-missing'
        | 'placed-relative-to-itself'
        | 'placed-several-ways'
        | 'partner-missing'
        | 'paired-with-itself'
        | 'in-several-pairs'
        | 'pair-placed-on-both-sides'
}

const missingReference: Record<PlacementRelation, ConstraintProblem['problem']> = {
    alignedWith: 'alignment-reference-missing',
    before: 'before-reference-missing',
    after: 'after-reference-missing'
}

const problemsIn = (version: string, perforations: readonly AnyPerforation[]): ConstraintProblem[] => {
    const ids = new Set(perforations.map(p => p.id))
    const report = (symbol: string, problem: ConstraintProblem['problem']): ConstraintProblem =>
        ({ version, symbol, problem })

    const missingReferences = perforations
        .flatMap(p => placementsOf(p)
            .filter(({ reference }) => !ids.has(idOf(reference)))
            .map(({ relation }) => report(p.id, missingReference[relation])))

    const selfPlaced = perforations
        .filter(p => placementsOf(p).some(({ reference }) => idOf(reference) === p.id))
        .map(p => report(p.id, 'placed-relative-to-itself'))

    const placedSeveralWays = perforations
        .filter(p => placementsOf(p).length > 1)
        .map(p => report(p.id, 'placed-several-ways'))

    const missingPartners = perforations
        .filter(p => p.pairedWith && !ids.has(idOf(p.pairedWith)))
        .map(p => report(p.id, 'partner-missing'))

    const selfPaired = perforations
        .filter(p => p.pairedWith && idOf(p.pairedWith) === p.id)
        .map(p => report(p.id, 'paired-with-itself'))

    const pairs = pairsAmong(perforations)
    const pairsOf = (p: AnyPerforation) => pairs.filter(pair => pair.includes(p))
    const inSeveralPairs = perforations
        .filter(p => pairsOf(p).length > 1)
        .map(p => report(p.id, 'in-several-pairs'))

    const placedOnBothSides = pairs
        .filter(([one, other]) => placementsOf(one).length > 0 && placementsOf(other).length > 0)
        .flatMap(pair => pair.map(p => report(p.id, 'pair-placed-on-both-sides')))

    return [
        ...missingReferences, ...selfPlaced, ...placedSeveralWays,
        ...missingPartners, ...selfPaired, ...inSeveralPairs, ...placedOnBothSides
    ]
}

/**
 * Where the placements and pairings of the edition cannot hold as
 * stated, version by version: a reference or partner absent from the
 * version, a perforation placed relative to itself or in several ways
 * at once, one claimed by several pairs, or a pair whose members are
 * both placed and so cannot keep their distance and follow their
 * references at once.
 */
export const constraintProblems = (view: EditionView): ConstraintProblem[] =>
    view.edition.versions.flatMap(version =>
        problemsIn(version.id, view.snapshot(version.id).filter(isPerforation)))

export type UnknownExpressionType = {
    version: string
    symbol: string
    expressionType: string
}

const isExpression = (symbol: AnySymbol): symbol is Expression => symbol.type === 'expression'

/**
 * The expressions of the edition whose type the tracker bar does not
 * read, version by version. The roll names its system; a type from
 * another system, or a misspelt one, means nothing on it.
 */
export const unknownExpressionTypes = (view: EditionView, bar: TrackerBar): UnknownExpressionType[] => {
    const known = new Set(bar.expressionTypes)
    return view.edition.versions.flatMap(version =>
        view.snapshot(version.id)
            .filter(isExpression)
            .filter(symbol => !known.has(symbol.expressionType))
            .map(symbol => ({ version: version.id, symbol: symbol.id, expressionType: symbol.expressionType })))
}
