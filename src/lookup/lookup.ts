/**
 * Finding what an edition holds by its id. Each kind of entity has an
 * index of its own, built from where the edition holds it when first
 * asked for and kept for as long as the state is (`perState`). The index
 * an entity is found in says what it is, so a lookup needs neither a
 * type discriminator nor a cast.
 */
import { Edition } from "../model/Edition.js";
import { NestedFeature, withBorneFeatures } from "../model/Feature.js";
import { AnySymbol } from "../model/Symbol.js";
import { insertedBy, Version } from "../model/Version.js";
import { featuresMadeBy, featuresOf, Modification, ProductionEvent, RollCopy } from "../model/RollCopy.js";
import { perState } from "./perState.js";

const byIdIn = <T extends { readonly id: string }>(entities: readonly T[]): ReadonlyMap<string, T> =>
    new Map(entities.map(entity => [entity.id, entity]));

const versionsById = perState((edition: Pick<Edition, 'versions'>) => byIdIn(edition.versions))
const copiesById = perState((edition: Pick<Edition, 'copies'>) => byIdIn(edition.copies))
const symbolsById = perState((edition: Pick<Edition, 'versions'>) => byIdIn(edition.versions.flatMap(insertedBy)))

/** Every feature and patch on the copies, those a patch bears included. */
const featuresOnCopies = (edition: Pick<Edition, 'copies'>) =>
    edition.copies.flatMap(copy => featuresOf(copy).flatMap(withBorneFeatures).map(feature => ({ feature, copy })))

const featuresById = perState((edition: Pick<Edition, 'copies'>) =>
    new Map(featuresOnCopies(edition).map(({ feature }) => [feature.id, feature])) as ReadonlyMap<string, NestedFeature>)

const copiesByFeature = perState((edition: Pick<Edition, 'copies'>) =>
    new Map(featuresOnCopies(edition).map(({ feature, copy }) => [feature.id, copy])) as ReadonlyMap<string, RollCopy>)

/**
 * The version with the id, where the edition holds one.
 * @category Lookups
 */
export const versionIn = (edition: Pick<Edition, 'versions'>, id: string): Readonly<Version> | undefined =>
    versionsById(edition).get(id)

/**
 * The copy with the id, where the edition holds one.
 * @category Lookups
 */
export const copyIn = (edition: Pick<Edition, 'copies'>, id: string): Readonly<RollCopy> | undefined =>
    copiesById(edition).get(id)

/**
 * A symbol any version inserts.
 * @category Lookups
 */
export const symbolIn = (edition: Pick<Edition, 'versions'>, id: string): Readonly<AnySymbol> | undefined =>
    symbolsById(edition).get(id)

/**
 * The symbols under the ids, leaving out an id that names none.
 * @category Lookups
 */
export const symbolsIn = (edition: Pick<Edition, 'versions'>, ids: readonly string[]): Readonly<AnySymbol>[] =>
    ids.flatMap(id => symbolIn(edition, id) ?? [])

/**
 * A feature or a patch on any copy, one a patch bears included.
 * @category Lookups
 */
export const featureIn = (edition: Pick<Edition, 'copies'>, id: string): Readonly<NestedFeature> | undefined =>
    featuresById(edition).get(id)

/**
 * The features and patches under the ids, leaving out an id that names none.
 * @category Lookups
 */
export const featuresIn = (edition: Pick<Edition, 'copies'>, ids: readonly string[]): Readonly<NestedFeature>[] =>
    ids.flatMap(id => featureIn(edition, id) ?? [])

/**
 * The copy a feature sits on, a patch and everything it bears included.
 * @category Lookups
 */
export const copyOfFeature = (edition: Pick<Edition, 'copies'>, featureId: string): Readonly<RollCopy> | undefined =>
    copiesByFeature(edition).get(featureId)

/**
 * The act a copy states a feature in: the production event that
 * punched it, or the modification that brought it about. A feature
 * a patch bears came onto the copy with the patch, so the act is
 * the one that glued the patch on. Two features stand in one act
 * where this returns the very same object.
 * @category Lookups
 */
export const actOf = (edition: Pick<Edition, 'copies'>, featureId: string): Readonly<ProductionEvent | Modification> | undefined => {
    const copy = copyOfFeature(edition, featureId)
    if (!copy) return undefined

    const states = (features: readonly NestedFeature[]): boolean =>
        features.flatMap(withBorneFeatures).some(feature => feature.id === featureId)

    if (states(copy.production?.produced ?? [])) return copy.production
    return copy.modifications.find(act => states(featuresMadeBy(act)))
}
