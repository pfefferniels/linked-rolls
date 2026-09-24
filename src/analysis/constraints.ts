import { EditionView } from "../view/EditionView.js"
import { speedScalesIn } from "./ownPaper.js"
import { idOf } from "../model/Assumption.js"
import { AnyCommand, AnySymbol, Expression, PlacementRelation, isCommand, pairsAmong, placementsOf } from "../model/Symbol.js"
import { keyOf } from "../systems/TrackerBar.js"
import { trackerBarOf } from "../systems/index.js"
import { barOf } from "../model/RollCopy.js"
import { FeatureOrPatch } from "../model/Feature.js"
import { deletedBy, insertedBy, Version } from "../model/Version.js"

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
        | 'type-not-on-the-bar'
        | 'carrier-on-another-track'
        | 'copies-disagree-on-the-paper'
        | 'strike-bites-nothing'
}

const missingReference: Record<PlacementRelation, ConstraintProblem['problem']> = {
    alignedWith: 'alignment-reference-missing',
    before: 'before-reference-missing',
    after: 'after-reference-missing'
}

const problemsIn = (version: string, commands: readonly AnyCommand[]): ConstraintProblem[] => {
    const ids = new Set(commands.map(p => p.id))
    const report = (symbol: string, problem: ConstraintProblem['problem']): ConstraintProblem =>
        ({ version, symbol, problem })

    const missingReferences = commands
        .flatMap(p => placementsOf(p)
            .filter(({ reference }) => !ids.has(idOf(reference)))
            .map(({ relation }) => report(p.id, missingReference[relation])))

    const selfPlaced = commands
        .filter(p => placementsOf(p).some(({ reference }) => idOf(reference) === p.id))
        .map(p => report(p.id, 'placed-relative-to-itself'))

    const placedSeveralWays = commands
        .filter(p => placementsOf(p).length > 1)
        .map(p => report(p.id, 'placed-several-ways'))

    const missingPartners = commands
        .filter(p => p.pairedWith && !ids.has(idOf(p.pairedWith)))
        .map(p => report(p.id, 'partner-missing'))

    const selfPaired = commands
        .filter(p => p.pairedWith && idOf(p.pairedWith) === p.id)
        .map(p => report(p.id, 'paired-with-itself'))

    const pairs = pairsAmong(commands)
    const pairsPerId = pairs
        .flatMap(([one, other]) => one === other ? [one] : [one, other])
        .reduce((counts, p) => counts.set(p.id, (counts.get(p.id) ?? 0) + 1), new Map<string, number>())
    const inSeveralPairs = commands
        .filter(p => (pairsPerId.get(p.id) ?? 0) > 1)
        .map(p => report(p.id, 'in-several-pairs'))

    const placedOnBothSides = pairs
        .filter(([one, other]) => placementsOf(one).length > 0 && placementsOf(other).length > 0)
        .flatMap(pair => pair.map(p => report(p.id, 'pair-placed-on-both-sides')))

    return [
        ...missingReferences, ...selfPlaced, ...placedSeveralWays,
        ...missingPartners, ...selfPaired, ...inSeveralPairs, ...placedOnBothSides
    ]
}

const isExpression = (symbol: AnySymbol): symbol is Expression => symbol.type === 'expression'

/**
 * The expressions the version's own bar cannot read, its type belonging
 * to another system or misspelt.
 *
 * This is what says a transfer between systems is unfinished. A green
 * version connected to a red one inherits every red expression, and
 * none of them means anything on a green machine, so each is reported
 * until an edit deletes it and says what took its place. The list
 * emptying is the proof that the transfer is complete.
 */
const typesNotOnTheBar = (version: Version, snapshot: readonly AnySymbol[]): ConstraintProblem[] => {
    const bar = trackerBarOf(version.system)
    if (!bar) return []

    const known = new Set(bar.expressionTypes)
    return snapshot
        .filter(isExpression)
        .filter(symbol => !known.has(symbol.expressionType))
        .map(symbol => ({ version: version.id, symbol: symbol.id, problem: 'type-not-on-the-bar' as const }))
}

/**
 * Carriers whose track does not say what the symbol they carry says.
 *
 * A carrier stands as evidence for its symbol, so the bar of the copy
 * it sits on must read its track as the symbol's own meaning. Since a
 * copy cut for another system numbers its tracks differently, this is
 * what tells a transfer apart from a miscalibration: a red hole on 47
 * and a green one on 45 both say pitch 60, while a green copy one track
 * out says 59. Collation across systems consults only the place, so
 * without this nothing checks the tracks at all.
 */
const carriersOffTheirMeaning = (
    view: EditionView,
    version: string,
    commands: readonly AnyCommand[]
): ConstraintProblem[] => {
    const misread = (carrier: FeatureOrPatch, symbol: AnyCommand): boolean => {
        const copy = view.copyOf(carrier.id)
        if (!copy) return false

        // A carrier lying across several positions reads as several commands,
        // and carries the symbol as long as one of them is the symbol's.
        return !barOf(copy).meaningsOf(carrier.vertical)
            .some(meaning => keyOf(meaning) === keyOf(symbol))
    }

    return commands
        .filter(symbol => view.placedCarriersOf(symbol).some(carrier => misread(carrier, symbol)))
        .map(symbol => ({ version, symbol: symbol.id, problem: 'carrier-on-another-track' as const }))
}

/**
 * Where the copies of the version's own system disagree about the scale
 * that put them on the edition's shared axis.
 *
 * That scale is what takes a place back to the paper the version's roll
 * ran on, so a performance needs one number. Copies disagreeing about it
 * is evidence about the copies, and averaging it away would hide both
 * the disagreement and the fact that the playback rests on a guess.
 */
const paperDisagreed = (view: EditionView, version: Version): ConstraintProblem[] =>
    speedScalesIn(view, version).length > 1
        ? [{ version: version.id, symbol: version.id, problem: 'copies-disagree-on-the-paper' as const }]
        : []

/**
 * A version's strikes that take nothing out of its text: each deleted
 * symbol has to be one the parent hands down, or one the version put
 * there itself, or the strike says nothing.
 *
 * It is the check for what happens when a symbol two versions shared is
 * parted in two. The strike still names a symbol that exists, so
 * nothing dangles and nothing looks wrong, but the reading it meant to
 * reject has passed to the symbol standing in its place and comes back
 * into the text unstruck. Nothing else in the edition shows it: the
 * counts move, and only by a handful.
 */
const strikesBitingNothing = (view: EditionView, version: Version): ConstraintProblem[] => {
    const parent = view.predecessorOf(version.id)
    const reachable = new Set([
        ...(parent ? view.snapshot(parent.id).map(symbol => symbol.id) : []),
        ...insertedBy(version).map(symbol => symbol.id)
    ])

    return deletedBy(version)
        .filter(id => !reachable.has(id))
        .map(id => ({ version: version.id, symbol: id, problem: 'strike-bites-nothing' as const }))
}

/**
 * Where the edition cannot hold as stated, version by version: a
 * placement or pairing reference absent from the version, a command
 * placed relative to itself or in several ways at once, one claimed by
 * several pairs, a pair whose members are both placed and so cannot
 * keep their distance and follow their references at once, an
 * expression the version's own bar cannot read, a carrier sitting on a
 * track that does not say what its symbol says, and a strike that takes
 * nothing out.
 */
export const constraintProblems = (view: EditionView): ConstraintProblem[] =>
    view.edition.versions.flatMap(version => {
        const snapshot = view.snapshot(version.id)
        const commands = snapshot.filter(isCommand)

        return [
            ...problemsIn(version.id, commands),
            ...typesNotOnTheBar(version, snapshot),
            ...carriersOffTheirMeaning(view, version.id, commands),
            ...paperDisagreed(view, version),
            ...strikesBitingNothing(view, version)
        ]
    })
