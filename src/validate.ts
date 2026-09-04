import Ajv from "ajv"
import * as schema from "./schema.json"
import { Edition } from "./Edition"
import { EditionView } from "./EditionView"
import { idOf } from "./Assumption"
import { AnySymbol, Expression, Note, pairsAmong } from "./Symbol"

const ajv = new Ajv(
    {
        strict: false,
        formats: {
            "date": true
        }
    }
)

const validate = ajv.compile<Edition>(schema)
export { validate }

export type ConstraintProblem = {
    version: string
    symbol: string
    problem:
        | 'alignment-reference-missing'
        | 'partner-missing'
        | 'paired-with-itself'
        | 'in-several-pairs'
        | 'pair-aligned-on-both-sides'
}

const isPerforation = (symbol: AnySymbol): symbol is Note | Expression => symbol.type !== 'text'

const problemsIn = (version: string, perforations: readonly (Note | Expression)[]): ConstraintProblem[] => {
    const ids = new Set(perforations.map(p => p.id))
    const report = (symbol: string, problem: ConstraintProblem['problem']): ConstraintProblem =>
        ({ version, symbol, problem })

    const missingReferences = perforations
        .filter(p => p.alignedWith && !ids.has(idOf(p.alignedWith)))
        .map(p => report(p.id, 'alignment-reference-missing'))

    const missingPartners = perforations
        .filter(p => p.pairedWith && !ids.has(idOf(p.pairedWith)))
        .map(p => report(p.id, 'partner-missing'))

    const selfPaired = perforations
        .filter(p => p.pairedWith && idOf(p.pairedWith) === p.id)
        .map(p => report(p.id, 'paired-with-itself'))

    const pairs = pairsAmong(perforations)
    const pairsOf = (p: Note | Expression) => pairs.filter(pair => pair.includes(p))
    const inSeveralPairs = perforations
        .filter(p => pairsOf(p).length > 1)
        .map(p => report(p.id, 'in-several-pairs'))

    const alignedOnBothSides = pairs
        .filter(([one, other]) => one.alignedWith && other.alignedWith)
        .flatMap(pair => pair.map(p => report(p.id, 'pair-aligned-on-both-sides')))

    return [...missingReferences, ...missingPartners, ...selfPaired, ...inSeveralPairs, ...alignedOnBothSides]
}

/**
 * Where the alignments and pairings of the edition cannot hold as
 * stated, version by version: a reference or partner absent from the
 * version, a perforation claimed by several pairs, or a pair whose
 * members are both aligned and so cannot keep their distance and
 * follow their references at once.
 */
export const constraintProblems = (view: EditionView): ConstraintProblem[] =>
    view.edition.versions.flatMap(version =>
        problemsIn(version.id, view.snapshot(version.id).filter(isPerforation)))
