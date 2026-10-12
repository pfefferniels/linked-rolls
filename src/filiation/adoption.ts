/** Taking a proposed stemma into the edition, as one operation. */
import { v5 } from "uuid"
import { Draft } from "immer"
import { Edition } from "../model/Edition.js"
import { AnySymbol } from "../model/Symbol.js"
import { Edit } from "../model/Edit.js"
import { assignReference, idOf, isHeldForItself, PropositionSet, ReferenceAssumption } from "../model/Assumption.js"
import { Derivation, derivesFrom, editsOf, insertedBy, principalDerivationOf, Version } from "../model/Version.js"
import { systemOf } from "../systems/TrackerBar.js"
import { isCollationsOwn, unchecked } from "../collation/Collation.js"
import { versionIn } from "../lookup/lookup.js"
import { declaring, EditionOp, reading } from "../ops/draft.js"
import { dropStatements } from "../ops/copies.js"
import { CollatedReading } from "./readings.js"
import { ProposedVersion, StemmaProposal, Unpinned } from "./proposal.js"
import { barNamed } from "./systems.js"
import { inMillimetres, keptSets, memberOf, recorded, Run, stemmaRules } from "./record.js"

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
     * The record of the run: the proposition set the derivations and
     * edits the proposal concluded belong to, held under one belief
     * whose reason is the inference the program drew.
     */
    propositionSet: PropositionSet
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

/** A number as a note gives it: to two places at most. */
const amount = (value: number): string => String(Math.round(value * 100) / 100)

/**
 * What the run of `proposeStemma` was, and what it was computed with, in
 * words, so that it can be run again: the copies by siglum, the costs,
 * the settings, and the margin by which the copies decide each grouping.
 */
const noteOn = (edition: Edition, proposal: StemmaProposal): string => {
    const siglumOf = new Map(edition.copies.map(copy => [copy.id, copy.siglum ?? copy.id]))
    const named = (copies: readonly string[]) => copies.map(copy => siglumOf.get(copy) ?? copy).join(', ')
    const { costs } = proposal
    const supports = proposal.supports.map(support => support.ancestor
        ? `${named(support.ancestor)} above ${named(support.copies.filter(copy => !support.ancestor!.includes(copy)))} by ${amount(support.margin)}`
        : `${named(support.copies)} together by ${amount(support.margin)}`)
    return [
        `The stemma ${proposal.notation}, the best of ${proposal.scored} that ${named(proposal.copies)} admit, at a cost of ${amount(proposal.cost)}.`,
        `A reading arising costs ${amount(costs.gain)}, a reading lost 1, a redundancy lost ${amount(costs.redundantLoss)}, a reading lost on the way into another system ${amount(costs.transferLoss)}, a copy lacking a reading of its version ${amount(costs.copyDeviation)}, and a lost state ${amount(costs.lostState)}.`,
        `Copies of one system differing in ${proposal.sameText < 0 ? 'any reading' : `no more than ${proposal.sameText} readings`} are taken for one text; a reading of the same kind within ${inMillimetres(proposal.movedWithin)} on the other side of the root for a moved one; and ${inMillimetres(proposal.margin)} beyond a copy's text or a tear for what the copy cannot show.`,
        ...(supports.length > 0 ? [`The copies decide its groupings by: ${supports.join('; ')}.`] : [])
    ].join(' ')
}

/** The set the run of `proposeStemma` concluded, held with the belief the run gives it. */
const stemmaSetOf = (edition: Edition, proposal: StemmaProposal, run: Run): PropositionSet => recorded(
    'stemma',
    [proposal.copies, proposal.notation, proposal.costs, proposal.sameText, proposal.movedWithin, proposal.margin],
    { note: noteOn(edition, proposal), premises: [], used: [...proposal.copies], applies: rulesOf(proposal) },
    run
)

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
 * recoding. An edit the version stated before over the very same
 * readings is taken over with its id and what was written on it; the
 * others are new and marked unchecked, as a collation marks its own.
 *
 * A reading that stands for a symbol of the edition keeps that symbol's
 * id and whatever it states beside its carriers. A version of the edition
 * nothing stands for goes, unless it states no edits and derives from a
 * version that stays, as a version known only from a recording does.
 *
 * What the program concluded is recorded as one proposition set, since
 * the search scores whole stemmata and concludes the whole: each
 * derivation it states and each edit it makes belongs to the set, which
 * holds them under one belief, likely unless the run says otherwise,
 * concluded by an inference that names this library and its release,
 * the copies it collated, the rules it followed and, in its note, what
 * it was computed with. A derivation or an edit that is the editor's,
 * held under a belief of its own or saying more than a program says,
 * stays the editor's and outside the set. The run gives who ran the
 * program and when (`Run`).
 * @category Filiation
 */
export const adoptionOf = (edition: Edition, proposal: StemmaProposal, run: Run = {}): Adoption => {
    const set = stemmaSetOf(edition, proposal, run)
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
            if (same) {
                const taken: Edit = { ...same, ...(insert.length > 0 && { insert }), ...(deleted.length > 0 && { delete: deleted }) }
                return isCollationsOwn(same) ? memberOf(set.id, taken) : taken
            }
            return memberOf<Edit>(set.id, {
                type: 'edit',
                id: v5(`edit|${id}|${key}`, ADOPTED),
                ...(recoding && { editType: 'recoding' as const }),
                motivation: unchecked,
                ...(insert.length > 0 && { insert }),
                ...(deleted.length > 0 && { delete: deleted })
            })
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

        // The derivation is the set's, unless the editor holds it for reasons of their own.
        const parent = proposed.parent ? ids.get(proposed.parent) : undefined
        const principal = before && principalDerivationOf(before)
        const same = principal && idOf(principal) === parent ? principal : undefined
        const derivation: Derivation | undefined = parent === undefined
            ? undefined
            : same && isHeldForItself(same) ? same : memberOf<Derivation>(set.id, same ?? assignReference(parent))
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
            edits,
            motivations: declaring(before?.motivations ?? [], edits)
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

    return { versions: ordered, ids: Object.fromEntries(ids), removed, dropped: proposal.unpinned, propositionSet: set }
}

/**
 * Puts the proposed stemma in place of the edition's, as `adoptionOf`
 * describes, with the record of the run, and takes back a copy's
 * statement that it carries a version that goes. The record of an
 * earlier run whose conclusions are all replaced goes with them, and
 * one of the very same run, by the same release on the same copies with
 * the same result, stays as it was first recorded. One operation, and
 * so one undo step.
 * @category Operations
 */
export const adoptStemma = (proposal: StemmaProposal, run: Run = {}): EditionOp => reading(edition => {
    const { versions, removed, propositionSet } = adoptionOf(edition, proposal, run)
    const gone = new Set(removed)
    const sets = keptSets({ ...edition, versions }, [propositionSet])
    return draft => {
        draft.versions = versions as Draft<Version>[]
        draft.copies.forEach(copy => dropStatements(copy, statement => gone.has(idOf(statement))))
        if (sets) draft.propositionSets = sets as Draft<PropositionSet>[]
        else delete draft.propositionSets
    }
})
