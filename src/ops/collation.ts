/** Collating a version against the one it derives from, and taking a collation apart again. */
import { Draft } from "immer"
import { v4 } from "uuid"
import { EditionView, getAt } from "../EditionView.js"
import { Edition } from "../Edition.js"
import { AnySymbol } from "../Symbol.js"
import { Collation, CollationTolerance, collationsOf, defaultCollationTolerance, isCollationsOwn, unchecked } from "../Collation.js"
import { Edit } from "../Edit.js"
import { collationToleranceOf, derivesFrom, editsOf, insertedBy, principalDerivationOf, Version } from "../Version.js"
import { Substitution, substitutionsBetween } from "../substitution.js"
import { trackerBarOf } from "../systems/index.js"
import { ObjectAssumption, ReferenceAssumption, assignReference, idOf } from "../Assumption.js"
import { EditionOp, noChange, onVersion, stateOf, insertion, deletion, asUnchecked, declaring, insertedIn, dropInsertions, reading } from "./draft.js"
import { hypothesesBeside } from "./versions.js"

/** The carriers of each collated symbol pass to its counterpart. */
const handOverCarriers = (view: EditionView, draft: Draft<Edition>, collations: readonly Collation[]) =>
    collations.forEach(({ symbol, counterpart }) => {
        const path = view.getPath(counterpart.id)
        const target = path && getAt<Draft<AnySymbol>>(path, draft)
        target?.carriers.push(...symbol.carriers)
    })

/** Whether the two versions are coded for different reproducing systems. */
const differ = (child: Version | undefined, parent: Version | undefined): boolean => {
    const one = trackerBarOf(child?.system)
    const other = trackerBarOf(parent?.system)
    return one !== undefined && other !== undefined && one.id !== other.id
}

/** The symbols a set of edits speaks for, whether by inserting or by deleting them. */
const spokenForBy = (edits: readonly Readonly<Edit>[]): Set<string> =>
    new Set(edits.flatMap(edit => [
        ...(edit.insert ?? []).map(symbol => symbol.id),
        ...(edit.delete ?? [])
    ]))

/** An exchange of symbols, as a key: what it puts in against what it takes out. */
const exchangeKey = (inserted: readonly string[], deleted: readonly string[]): string =>
    `${[...inserted].sort().join(',')}/${[...deleted].sort().join(',')}`

/**
 * The edits already stated, by the exchange each of them makes. An
 * equivalence the collation draws a second time is the one already
 * stated, and drawing it again is no reason to mint a new identifier or
 * to drop the motivation somebody wrote on it.
 */
const byExchange = (edits: readonly Readonly<Edit>[]): Map<string, Readonly<Edit>> =>
    new Map(edits.map(edit =>
        [exchangeKey((edit.insert ?? []).map(symbol => symbol.id), edit.delete ?? []), edit]))

/**
 * Bases the child on the parent. A symbol of the child that collates
 * with one the parent hands down adds its carriers to that symbol; the
 * rest become the child's insertions, and what the parent hands down
 * and the child lacks becomes its deletions. The derivation states the
 * tolerance it was collated at and becomes the principal one; the
 * hypotheses the child stated beside its former one stay.
 *
 * The edits the child already stated are rewritten only as far as a
 * collation wrote them (`isCollationsOwn`). An editor's reading of the
 * difference between the two texts stays, and the symbols it speaks for
 * are left out of the collation, so that connecting the two again
 * neither doubles them nor silently drops what somebody established by
 * hand. An equivalence is the collation's own, since it is drawn from
 * the two systems' vocabularies rather than read off the paper, but one
 * drawn again over the very same symbols is kept as it stands, with its
 * identifier and whatever was written on it.
 *
 * The child's own text is what it shows less what the parent hands
 * down, so that connecting two versions already connected collates the
 * child's symbols and not the parent's with themselves.
 *
 * A version is based on itself or on one of its own descendants in no
 * statement, since the stemma would loop; asked for that, nothing
 * changes.
 */
export const connectVersions = (
    given: EditionView,
    childId: string,
    parentId: string,
    tolerance: ObjectAssumption<CollationTolerance> = defaultCollationTolerance
): EditionOp => reading(given, view => {
    if (childId === parentId || derivesFrom(view.edition.versions, parentId, childId)) return noChange

    const child = view.version(childId)
    const stated = child ? editsOf(child) : []
    const established = stated.filter(edit => !isCollationsOwn(edit))
    const spokenFor = spokenForBy(established)
    const unspoken = (symbol: Readonly<AnySymbol>) => !spokenFor.has(symbol.id)

    // What the parent hands down and the child still shows passes
    // through: it is neither the child's own symbol nor one it lacks.
    // Without that, connecting a pair already connected would collate
    // the inherited symbols with themselves and double their carriers.
    const handedDown = view.snapshot(parentId).filter(unspoken)
    const shown = new Set(view.snapshot(childId).map(symbol => symbol.id))
    const inheritedIds = new Set(handedDown.map(symbol => symbol.id))
    const inherited = handedDown.filter(symbol => !shown.has(symbol.id))
    const own = view.snapshot(childId).filter(symbol => unspoken(symbol) && !inheritedIds.has(symbol.id))
    const locate = (symbol: AnySymbol) => view.placeOf(symbol)
    const collations = collationsOf(own, inherited, locate, tolerance)
    const collated = new Set(collations.map(({ symbol }) => symbol.id))
    const matched = new Set(collations.map(({ counterpart }) => counterpart.id))

    /**
     * Where the child is coded for another system, a held command of
     * its own often stands for a latched pair of the parent's. Saying so
     * as one edit is the transfer being carried out, and leaving the two
     * apart would make the apparatus a list of unexplained losses beside
     * a list of unexplained gains.
     */
    const substituted = differ(child, view.version(parentId))
        ? substitutionsBetween(
            own.filter(symbol => !collated.has(symbol.id)),
            inherited.filter(symbol => !matched.has(symbol.id)),
            locate,
            tolerance)
        : []

    const paired = new Set(substituted.flatMap(({ replaced, by }) =>
        [...by, ...replaced].map(symbol => symbol.id)))

    const alreadyStated = byExchange(stated)
    const equivalence = ({ replaced, by }: Substitution): Edit => {
        const inserted = by.map(symbol => symbol.id)
        const deleted = replaced.map(symbol => symbol.id)
        return alreadyStated.get(exchangeKey(inserted, deleted)) ?? {
            type: 'edit',
            id: v4(),
            editType: 'replace-with-equivalent',
            motivation: unchecked,
            insert: [...by],
            delete: deleted
        }
    }

    const edits = [
        ...established,
        ...substituted.map(equivalence),
        ...own.filter(symbol => !collated.has(symbol.id) && !paired.has(symbol.id)).map(insertion).map(asUnchecked),
        ...inherited
            .filter(symbol => !matched.has(symbol.id) && !paired.has(symbol.id))
            .map(symbol => asUnchecked(deletion(symbol.id)))
    ]

    return onVersion(childId, (child, draft) => {
        handOverCarriers(view, draft, collations)
        child.edits = edits
        child.motivations = declaring(stateOf<Version>(child).motivations, edits)
        child.basedOn = [
            { ...assignReference(parentId), collationTolerance: tolerance },
            ...hypothesesBeside(stateOf<Version>(child), parentId)
        ]
    })
})

/**
 * Folds the version's own symbols into those it inherits and collates
 * with: the carriers pass over, and the insertions go. Collates at the
 * tolerance of the derivation, where the caller names none.
 */
export const collateSymbols = (
    given: EditionView,
    versionId: string,
    symbolIds: readonly string[],
    tolerance?: CollationTolerance
): EditionOp => reading(given, view => {
    const version = view.version(versionId)
    const principal = version && principalDerivationOf(version)
    if (!version || !principal) return noChange

    const chosen = new Set(symbolIds)
    const own = insertedIn([version]).filter(symbol => chosen.has(symbol.id))
    const collations = collationsOf(
        own,
        view.snapshot(idOf(principal)),
        symbol => view.placeOf(symbol),
        tolerance ?? collationToleranceOf(principal))
    const collated = new Set(collations.map(({ symbol }) => symbol.id))

    return onVersion(versionId, (version, draft) => {
        handOverCarriers(view, draft, collations)
        dropInsertions(version, collated)
    })
})

/** The symbol as one copy reads it: what it says, on the given carriers, standing in no relation of its own. */
const readingOf = (symbol: Readonly<AnySymbol>, carriers: ReferenceAssumption[]): AnySymbol => {
    const identity = { id: v4(), carriers }
    switch (symbol.type) {
        case 'note':
            return { type: 'note', pitch: symbol.pitch, ...identity }
        case 'expression':
            return { type: 'expression', expressionType: symbol.expressionType, scope: symbol.scope, ...identity }
        case 'text':
            return { type: 'text', text: symbol.text, ...identity }
    }
}

/** A symbol two sides carry, with the carriers of each. */
interface Shared {
    symbol: Readonly<AnySymbol>
    mine: ReferenceAssumption[]
    theirs: ReferenceAssumption[]
}

/**
 * The symbol where the named copies and at least one other carry it,
 * with the carriers of each side.
 *
 * A symbol the named copies alone carry has no other side to be
 * separated from and is passed over. That covers the insertions, and it
 * covers a symbol an ancestor holds on one branch's witness alone,
 * where the two versions do not disagree and there is nothing to take
 * apart.
 */
const sharedWith = (view: EditionView, symbol: Readonly<AnySymbol>, copies: ReadonlySet<string>): Shared[] => {
    const onNamedCopy = (carrier: ReferenceAssumption) => {
        const copy = view.copyOf(idOf(carrier))
        return copy !== undefined && copies.has(copy.id)
    }
    const mine = symbol.carriers.filter(onNamedCopy)
    const theirs = symbol.carriers.filter(carrier => !onNamedCopy(carrier))
    return mine.length > 0 && theirs.length > 0 ? [{ symbol, mine, theirs }] : []
}

/**
 * Takes the named copies' reading of a symbol back out of the symbol it
 * was collated into: their carriers pass to a new symbol of the
 * version's own, the remaining copies keep the symbol they had, and the
 * version states the exchange.
 *
 * This is the inverse of the hand-over a collation makes, and it is
 * what lets a derivation be collated a second time. A collated symbol
 * is one symbol carrying every copy that reads it, so nothing else
 * takes the two readings apart again, and without that a tolerance
 * arrived at after the fact could never be applied.
 *
 * The copies named are one **side** of the derivation, the same side a
 * window is measured over, and `sidesOf` is what says which they are.
 * Naming one copy of a side that has several does not separate that
 * side: what stays behind is the rest of it, mixed with the other
 * side's copies, and a collation then compares one copy against that
 * mixture rather than the two texts against each other.
 *
 * Symbols the named copies alone carry are already the version's own
 * and are passed over, so a reading somebody has separated by hand
 * keeps its identifier and the edit that speaks for it. Named symbols
 * narrow the act to those; naming none separates the whole reading.
 */
export const separateReadings = (
    given: EditionView,
    versionId: string,
    copies: ReadonlySet<string>,
    symbolIds?: readonly string[]
): EditionOp => reading(given, view => {
    const version = view.version(versionId)
    if (!version) return noChange

    const chosen = symbolIds && new Set(symbolIds)
    const shared = view.snapshot(versionId)
        .filter(symbol => chosen === undefined || chosen.has(symbol.id))
        .flatMap(symbol => sharedWith(view, symbol, copies))
    if (shared.length === 0) return noChange

    const inserted = new Set(insertedBy(version).map(symbol => symbol.id))
    const stated = editsOf(version)
    const separations = shared.map(({ symbol, mine }): Edit => ({
        type: 'edit',
        id: v4(),
        insert: [readingOf(symbol, [...mine])],
        // A symbol the version inserts itself stays where it is, minus
        // the carriers that leave it. Only one it inherits is exchanged.
        ...(inserted.has(symbol.id) ? {} : { delete: [symbol.id] })
    }))

    return onVersion(versionId, (version, draft) => {
        shared.forEach(({ symbol, theirs }) => {
            const path = view.getPath(symbol.id)
            const target = path && getAt<Draft<AnySymbol>>(path, draft)
            if (target) target.carriers = theirs
        })
        version.edits = [...stated, ...separations]
    })
})
