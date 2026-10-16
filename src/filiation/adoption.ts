/** Taking a proposed stemma into the edition, as one operation. */
import { v5 } from "uuid"
import { Draft } from "immer"
import { Edition } from "../model/Edition.js"
import { AnySymbol } from "../model/Symbol.js"
import { Edit, technicalChange } from "../model/Edit.js"
import { isCollationsOwn } from "../collation/Collation.js"
import { assignReference, idOf, ReferenceAssumption } from "../model/Assumption.js"
import { Derivation, derivesFrom, editsOf, insertedBy, principalDerivationOf, Version } from "../model/Version.js"
import { systemOf } from "../systems/TrackerBar.js"
import { versionIn } from "../lookup/lookup.js"
import { EditionOp, reading } from "../ops/draft.js"
import { dropStatements } from "../ops/copies.js"
import { CollatedReading } from "./readings.js"
import { ProposedVersion, StemmaProposal, Unpinned } from "./proposal.js"
import { barNamed } from "./systems.js"
import { madeWith, stemmaRules } from "./record.js"
import { motivationOfChanges, proposedMotivations } from "./edits.js"

/** The namespace the names of adopted versions and edits are minted in, so that adopting again gives them again. */
const ADOPTED = '6f1d2c8e-93a4-4f0b-b8a1-2f4c5d7e9a31'

/**
 * What adopting a proposal makes of the stemma: the versions it puts in
 * place of the edition's, and what of the edition it leaves out.
 * @category Filiation
 */
export interface Adoption {
    versions: Version[]

    /** By version of the proposal, the id of the version it becomes. */
    ids: Record<string, string>

    /** The versions of the edition the adoption leaves out. */
    removed: string[]

    /** The edits the editor wrote that the adoption leaves out, and why. */
    dropped: Unpinned[]

    /**
     * The published rules the proposal follows, as far as its costs and
     * settings carry them out, which the edition's creation comes to
     * name among its principles.
     */
    principles: string[]
}

/** The rules the proposal followed, as far as its costs and settings carry them out. */
const rulesOf = (proposal: StemmaProposal): string[] => [
    ...(proposal.costs.gain > 1 ? [stemmaRules.sharedAddition] : []),
    ...(proposal.costs.redundantLoss < 1 ? [stemmaRules.independentCleanup] : []),
    ...(proposal.costs.transferLoss < 1 ? [stemmaRules.recutLoss] : []),
    ...(Number.isFinite(proposal.costs.copyDeviation) ? [stemmaRules.copyDeviation] : []),
    ...(proposal.costs.lostState > 0 ? [stemmaRules.lostStates] : []),
    ...(proposal.sameText >= 0 ? [stemmaRules.oneText] : []),
    stemmaRules.refinement,
    stemmaRules.noContamination
]

const exchangeKey = (inserted: readonly string[], deleted: readonly string[]): string =>
    `${[...inserted].sort().join(',')}/${[...deleted].sort().join(',')}`

/** The carriers of the reading, keeping what the edition states of those it held already. */
const carriersOf = (reading: CollatedReading, stated: readonly ReferenceAssumption[]): ReferenceAssumption[] => {
    const known = new Map(stated.map(carrier => [idOf(carrier), carrier]))
    return reading.carriers.map(id => known.get(id) ?? assignReference(id))
}

/**
 * What adopting the proposal makes of the edition's stemma, worked out
 * without changing it, so that it can be looked at first.
 *
 * A version of the proposal that stands for a version of the edition
 * keeps its id, system, creation and motivations, the derivation it
 * states where it still derives from the same version, and its other
 * derivations, the hypotheses, as long as they name a version that is
 * still there and does not derive from it. Its edits are the proposal's:
 * the edits the editor wrote that the proposal keeps, as they are, and
 * one edit for each further reading it inserts or deletes, or for each
 * recoding. An edit of the editor's the version stated before over the
 * very same readings is taken over with its id and what was written on
 * it, and one of the program's with its id; the others are new. Those
 * not the editor's have the motivation the shape of the change calls for
 * (`motivationProposedFor`): the generic musical one, whose reason is
 * left to the editor, or the technical one, which a recoding always has.
 * The edits of the root state its text, and no motivation.
 *
 * A reading that stands for a symbol of the edition keeps that symbol's
 * id and whatever it states beside its carriers. A version of the edition
 * nothing stands for goes, unless it states no edits and derives from a
 * version that stays, as a version known only from a recording does.
 *
 * What the program concluded is stated plainly, as an edition states its
 * stemma. A derivation the editor holds under a belief of their own
 * stays as it is, and so does every edit that says why it was made.
 * @category Filiation
 */
export const adoptionOf = (edition: Edition, proposal: StemmaProposal): Adoption => {
    const fresh = new Set<string>()
    const readingOf = new Map(proposal.collation.readings.map(reading => [reading.id, reading]))
    const symbolIdOf = (reading: string) => proposal.symbols[reading] ?? reading
    const existing = new Map(edition.versions.flatMap(insertedBy).map(symbol => [symbol.id, symbol]))

    // A reading the stemma lets arise more than once is one symbol for each time it arises, each
    // carried by the copies below where it arose: the edition inserts a symbol in one version only.
    const parentOf = new Map(proposal.versions.map(proposed => [proposed.id, proposed.parent]))
    const copiesBelow = new Map(proposal.versions.map(proposed => [proposed.id, new Set<string>()]))
    for (const proposed of proposal.versions) {
        for (let at: string | undefined = proposed.id; at !== undefined; at = parentOf.get(at)) {
            proposed.copies.forEach(copy => copiesBelow.get(at)!.add(copy))
        }
    }
    const arising = new Map<string, string[]>()
    for (const proposed of proposal.versions) {
        for (const reading of proposed.inserts) arising.set(reading, [...(arising.get(reading) ?? []), proposed.id])
    }
    /** The symbol a reading is where it arose in the version given. */
    const symbolIdAt = (reading: string, at: string): string => {
        const places = arising.get(reading) ?? []
        return places.indexOf(at) > 0 ? `symbol_${v5(`${reading}|${at}`, ADOPTED)}` : symbolIdOf(reading)
    }
    /** The symbol a version inherits of a reading: the one that arose nearest above it. */
    const inheritedAt = (reading: string, at: string): string => {
        const places = arising.get(reading) ?? []
        for (let above = parentOf.get(at); above !== undefined; above = parentOf.get(above)) {
            if (places.includes(above)) return symbolIdAt(reading, above)
        }
        return symbolIdOf(reading)
    }
    const symbolOf = (id: string, at: string): AnySymbol => {
        const reading = readingOf.get(id)!
        const twice = (arising.get(id)?.length ?? 0) > 1
        const below = copiesBelow.get(at)!
        const own = twice
            ? { ...reading, carriers: reading.carriers.filter((_, index) => below.has(reading.copies[index])) }
            : reading
        const symbol = symbolIdAt(id, at)
        const stated = symbol === proposal.symbols[id] ? existing.get(symbol) : undefined
        const carriers = carriersOf(own, stated?.carriers ?? [])
        if (stated) return { ...stated, carriers } as AnySymbol
        return reading.meaning.type === 'note'
            ? { type: 'note', id: symbol, pitch: reading.meaning.pitch, carriers }
            : { type: 'expression', id: symbol, expressionType: reading.meaning.expressionType, scope: reading.meaning.scope, carriers }
    }
    const standingFor = new Map(Object.entries(proposal.symbols).map(([reading, symbol]) => [symbol, reading]))
    /** The symbol as an edit the editor wrote inserts it, with the carriers of the reading it stands for. */
    const restated = (symbol: AnySymbol): AnySymbol => {
        const reading = standingFor.get(symbol.id)
        return reading ? { ...symbol, carriers: carriersOf(readingOf.get(reading)!, symbol.carriers) } as AnySymbol : symbol
    }

    const idFor = (proposed: ProposedVersion): string =>
        proposed.version ?? v5(`version|${proposed.copies.join(',')}|${[...proposed.inserts].sort().join(',')}`, ADOPTED)
    const ids = new Map(proposal.versions.map(proposed => [proposed.id, idFor(proposed)]))
    const staying = new Set(ids.values())

    const versions = proposal.versions.map((proposed): Version => {
        const id = ids.get(proposed.id)!
        const before = proposed.version ? versionIn(edition, proposed.version) : undefined
        const pinned = new Set(proposed.pinned)
        const stated = before ? editsOf(before) : []
        const kept = stated
            .filter(edit => pinned.has(edit.id))
            .map(edit => edit.insert ? { ...edit, insert: edit.insert.map(restated) } : edit)
        const spoken = new Set(kept.flatMap(edit => [...(edit.insert ?? []).map(symbol => symbol.id), ...(edit.delete ?? [])]))
        const statedBefore = new Map(stated.map(edit =>
            [exchangeKey((edit.insert ?? []).map(symbol => symbol.id), edit.delete ?? []), edit]))

        const made = (inserts: readonly string[], deletes: readonly string[], recoding: boolean): Edit | undefined => {
            const inserted = inserts.map(reading => symbolIdAt(reading, proposed.id))
            const deleted = deletes.map(reading => inheritedAt(reading, proposed.id))
            if ([...inserted, ...deleted].some(symbol => spoken.has(symbol))) return undefined
            const key = exchangeKey(inserted, deleted)
            const same = statedBefore.get(key)
            const insert = inserts.map(reading => symbolOf(reading, proposed.id))
            const exchange = { ...(insert.length > 0 && { insert }), ...(deleted.length > 0 && { delete: deleted }) }
            if (same && !isCollationsOwn(same)) return { ...same, ...exchange }
            // The program's edit over the same changes keeps its id, and states the kind of change anew.
            const { motivation: _stated, ...taken } = same ?? { type: 'edit', id: v5(`edit|${id}|${key}`, ADOPTED) }
            const made: Edit = { ...taken, ...(recoding && { motivation: technicalChange }), ...exchange }
            // A recoding is technical; the motivation of any other change is read off its shape below.
            if (!recoding) fresh.add(made.id)
            return made
        }
        // A recoding an edit of the editor's cuts into is stated reading by reading.
        const whole = proposed.recodings.filter(recoding =>
            ![...recoding.by.map(reading => symbolIdAt(reading, proposed.id)), ...recoding.replaced.map(reading => inheritedAt(reading, proposed.id))]
                .some(symbol => spoken.has(symbol)))
        const recoded = new Set(whole.flatMap(recoding => [...recoding.by, ...recoding.replaced]))
        const edits = [
            ...kept,
            ...whole.map(recoding => made(recoding.by, recoding.replaced, true)),
            ...proposed.inserts.filter(reading => !recoded.has(reading)).map(reading => made([reading], [], false)),
            ...proposed.deletes.filter(reading => !recoded.has(reading)).map(reading => made([], [reading], false))
        ].filter((edit): edit is Edit => edit !== undefined)

        // A derivation stated before is kept with what it states, a belief of the editor's among it.
        const parent = proposed.parent ? ids.get(proposed.parent) : undefined
        const principal = before && principalDerivationOf(before)
        const same = principal && idOf(principal) === parent ? principal : undefined
        const derivation: Derivation | undefined = parent === undefined ? undefined : same ?? assignReference(parent)
        const hypotheses = (before?.basedOn ?? [])
            .filter(other => other !== principal && staying.has(idOf(other)) && idOf(other) !== parent)
        const basedOn = [...(derivation ? [derivation] : []), ...hypotheses]

        const copy = edition.copies.find(copy => copy.id === proposed.copies[0])
        const bar = barNamed(proposed.system)
        const system = copy?.production?.system ?? before?.system ?? (bar ? systemOf(bar) : { id: proposed.system, name: proposed.system, sameAs: [] })

        const { basedOn: _, edits: __, ...rest } = before ?? {} as Partial<Version>
        return {
            ...rest,
            id,
            system,
            ...(basedOn.length > 0 && { basedOn }),
            edits
        }
    })

    // A hypothesis may not name a version that now derives from the one stating it.
    const pruned = versions.map(version => ({
        ...version,
        ...(version.basedOn && {
            basedOn: version.basedOn.filter((derivation, index) => index === 0 || !derivesFrom(versions, idOf(derivation), version.id))
        })
    }))

    const statedOnly = edition.versions.filter(version => {
        if (staying.has(version.id) || editsOf(version).length > 0) return false
        const principal = principalDerivationOf(version)
        return principal !== undefined && staying.has(idOf(principal))
    })
    const removed = edition.versions.filter(version => !staying.has(version.id) && !statedOnly.includes(version)).map(version => version.id)

    // The edition's order where a version stays, the new ones after it.
    const rank = new Map(edition.versions.map((version, index) => [version.id, index]))
    const ordered = [...pruned, ...statedOnly].sort((a, b) =>
        (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))

    // A new edit's motivation follows from the shape of the change, read in the stemma adopted.
    const adopted = { ...edition, versions: ordered }
    const motivated = ordered.map(version => {
        if (!editsOf(version).some(edit => fresh.has(edit.id))) return version
        if (!principalDerivationOf(version)) return version
        const motivations = proposedMotivations(adopted, version.id)
        return {
            ...version,
            edits: editsOf(version).map(edit => fresh.has(edit.id)
                ? { ...edit, motivation: motivationOfChanges(motivations, [...(edit.insert ?? []).map(symbol => symbol.id), ...(edit.delete ?? [])]) }
                : edit)
        }
    })

    return { versions: motivated, ids: Object.fromEntries(ids), removed, dropped: proposal.unpinned, principles: rulesOf(proposal) }
}

/**
 * Puts the proposed stemma in place of the edition's, as `adoptionOf`
 * describes, and takes back a copy's statement that it carries a
 * version that goes. The edition's creation comes to name the rules the
 * proposal follows among its principles, in place of those of the
 * stemma it no longer follows, and this release of the library among its
 * software, which finds the stemma again with the defaults it has. One
 * operation, and so one undo step.
 * @category Operations
 */
export const adoptStemma = (proposal: StemmaProposal): EditionOp => reading(edition => {
    const { versions, removed, principles } = adoptionOf(edition, proposal)
    const gone = new Set(removed)
    const creation = madeWith(edition.creation, principles, Object.values(stemmaRules))
    return draft => {
        draft.versions = versions as Draft<Version>[]
        draft.copies.forEach(copy => dropStatements(copy, statement => gone.has(idOf(statement))))
        draft.creation = creation as Draft<Edition['creation']>
    }
})
