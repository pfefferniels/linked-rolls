import { current, Draft, isDraft } from "immer"
import { v4 } from "uuid"
import { EditionView, getAt, Path } from "./EditionView.js"
import { Edition } from "./Edition.js"
import { AnyCommand, AnySymbol, Expression, PlacementRelation, isCommand, placementRelations } from "./Symbol.js"
import { Collation, CollationTolerance, collationsOf, defaultCollationTolerance, isCollationsOwn } from "./Collation.js"
import { Edit, EditType } from "./Edit.js"
import { collationToleranceOf, Derivation, editsOf, insertedBy, principalDerivationOf, Version } from "./Version.js"
import {
    asSymbols, barOf, featuresByAct, featuresOf, GeneralRollCondition, isPaperStretch, Modification,
    ModificationPurpose, RollCopy, ScaleReading, Shift, statesNothing
} from "./RollCopy.js"
import { systemOf, TrackerBar } from "./TrackerBar.js"
import { Substitution, substitutionsBetween } from "./substitution.js"
import { trackerBarOf } from "./systems/index.js"
import { FeatureSource } from "./FeatureSource.js"
import { applyShift, applyScale, revertShift, revertScale } from "./alignment.js"
import {
    AnyArgumentation, Assumption, Belief, Certainty, MeaningComprehension, ObjectAssumption, ReferenceAssumption,
    assignReference, idOf
} from "./Assumption.js"
import {
    AnyFeature, FeatureConditionAssignment, FeatureConditionType, FeatureOrPatch, GluedOn, HorizontalSpan,
    NestedFeature, conditions as conditionsAllowed, featuresBorneBy, isGluedOn, withBorneFeatures
} from "./Feature.js"
import { distance, Millimeters, mm, subtract } from "./Quantity.js"
import { WithId } from "./utils.js"

/**
 * A change to an edition, written onto an immer draft of it. One
 * operation is one undo step, so an operation that has to read the
 * edition first takes an `EditionView` of the state it will be
 * applied to and does all its writing in the one function it returns.
 */
export type EditionOp = (draft: Draft<Edition>) => void

const noChange: EditionOp = () => undefined

const onCopy = (copyId: string, op: (copy: Draft<RollCopy>, draft: Draft<Edition>) => void): EditionOp =>
    draft => {
        const copy = draft.copies.find(c => c.id === copyId)
        if (copy) op(copy, draft)
    }

const onVersion = (versionId: string, op: (version: Draft<Version>, draft: Draft<Edition>) => void): EditionOp =>
    draft => {
        const version = draft.versions.find(v => v.id === versionId)
        if (version) op(version, draft)
    }

const onFeature = (copyId: string, featureId: string, op: (feature: Draft<FeatureOrPatch>) => void): EditionOp =>
    onCopy(copyId, copy => {
        const feature = featuresOf(copy).find(f => f.id === featureId)
        if (feature) op(feature)
    })

/**
 * The state a draft stands at, as plain data. Reading a draft proxies
 * everything it touches, so what is only read is read from this.
 */
const stateOf = <T,>(draft: Draft<T>): T => isDraft(draft) ? current(draft) : draft as T

/** The items that do not match, or the very same array when none does, so that a draft stays untouched. */
const without = <T,>(items: T[], matches: (item: T) => boolean): T[] =>
    items.some(matches) ? items.filter(item => !matches(item)) : items

/** The items each changed, or the very same array when the change left every one as it was. */
const mapped = <T,>(items: T[], change: (item: T) => T): T[] => {
    const changed = items.map(change)
    return changed.every((item, i) => item === items[i]) ? items : changed
}

/** The items each changed, less those the change emptied; the very same array where it changed none. */
const pruned = <T,>(items: T[], change: (item: T) => T, emptied: (item: T) => boolean): T[] => {
    const changed = mapped(items, change)
    return changed === items ? items : changed.filter((item, i) => item === items[i] || !emptied(item))
}

/** The record with the field replaced, or the very same record where that is what stood there. */
const replacing = <T extends object, K extends keyof T>(record: T, key: K, value: T[K]): T =>
    record[key] === value ? record : { ...record, [key]: value }

/** The ids of the items the rewriting left out. */
const droppedIds = (before: readonly WithId[], after: readonly WithId[]): string[] => {
    const kept = new Set(after.map(item => item.id))
    return before.flatMap(item => kept.has(item.id) ? [] : [item.id])
}

type Ids = ReadonlySet<string>

const insertion = (symbol: AnySymbol): Edit => ({ type: 'edit', id: v4(), insert: [symbol] })

const deletion = (symbolId: string): Edit => ({ type: 'edit', id: v4(), delete: [symbolId] })

const isEmpty = (edit: Edit): boolean => !edit.insert?.length && !edit.delete?.length

const insertedIn = (versions: readonly Version[]): AnySymbol[] => versions.flatMap(insertedBy)

/** The edits with the change applied, less those it emptied; the very same array where it changed none. */
const edited = (edits: Edit[], change: (edit: Edit) => Edit): Edit[] => pruned(edits, change, isEmpty)

/** The edit without the symbols among its insertions, or the very same edit where it inserts none of them. */
const droppingInsertions = (symbolIds: Ids) => (edit: Edit): Edit => {
    const insert = edit.insert && without(edit.insert, symbol => symbolIds.has(symbol.id))
    return insert === edit.insert ? edit : { ...edit, insert }
}

/** Takes the symbols out of the version's own insertions, and the edits that had nothing else. */
const dropInsertions = (version: Draft<Version>, symbolIds: Ids) => {
    const edits = stateOf<Version>(version).edits
    if (edits) version.edits = edited(edits, droppingInsertions(symbolIds))
}

/**
 * Puts the copy into the edition with a version of its own, which
 * inserts every symbol the copy's own tracker bar reads on it. The
 * version is a reading in that system's words, so it is coded for the
 * system the copy was cut for.
 */
export const createVersion = (copy: RollCopy): EditionOp =>
    draft => {
        const bar = barOf(copy)
        draft.copies.push(copy)
        draft.versions.push({
            type: 'Version',
            id: v4(),
            system: systemOf(bar),
            edits: asSymbols(featuresOf(copy), bar).map(insertion),
            motivations: []
        })
    }

/**
 * Puts the copy into the edition without a version of its own, as for a
 * copy whose features are not read into symbols: one known only from a
 * recording states instead which versions it carries.
 */
export const addCopy = (copy: RollCopy): EditionOp =>
    draft => {
        draft.copies.push(copy)
    }

/** States what the scale is put down to, in place of an earlier reading. */
const readScale = (copy: Draft<RollCopy>, reading: ScaleReading) => {
    if (reading.cause === 'paper') {
        copy.conditions = [...copy.conditions.filter(condition => !isPaperStretch(condition)), reading.condition]
        return
    }
    if (!copy.production) copy.production = {}
    copy.production.speed = reading.speed
}

/**
 * Shifts and then scales the copy's features into line with another
 * copy's, and puts the scale down to what the reading says: the paper,
 * or the speed the copy was cut for.
 */
export const alignCopy = (copyId: string, shift: Shift, scale: number, reading?: ScaleReading): EditionOp =>
    onCopy(copyId, copy => {
        applyShift(shift, copy)
        applyScale(scale, copy)
        if (reading) readScale(copy, reading)
    })

/**
 * Puts the copy's features back where they were measured. A paper
 * stretch read off the alignment goes with it; a speed stated stays,
 * being a fact about the copy.
 */
export const unalignCopy = (copyId: string): EditionOp =>
    onCopy(copyId, copy => {
        revertScale(copy)
        revertShift(copy)
        copy.conditions = without(copy.conditions, isPaperStretch)
    })

/** States what the copy's features were read from, in place of any earlier statement. */
export const stateSource = (copyId: string, source: FeatureSource): EditionOp =>
    onCopy(copyId, copy => {
        copy.readFrom = source
    })

/** Takes back the statement, leaving the copy silent about its source again. */
export const clearSource = (copyId: string): EditionOp =>
    onCopy(copyId, copy => {
        copy.readFrom = undefined
    })

/** Gives the copy the siglum it is referred to by, or takes it away where the siglum given is blank. */
export const nameCopy = (copyId: string, siglum: string): EditionOp =>
    onCopy(copyId, copy => {
        const trimmed = siglum.trim()
        if (trimmed) copy.siglum = trimmed
        else delete copy.siglum
    })

/** A reference under the belief given, where one is given. */
const referenceHeld = (id: string, belief?: Belief): ReferenceAssumption =>
    ({ ...assignReference(id), ...(belief && { '@annotation': { id: v4(), belief } }) })

/** The references less those that match, or nothing where none is left. */
const withoutReferences = <R extends ReferenceAssumption>(references: readonly R[], matches: (reference: Readonly<R>) => boolean): R[] | undefined => {
    const kept = references.filter(reference => !matches(reference))
    return kept.length > 0 ? kept : undefined
}

/** Takes out the copy's statements that match, and the list itself where none is left. */
const dropStatements = (copy: Draft<RollCopy>, matches: (statement: Readonly<ReferenceAssumption>) => boolean) => {
    const statements = stateOf<RollCopy>(copy).carries
    if (!statements?.some(matches)) return
    const kept = withoutReferences(statements, matches)
    if (kept) copy.carries = kept
    else delete copy.carries
}

/**
 * States that the copy carries the version, under the belief given. It
 * is meant for a copy whose features are not read into symbols, such as
 * one known only from a recording, and `carriageProblems` reports it
 * where features carry symbols already. A second statement about one
 * version is none.
 */
export const stateCarriage = (copyId: string, versionId: string, belief?: Belief): EditionOp =>
    onCopy(copyId, copy => {
        const statements = stateOf<RollCopy>(copy).carries ?? []
        if (statements.some(statement => idOf(statement) === versionId)) return
        copy.carries = [...statements, referenceHeld(versionId, belief)]
    })

/** Takes back the copy's statement that it carries the version. */
export const clearCarriage = (copyId: string, versionId: string): EditionOp =>
    onCopy(copyId, copy => dropStatements(copy, statement => idOf(statement) === versionId))

/**
 * Adds a general condition to the copy, beside whatever is stated of it
 * already. The other condition a copy may be in, a paper stretch, is
 * read off an alignment and stated by `alignCopy`.
 */
export const addGeneralCondition = (copyId: string, condition: ObjectAssumption<GeneralRollCondition>): EditionOp =>
    onCopy(copyId, copy => {
        copy.conditions.push(condition)
    })

/**
 * Whether the feature's own kind allows a condition of this kind. The
 * type narrowed to is the weaker statement, holding of a condition any
 * kind of feature may be in.
 */
const allows = (feature: FeatureOrPatch, condition: FeatureConditionAssignment):
    condition is NonNullable<FeatureOrPatch['condition']> => {
    const allowed: readonly FeatureConditionType[] = conditionsAllowed[feature.type]
    return allowed.includes(condition.conditionType)
}

/**
 * States the condition of the feature, in place of any earlier
 * statement. Throws where the kind of feature is in no such condition;
 * `conditions` says which conditions each kind of feature may be in.
 */
export const stateFeatureCondition = (
    copyId: string,
    featureId: string,
    condition: FeatureConditionAssignment
): EditionOp =>
    onFeature(copyId, featureId, feature => {
        if (!allows(feature, condition)) {
            throw new Error(`A ${feature.type} is in no '${condition.conditionType}' condition`)
        }
        feature.condition = condition
    })

/** The ids of every feature the copy bears, those a patch bears among them. */
const featureIdsOf = (copy: RollCopy): Ids =>
    new Set(featuresOf(copy).flatMap(withBorneFeatures).map(feature => feature.id))

/**
 * A symbol every carrier of which lies among the features loses its
 * evidence with them. A symbol without carriers, such as a label,
 * stands on its own.
 */
const carriedOnlyOn = (features: Ids) => (symbol: AnySymbol): boolean =>
    symbol.carriers.length > 0 && symbol.carriers.every(carrier => features.has(idOf(carrier)))

/** The symbols of the versions that no other copy carries. */
export const symbolsCarriedOnlyBy = (edition: Edition, copyId: string): AnySymbol[] => {
    const copy = edition.copies.find(c => c.id === copyId)
    return copy ? insertedIn(edition.versions).filter(carriedOnlyOn(featureIdsOf(copy))) : []
}

const references = [...placementRelations, 'pairedWith'] as const

/** The command without its references to the dropped symbols, or the very same one where it makes none. */
const forgettingReferences = (command: AnyCommand, dropped: Ids): AnyCommand => {
    const stale = references.filter(relation => {
        const reference = command[relation]
        return reference !== undefined && dropped.has(idOf(reference))
    })
    if (stale.length === 0) return command

    const kept = { ...command }
    stale.forEach(relation => { delete kept[relation] })
    return kept
}

/** The symbol without the features among its carriers, and without references to what went with them. */
const forgettingCarriers = (features: Ids, dropped: Ids) => (symbol: AnySymbol): AnySymbol => {
    const carriers = without(symbol.carriers, carrier => features.has(idOf(carrier)))
    const relieved: AnySymbol = carriers === symbol.carriers ? symbol : { ...symbol, carriers }
    return isCommand(relieved) ? forgettingReferences(relieved, dropped) : relieved
}

/** The edit without the dropped symbols and the features, or the very same edit where it had none of them. */
const forgettingFeatures = (features: Ids, dropped: Ids) => {
    const forgetCarriers = forgettingCarriers(features, dropped)
    return (edit: Edit): Edit => {
        const insert = edit.insert && mapped(without(edit.insert, symbol => dropped.has(symbol.id)), forgetCarriers)
        const deleted = edit.delete && without(edit.delete, id => dropped.has(id))
        if (insert === edit.insert && deleted === edit.delete) return edit
        return { ...edit, ...(insert && { insert }), ...(deleted && { delete: deleted }) }
    }
}

/** A record of the edition, as the walk over it sees one. */
type Node = Record<string, unknown>

const isRecord = (value: unknown): value is Node =>
    typeof value === 'object' && value !== null

/** The record's values each changed, or the very same record where the change left every one as it was. */
const withValues = (record: Node, change: (value: unknown) => unknown): Node => {
    const entries = Object.entries(record)
    const changed = entries.map(([key, value]): [string, unknown] => [key, change(value)])
    return changed.every(([, value], i) => value === entries[i][1]) ? record : Object.fromEntries(changed)
}

/** The value with the change applied to every record within it and then to itself, innermost first. */
const deeply = (change: (record: object) => object) => {
    const changed = (value: unknown): unknown =>
        Array.isArray(value) ? mapped(value as unknown[], changed)
            : isRecord(value) ? change(withValues(value, changed))
                : value
    return changed
}

/** Whether the two stand alike, so that what differs within them can be written where it lies. */
const alike = (before: unknown, after: unknown): boolean => {
    if (!isRecord(before) || !isRecord(after)) return false
    if (Array.isArray(before)) return Array.isArray(after) && before.length === after.length
    return !Array.isArray(after)
}

/** Writes onto the draft what the rewriting changed, as deep as the change reaches. */
const writeInto = (draft: Node, before: Node, after: Node) =>
    Object.entries(after).forEach(([key, value]) => {
        if (value === before[key]) return
        if (alike(before[key], value)) writeInto(draft[key] as Node, before[key] as Node, value as Node)
        else draft[key] = value
    })

/** The ids a statement names, as the rewriting leaves them. */
type Rename = (ids: string[]) => string[]

const isCopy = (record: object): record is RollCopy =>
    'type' in record && record.type === 'RollCopy'

const isBelief = (record: object): record is Belief =>
    'type' in record && record.type === 'belief'

const isComprehension = (reason: AnyArgumentation): reason is MeaningComprehension =>
    reason.type === 'meaningComprehension'

const comprehendsNothing = (reason: AnyArgumentation): boolean =>
    isComprehension(reason) && reason.comprehends.length === 0

/**
 * The modification with what it names rewritten, or the very same one
 * where that leaves it as it was. Only a removal names anything by id:
 * what an act produced or glued on it states itself.
 */
const renamingMembers = (rename: Rename) => (modification: Modification): Modification =>
    modification.type === 'Removal'
        ? replacing(modification, 'removed', rename(modification.removed))
        : modification

/** The reason with what a comprehension comprehends rewritten; any other reason names nothing of the kind. */
const renamingComprehended = (rename: Rename) => (reason: AnyArgumentation): AnyArgumentation =>
    isComprehension(reason) ? replacing(reason, 'comprehends', rename(reason.comprehends)) : reason

/**
 * The record with the ids it names rewritten: what a copy's removals
 * removed, and what the comprehensions among a belief's reasons
 * comprehend. A removal or a comprehension the rewriting emptied goes
 * with what it named; one that named nothing before stays, as an edit
 * that was empty before it does.
 */
const renaming = (rename: Rename) => (record: object): object => {
    if (isCopy(record)) {
        return replacing(record, 'modifications',
            pruned(record.modifications, renamingMembers(rename), statesNothing))
    }
    if (isBelief(record)) {
        return replacing(record, 'reasons',
            pruned(record.reasons, renamingComprehended(rename), comprehendsNothing))
    }
    return record
}

/**
 * Rewrites the ids by which the edition names features and symbols
 * outside the versions. A belief is annotatable anywhere, so the whole
 * edition is read; what the rewriting leaves alone is left the very
 * object it was.
 */
const renameReferences = (draft: Draft<Edition>, rename: Rename) => {
    const before = stateOf<Edition>(draft) as unknown as Node
    const after = deeply(renaming(rename))(before) as Node
    if (after !== before) writeInto(draft as unknown as Node, before, after)
}

/**
 * Strikes the features from the edition: their carriers go, a symbol
 * that had no other carrier goes with them, an edit left exchanging
 * nothing goes as well, and so does every reference the versions, the
 * modifications of the copies and the comprehensions made to what went.
 */
const forgetFeatures = (draft: Draft<Edition>, features: Ids) => {
    const versions = stateOf<Version[]>(draft.versions)
    const dropped = new Set(insertedIn(versions).filter(carriedOnlyOn(features)).map(symbol => symbol.id))
    const forget = forgettingFeatures(features, dropped)
    const edits = versions.map(version => version.edits && edited(version.edits, forget))
    const gone = new Set([
        ...features,
        ...dropped,
        ...versions.flatMap((version, i) => droppedIds(editsOf(version), edits[i] ?? []))
    ])

    renameReferences(draft, ids => without(ids, id => gone.has(id)))
    draft.versions.forEach((version, i) => {
        const stated = edits[i]
        if (stated) version.edits = stated
    })
}

/**
 * The ids of the features named and of everything they bear: a feature
 * of a patch stands nowhere once the patch is gone.
 */
const goneWith = (features: readonly NestedFeature[], named: Ids): string[] =>
    features.flatMap(feature => named.has(feature.id)
        ? withBorneFeatures(feature).map(borne => borne.id)
        : goneWith(featuresBorneBy(feature), named))

/** The feature with the named ones gone from what it bears, or the very same one where it bears none of them. */
const withoutBorne = <T extends NestedFeature>(feature: T, named: Ids): T => {
    if (!isGluedOn(feature) || !feature.features) return feature

    const borne = withoutFeatures(feature.features, named)
    return borne === feature.features ? feature : { ...feature, features: borne }
}

/** The features without those named, wherever they lie, and without whatever those bore. */
const withoutFeatures = <T extends NestedFeature>(features: T[], named: Ids): T[] =>
    mapped(without(features, feature => named.has(feature.id)), feature => withoutBorne(feature, named))

/** A rewriting of the features an act states, whichever kind of feature it states. */
type Rewrite = <T extends FeatureOrPatch>(features: T[]) => T[]

/** The act with its features rewritten, or the very same one where the rewriting left them. */
const rewritingAct = (rewrite: Rewrite) => (modification: Modification): Modification => {
    if (modification.type === 'Alteration') return replacing(modification, 'produced', rewrite(modification.produced))
    if (modification.type === 'Attachment') return replacing(modification, 'added', rewrite(modification.added))
    return modification
}

/**
 * Writes the rewriting onto the features of every act of the copy, and
 * takes out an act it left with nothing to state.
 */
const rewriteFeatures = (copy: Draft<RollCopy>, rewrite: Rewrite) => {
    const state = stateOf<RollCopy>(copy)
    const produced = state.production?.produced
    if (produced && copy.production) {
        const rewritten = rewrite(produced)
        if (rewritten !== produced) copy.production.produced = rewritten
    }
    copy.modifications = pruned(state.modifications, rewritingAct(rewrite), statesNothing)
}

/**
 * The act a feature an editor states belongs to: the punching of the
 * copy, the act that brought another feature about, or, where neither
 * is said, an act of its own for the purpose given. A patch is never
 * punched, being glued on, so `punched` says nothing of one.
 */
export interface FeatureAct {
    /** The copy came from its punching with it, which is where a reading of a scan puts every hole. */
    punched?: boolean

    /** The act that brought this feature about brought the new one about as well. */
    beside?: string

    /** What the act was for, where a new one is made for the feature. */
    purpose?: ModificationPurpose
}

/** The features of the act that brought the named feature about, where that act produces features. */
const producedBeside = (copy: Draft<RollCopy>, featureId: string): Draft<AnyFeature>[] | undefined => {
    const names = (features: readonly Draft<FeatureOrPatch>[]) => features.some(feature => feature.id === featureId)
    const punched = copy.production?.produced
    if (punched && names(punched)) return punched

    const act = copy.modifications.find(act => act.type === 'Alteration' && names(act.produced))
    return act?.type === 'Alteration' ? act.produced : undefined
}

/** The patches of the attachment that glued the named one on. */
const gluedBeside = (copy: Draft<RollCopy>, patchId: string): Draft<GluedOn>[] | undefined => {
    const act = copy.modifications.find(act =>
        act.type === 'Attachment' && act.added.some(patch => patch.id === patchId))
    return act?.type === 'Attachment' ? act.added : undefined
}

/** The list the copy states a new feature in, making the act it belongs to where there is none. */
const actFor = (copy: Draft<RollCopy>, patch: boolean, act: FeatureAct): Draft<FeatureOrPatch>[] => {
    const beside = act.beside !== undefined
        ? (patch ? gluedBeside(copy, act.beside) : producedBeside(copy, act.beside))
        : undefined
    if (beside) return beside

    if (patch) {
        const added: GluedOn[] = []
        copy.modifications.push({ type: 'Attachment', added, ...(act.purpose && { purpose: act.purpose }) })
        return added
    }
    if (act.punched) {
        if (!copy.production) copy.production = {}
        if (!copy.production.produced) copy.production.produced = []
        return copy.production.produced
    }

    const produced: AnyFeature[] = []
    copy.modifications.push({ type: 'Alteration', produced, ...(act.purpose && { purpose: act.purpose }) })
    return produced
}

/**
 * States that the copy bears the feature, in the act that brought it
 * about: a patch was glued on by an attachment, anything else was
 * produced, by the punching or by a later act. Which act, `FeatureAct`
 * says; a `beside` that names nothing the copy bears is passed over and
 * the feature goes into an act of its own.
 */
export const addFeature = (copyId: string, feature: FeatureOrPatch, act: FeatureAct = {}): EditionOp =>
    onCopy(copyId, copy => {
        actFor(copy, isGluedOn(feature), act).push(feature)
    })

/**
 * States that the patch bears the feature. What a patch bears came onto
 * the copy with the patch, so it belongs to no act of its own and
 * states no place: it stands where the patch stands.
 */
export const addBorneFeature = (copyId: string, patchId: string, feature: NestedFeature): EditionOp =>
    onCopy(copyId, copy => {
        const patch = featuresOf(copy).flatMap(withBorneFeatures).find(borne => borne.id === patchId)
        if (!patch || !isGluedOn(patch)) return
        if (!patch.features) patch.features = []
        patch.features.push(feature)
    })

/**
 * Takes the features off the copy, and out of the versions with what
 * only they carried. A feature may be named wherever the copy bears it:
 * a patch goes with everything glued onto it, and a feature of a patch
 * may be taken back on its own, the patch staying where it is. An act
 * left having produced or added nothing goes as well.
 */
export const removeFeatures = (copyId: string, featureIds: readonly string[]): EditionOp =>
    onCopy(copyId, (copy, draft) => {
        const named = new Set(featureIds)
        const features = featuresOf(stateOf<RollCopy>(copy))
        rewriteFeatures(copy, <T extends FeatureOrPatch>(stated: T[]) => withoutFeatures(stated, named))
        forgetFeatures(draft, new Set(goneWith(features, named)))
    })

/**
 * Takes the copy out of the edition together with the symbols only it
 * carries, and with every reference the versions and the argumentations
 * made to those symbols.
 */
export const removeCopy = (copyId: string): EditionOp =>
    onCopy(copyId, (copy, draft) => {
        forgetFeatures(draft, featureIdsOf(copy))
        draft.copies = draft.copies.filter(c => c.id !== copyId)
    })

/**
 * Whether two records of the edition state the same, the identity of a
 * statement left out: two transcriptions reading the same word say the
 * same, whichever ids they were given.
 */
const sayTheSame = (a: unknown, b: unknown): boolean => {
    if (a === b) return true
    if (!isRecord(a) || !isRecord(b) || Array.isArray(a) !== Array.isArray(b)) return false

    const keys = new Set([...Object.keys(a), ...Object.keys(b)])
    keys.delete('id')
    return [...keys].every(key => sayTheSame(a[key], b[key]))
}

/**
 * What a feature states beyond its identity, its place along the roll,
 * its depiction and its condition. What a patch bears counts by
 * identity: two patches bear the same only where they bear the very
 * same features, so that no merge takes a feature of a patch away.
 */
const nature = (feature: FeatureOrPatch): object => {
    const { id, horizontal, depiction, condition, ...rest } = feature
    return isGluedOn(feature) && feature.features
        ? { ...rest, features: feature.features.map(borne => borne.id) }
        : rest
}

const conditionsOf = (features: readonly FeatureOrPatch[]) =>
    features.flatMap(feature => feature.condition ? [feature.condition] : [])

/** Why several features cannot be replaced by one. */
export type MergeObstacle =
    | 'fewer-than-two'
    | 'different-types'
    | 'different-tracks'
    | 'differing-conditions'
    | 'unlike-features'
    | 'different-acts'

/**
 * What stands in the way of reading the features as one, or nothing
 * where they may be merged. Features may be merged where they differ
 * in nothing but their place along the roll, their depiction and the
 * condition at most one of them states. How far apart they lie is not
 * asked: whether a gap is a bridge of the perforator, a tear or two
 * perforations of their own is the editor's reading.
 */
export const mergeObstacle = (features: readonly FeatureOrPatch[]): MergeObstacle | undefined => {
    if (features.length < 2) return 'fewer-than-two'

    const [first, ...rest] = features
    if (rest.some(feature => feature.type !== first.type)) return 'different-types'
    if (rest.some(feature => !sayTheSame(feature.vertical, first.vertical))) return 'different-tracks'
    if (rest.some(feature => !sayTheSame(nature(feature), nature(first)))) return 'unlike-features'

    const conditions = conditionsOf(features)
    if (conditions.some(condition => !sayTheSame(condition, conditions[0]))) return 'differing-conditions'

    return undefined
}

/** The acts of the copy that state any of the named features. */
const actsHolding = (copy: RollCopy, named: Ids): FeatureOrPatch[][] =>
    featuresByAct(copy).filter(features => features.some(feature => named.has(feature.id)))

/**
 * What stands in the way of reading the named features of the copy as
 * one, which is the whole of what `mergeFeatures` asks: whether one act
 * brought them all about, and what the features themselves say. An id
 * the copy does not bear at a place of its own is passed over.
 */
const obstacleIn = (copy: RollCopy, featureIds: readonly string[]): MergeObstacle | undefined => {
    const named = new Set(featureIds)
    const acts = actsHolding(copy, named)
    return acts.length > 1
        ? 'different-acts'
        : mergeObstacle((acts[0] ?? []).filter(feature => named.has(feature.id)))
}

/**
 * What stands in the way of reading the features the ids name as one,
 * as `mergeFeatures` will find it. `mergeObstacle` asks only what the
 * features themselves say, which cannot reach `different-acts`: one
 * feature is the work of one act, and where the features stand is the
 * edition's business rather than theirs.
 */
export const mergeObstacleIn = (view: EditionView, featureIds: readonly string[]): MergeObstacle | undefined => {
    const copy = featureIds.map(id => view.copyOf(id)).find(copy => copy !== undefined)
    return copy ? obstacleIn(copy, featureIds) : 'fewer-than-two'
}

/** The items with the replacement in the place of the first it stands for, the others dropped. */
const standingFor = <T,>(items: T[], stands: (item: T) => boolean, replacement: T): T[] => {
    const first = items.findIndex(stands)
    if (first < 0) return items

    return items.flatMap((item, i) => i === first ? [replacement] : stands(item) ? [] : [item])
}

const spanning = (features: readonly FeatureOrPatch[]): HorizontalSpan => ({
    unit: 'mm',
    from: mm(Math.min(...features.map(feature => feature.horizontal.from))),
    to: mm(Math.max(...features.map(feature => feature.horizontal.to)))
})

/**
 * The feature the merged ones give way to. It spans them all and is in
 * every other respect the one of them that states a condition, the
 * others being alike in all but their place. The depiction goes: a
 * region of the scan showing one part depicts no more than that part.
 */
const mergedFrom = <T extends FeatureOrPatch>(features: readonly T[], id: string): T => {
    const stating = features.find(feature => feature.condition) ?? features[0]
    const merged: T = { ...stating, id, horizontal: spanning(features) }
    delete merged.depiction
    return merged
}

/** The symbol carried by the merged feature where it named one of those it replaces, and naming it once. */
const carriedByMerged = (replaced: Ids, mergedId: string) => (symbol: AnySymbol): AnySymbol => {
    const names = (carrier: ReferenceAssumption) => replaced.has(idOf(carrier))
    const first = symbol.carriers.find(names)
    if (!first) return symbol

    return { ...symbol, carriers: standingFor(symbol.carriers, names, { ...first, id: mergedId }) }
}

/** Points the versions at the merged feature wherever they name one it replaces. */
const carryOver = (draft: Draft<Edition>, replaced: Ids, mergedId: string) => {
    const recarry = carriedByMerged(replaced, mergedId)
    const recarrying = (edit: Edit): Edit => {
        const insert = edit.insert && mapped(edit.insert, recarry)
        return insert === edit.insert ? edit : { ...edit, insert }
    }

    const versions = stateOf<Version[]>(draft.versions)
    draft.versions.forEach((version, i) => {
        const edits = versions[i].edits
        if (edits) version.edits = mapped(edits, recarrying)
    })
}

/**
 * Replaces the features of the copy with a single one covering them
 * all, where a scan has split what the editor reads as one feature.
 * The merged feature takes the place of the first it replaces and
 * spans from the first to the last, any gap between them included.
 * What the replaced features carried is carried by the merged one, and
 * whatever else named them, a modification or a comprehension, names
 * the merged one in their stead.
 *
 * Only the features the copy bears itself are merged. A feature of a
 * patch states no place along the roll of its own, so there is nothing
 * for a merge to span, and an id naming one is passed over as an id the
 * copy does not bear is. Features of two different acts are not merged
 * either: one feature is the work of one act.
 *
 * Throws where the features cannot stand for one; `mergeObstacle`
 * says beforehand whether they can.
 */
export const mergeFeatures = (copyId: string, featureIds: readonly string[]): EditionOp =>
    onCopy(copyId, (copy, draft) => {
        const state = stateOf<RollCopy>(copy)
        const obstacle = obstacleIn(state, featureIds)
        if (obstacle) {
            throw new Error(`The features of copy ${copyId} cannot be merged: ${obstacle}`)
        }

        const named = new Set(featureIds)
        const toMerge = (actsHolding(state, named)[0] ?? []).filter(feature => named.has(feature.id))

        const replaced = new Set(toMerge.map(feature => feature.id))
        const mergedId = v4()
        rewriteFeatures(copy, <T extends FeatureOrPatch>(stated: T[]) => {
            const stands = (feature: T) => replaced.has(feature.id)
            return stated.some(stands) ? standingFor(stated, stands, mergedFrom(stated.filter(stands), mergedId)) : stated
        })
        carryOver(draft, replaced, mergedId)
        renameReferences(draft, ids => standingFor(ids, id => replaced.has(id), mergedId))
    })

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

/** Whether the version's text is read against the parent, its principal derivation naming it. */
const readsAgainst = (version: Readonly<Version>, parentId: string): boolean => {
    const principal = principalDerivationOf(version)
    return principal !== undefined && idOf(principal) === parentId
}

/** The derivations the version states beside its principal one, less any naming the parent. */
const hypothesesBeside = (version: Readonly<Version>, parentId: string): Derivation[] => {
    const principal = principalDerivationOf(version)
    return (version.basedOn ?? []).filter(derivation => derivation !== principal && idOf(derivation) !== parentId)
}

/** Takes out the derivations that match, and the list itself where none is left. */
const dropDerivations = (version: Draft<Version>, matches: (derivation: Readonly<Derivation>) => boolean) => {
    const derivations = stateOf<Version>(version).basedOn
    if (!derivations?.some(matches)) return
    const kept = withoutReferences(derivations, matches)
    if (kept) version.basedOn = kept
    else delete version.basedOn
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
 */
export const connectVersions = (
    view: EditionView,
    childId: string,
    parentId: string,
    tolerance: ObjectAssumption<CollationTolerance> = defaultCollationTolerance
): EditionOp => {
    const child = view.get<Version>(childId)
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
    const substituted = differ(child, view.get<Version>(parentId))
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
            insert: [...by],
            delete: deleted
        }
    }

    const edits = [
        ...established,
        ...substituted.map(equivalence),
        ...own.filter(symbol => !collated.has(symbol.id) && !paired.has(symbol.id)).map(insertion),
        ...inherited
            .filter(symbol => !matched.has(symbol.id) && !paired.has(symbol.id))
            .map(symbol => deletion(symbol.id))
    ]

    return onVersion(childId, (child, draft) => {
        handOverCarriers(view, draft, collations)
        child.edits = edits
        child.basedOn = [
            { ...assignReference(parentId), collationTolerance: tolerance },
            ...hypothesesBeside(stateOf<Version>(child), parentId)
        ]
    })
}

/**
 * Folds the version's own symbols into those it inherits and collates
 * with: the carriers pass over, and the insertions go. Collates at the
 * tolerance of the derivation, where the caller names none.
 */
export const collateSymbols = (
    view: EditionView,
    versionId: string,
    symbolIds: readonly string[],
    tolerance?: CollationTolerance
): EditionOp => {
    const version = view.get<Version>(versionId)
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
}

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

/** The symbol where the copy and at least one other carry it, with the carriers of each side. */
const sharedWith = (view: EditionView, symbol: Readonly<AnySymbol>, copyId: string): Shared[] => {
    const onCopy = (carrier: ReferenceAssumption) => view.copyOf(idOf(carrier))?.id === copyId
    const mine = symbol.carriers.filter(onCopy)
    const theirs = symbol.carriers.filter(carrier => !onCopy(carrier))
    return mine.length > 0 && theirs.length > 0 ? [{ symbol, mine, theirs }] : []
}

/**
 * Takes the copy's reading of a symbol back out of the symbol it was
 * collated into: the copy's carriers pass to a new symbol of the
 * version's own, the other copies keep the symbol they had, and the
 * version states the exchange.
 *
 * This is the inverse of the hand-over a collation makes, and it is
 * what lets a derivation be collated a second time. A collated symbol
 * is one symbol carrying every copy that reads it, so nothing else
 * takes the two readings apart again, and without that a tolerance
 * arrived at after the fact could never be applied.
 *
 * Symbols the copy alone carries are already the version's own and are
 * passed over, so a reading somebody has separated by hand keeps its
 * identifier and the edit that speaks for it. Named symbols narrow the
 * act to those; naming none separates the copy's whole reading.
 */
export const separateReadings = (
    view: EditionView,
    versionId: string,
    copyId: string,
    symbolIds?: readonly string[]
): EditionOp => {
    const version = view.get<Version>(versionId)
    if (!version) return noChange

    const chosen = symbolIds && new Set(symbolIds)
    const shared = view.snapshot(versionId)
        .filter(symbol => chosen === undefined || chosen.has(symbol.id))
        .flatMap(symbol => sharedWith(view, symbol, copyId))
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
}

/**
 * Makes the version stand on its own: what it inherited becomes its
 * own insertions, and its derivations go, the hypotheses among them,
 * with the motivations that belonged to them.
 */
export const detachVersion = (view: EditionView, versionId: string): EditionOp => {
    const edits = view.snapshot(versionId).map(insertion)

    return onVersion(versionId, version => {
        version.edits = edits
        delete version.basedOn
        version.motivations = []
    })
}

/**
 * Takes the version out. Whatever read its text against it comes to
 * stand on its own, a hypothesis that something derives from it goes,
 * and so does a copy's statement that it carries the version.
 */
export const removeVersion = (view: EditionView, versionId: string): EditionOp => {
    const detachments = view.edition.versions
        .filter(version => readsAgainst(version, versionId))
        .map(version => detachVersion(view, version.id))
    const namesIt = (reference: Readonly<ReferenceAssumption>) => idOf(reference) === versionId

    return draft => {
        detachments.forEach(detach => detach(draft))
        draft.versions.forEach(version => dropDerivations(version, namesIt))
        draft.copies.forEach(copy => dropStatements(copy, namesIt))
        draft.versions = without(draft.versions, version => version.id === versionId)
    }
}

/** Takes the symbols out of the version's own insertions, and the edits that had nothing else. */
export const removeSymbols = (versionId: string, symbolIds: readonly string[]): EditionOp =>
    onVersion(versionId, version => dropInsertions(version, new Set(symbolIds)))

/** Moves the edits into a new version based on this one. */
export const deriveVersion = (versionId: string, editIds: readonly string[]): EditionOp =>
    onVersion(versionId, (version, draft) => {
        const chosen = new Set(editIds)
        const moved = editsOf(version).filter(edit => chosen.has(edit.id))
        if (version.edits) version.edits = without(version.edits, edit => chosen.has(edit.id))
        draft.versions.push({
            type: 'Version',
            id: v4(),
            system: stateOf<Version>(version).system,
            basedOn: [assignReference(versionId)],
            edits: moved,
            motivations: []
        })
    })

/**
 * States that the version may also derive from the parent, beside what
 * it derives from already: a hypothesis, such as a contamination, under
 * the belief given. The text stays read against the principal derivation
 * unless the belief holds this one more certain. A version derives from
 * itself, or twice from one parent, in no statement.
 */
export const stateDerivation = (versionId: string, parentId: string, belief?: Belief): EditionOp =>
    onVersion(versionId, version => {
        const derivations = stateOf<Version>(version).basedOn ?? []
        if (parentId === versionId || derivations.some(derivation => idOf(derivation) === parentId)) return
        version.basedOn = [...derivations, referenceHeld(parentId, belief)]
    })

/** Takes back the hypothesis that the version derives from the parent; the principal derivation goes with `detachVersion`. */
export const clearDerivation = (versionId: string, parentId: string): EditionOp =>
    onVersion(versionId, version => {
        if (readsAgainst(stateOf<Version>(version), parentId)) return
        dropDerivations(version, derivation => idOf(derivation) === parentId)
    })

const sameSequence = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((value, i) => value === b[i])

const expressionTypesOf = (symbols: readonly AnySymbol[]) =>
    symbols.filter((symbol): symbol is Expression => symbol.type === 'expression').map(symbol => symbol.expressionType)

/**
 * How a single added accent is spelled. The red Welte latches a valve
 * on and off again, the green holds one perforation for as long as the
 * accent lasts, so the spelling is the system's and not the music's.
 * Which of them a bar can spell decides which ones it is offered.
 */
const ACCENTS = [
    ['SlowCrescendoOn', 'SlowCrescendoOff'],
    ['ForzandoOn', 'ForzandoOff'],
    ['Crescendo'],
    ['SforzandoForte']
]

const accentsOn = (bar: TrackerBar | undefined): string[][] =>
    bar ? ACCENTS.filter(accent => accent.every(type => bar.expressionTypes.includes(type))) : []

const lengthOf = (span: HorizontalSpan): Millimeters => subtract(span.to, span.from)

/** How far apart two onsets may lie for the one symbol to count as a replacement of the other. */
const REPLACEMENT_TOLERANCE = mm(5)

/** Shorten or prolong, where the inserted symbol starts about where the deleted one did. */
const replacementType = (view: EditionView, inserted: AnySymbol, deleted: AnySymbol): EditType | undefined => {
    const after = view.placeOf(inserted)
    const before = view.placeOf(deleted)
    if (!after || !before || distance(after.from, before.from) >= REPLACEMENT_TOLERANCE) return undefined

    return lengthOf(after) < lengthOf(before) ? 'shorten' : 'prolong'
}

/**
 * A guess at what an edit does, from the symbols it exchanges and from
 * the systems the version and the one it is based on are coded for.
 */
const guessEditType = (view: EditionView, versionId: string, edit: Edit): EditType => {
    const inserts = edit.insert ?? []
    const deletes = view.getAll<AnySymbol>(edit.delete ?? [])
    const inserted = expressionTypesOf(inserts)
    const deleted = expressionTypesOf(deletes)

    const bar = trackerBarOf(view.get<Version>(versionId)?.system)
    const parentBar = trackerBarOf(view.predecessorOf(versionId)?.system)

    /**
     * Where the version is coded for another system than its parent, an
     * exchange of expression matter is the transfer being carried out:
     * a red ForzandoOn and ForzandoOff pair giving way to one held green
     * SforzandoForte says the same thing in the other system's words,
     * which is what 'replace-with-equivalent' is for. Calling it a
     * corrected error would say the editor made a mistake.
     */
    if (bar && parentBar && bar.id !== parentBar.id && inserted.length > 0 && deleted.length > 0) {
        return 'replace-with-equivalent'
    }

    if (deleted.length === 0 && accentsOn(bar).some(accent => sameSequence(inserted, accent))) return 'additional-accent'
    if (inserted.length > 1 && sameSequence(inserted, deleted)) return 'shift'
    if (inserted.length === 0 && deleted.length === 1) return 'remove-redundancy'
    if (inserts.length === 1 && deletes.length === 1) return replacementType(view, inserts[0], deletes[0]) ?? 'correct-error'

    return 'correct-error'
}

/**
 * Replaces the edits with a single one carrying all their insertions
 * and deletions, classified by a guess at what the exchange does.
 */
export const mergeEdits = (view: EditionView, versionId: string, toMerge: readonly Edit[]): EditionOp => {
    if (toMerge.length === 0) return noChange

    const merged: Edit = {
        ...toMerge[0],
        id: v4(),
        insert: toMerge.flatMap(edit => edit.insert ?? []),
        delete: toMerge.flatMap(edit => edit.delete ?? [])
    }
    merged.editType = guessEditType(view, versionId, merged)
    const mergedIds = new Set(toMerge.map(edit => edit.id))

    return onVersion(versionId, version => {
        version.edits = [...editsOf(version).filter(edit => !mergedIds.has(edit.id)), merged]
    })
}

/** Replaces the edit with one edit per inserted and one per deleted symbol. */
export const splitEdit = (versionId: string, toSplit: Edit): EditionOp => {
    const parts = [
        ...(toSplit.insert ?? []).map(insertion),
        ...(toSplit.delete ?? []).map(deletion)
    ]

    return onVersion(versionId, version => {
        version.edits = [...editsOf(version).filter(edit => edit.id !== toSplit.id), ...parts]
    })
}

/**
 * Runs the change on the command the view locates by id, in whichever
 * version inserted it. A statement made there holds in every version
 * that carries the command.
 */
const onCommand = (view: EditionView, id: string, op: (command: Draft<AnyCommand>) => void): EditionOp =>
    draft => {
        const path = view.getPath(id)
        const symbol = path && getAt<Draft<AnySymbol>>(path, draft)
        if (isCommand(symbol)) op(symbol)
    }

const clearPlacement = (command: Draft<AnyCommand>) =>
    placementRelations.forEach(relation => { delete command[relation] })

/** States how the follower is placed relative to the reference, in place of any earlier statement. */
export const placeCommand = (
    view: EditionView,
    followerId: string,
    referenceId: string,
    relation: PlacementRelation
): EditionOp =>
    onCommand(view, followerId, command => {
        clearPlacement(command)
        command[relation] = assignReference(referenceId)
    })

export const unplaceCommand = (view: EditionView, followerId: string): EditionOp =>
    onCommand(view, followerId, clearPlacement)

/** The pair is stated on `statingId` only, as the format asks. */
export const pairCommands = (view: EditionView, statingId: string, partnerId: string): EditionOp =>
    onCommand(view, statingId, command => {
        command.pairedWith = assignReference(partnerId)
    })

export const unpairCommand = (view: EditionView, statingId: string): EditionOp =>
    onCommand(view, statingId, command => {
        delete command.pairedWith
    })

const onAssumptionAt = (path: Path, op: (assumption: Draft<Assumption>) => void): EditionOp =>
    draft => {
        const assumption = getAt<Draft<Assumption>>(path, draft)
        if (assumption) op(assumption)
    }

const onBeliefAt = (path: Path, op: (belief: Draft<Belief>) => void): EditionOp =>
    onAssumptionAt(path, assumption => {
        const belief = assumption['@annotation']?.belief
        if (belief) op(belief)
    })

/** Annotates the assumption at the path with a belief held true, for reasons to be added. */
export const createBelief = (path: Path): EditionOp =>
    onAssumptionAt(path, assumption => {
        assumption['@annotation'] = {
            id: v4(),
            belief: { type: 'belief', id: v4(), certainty: 'true', reasons: [] }
        }
    })

export const clearBelief = (path: Path): EditionOp =>
    onAssumptionAt(path, assumption => {
        delete assumption['@annotation']
    })

export const setCertainty = (path: Path, certainty: Certainty): EditionOp =>
    onBeliefAt(path, belief => {
        belief.certainty = certainty
    })

export const addReason = (path: Path, reason: AnyArgumentation): EditionOp =>
    onBeliefAt(path, belief => {
        belief.reasons.push(reason)
    })

export const removeReason = (path: Path, index: number): EditionOp =>
    onBeliefAt(path, belief => {
        belief.reasons.splice(index, 1)
    })
