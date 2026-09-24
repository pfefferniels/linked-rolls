/** Operations on the features a copy bears: adding, removing and merging them, and stating their condition. */
import { Draft } from "immer"
import { v4 } from "uuid"
import { EditionView } from "../EditionView.js"
import { Edition } from "../Edition.js"
import { AnySymbol } from "../Symbol.js"
import { Edit } from "../Edit.js"
import { Version } from "../Version.js"
import { featuresByAct, featuresOf, Modification, ModificationPurpose, RollCopy, statesNothing } from "../RollCopy.js"
import { ReferenceAssumption, idOf } from "../Assumption.js"
import { AnyFeature, FeatureConditionAssignment, FeatureConditionType, FeatureOrPatch, HorizontalSpan, NestedFeature, Patch, conditions as conditionsAllowed, featuresBorneBy, isPatch, withBorneFeatures } from "../Feature.js"
import { mm } from "../Quantity.js"
import { EditionOp, onCopy, onFeature, stateOf, Ids } from "./draft.js"
import { without, mapped, pruned, replacing, isRecord } from "./immutable.js"
import { renameReferences, forgetFeatures } from "./forget.js"

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
    if (!isPatch(feature) || !feature.features) return feature

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
    /** The copy came from its punching with it, which is where a reading of a scan puts every chain of holes. */
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
const gluedBeside = (copy: Draft<RollCopy>, patchId: string): Draft<Patch>[] | undefined => {
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
        const added: Patch[] = []
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
        actFor(copy, isPatch(feature), act).push(feature)
    })

/**
 * States that the patch bears the feature. What a patch bears came onto
 * the copy with the patch, so it belongs to no act of its own and
 * states no place: it stands where the patch stands.
 */
export const addBorneFeature = (copyId: string, patchId: string, feature: NestedFeature): EditionOp =>
    onCopy(copyId, copy => {
        const patch = featuresOf(copy).flatMap(withBorneFeatures).find(borne => borne.id === patchId)
        if (!patch || !isPatch(patch)) return
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
    return isPatch(feature) && feature.features
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
