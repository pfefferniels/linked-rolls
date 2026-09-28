/** What a version shows, and where along the roll its symbols lie. */
import { Edition } from "../model/Edition.js";
import { FeatureOrPatch, HorizontalSpan, isPlaced, NestedFeature } from "../model/Feature.js";
import { AnySymbol } from "../model/Symbol.js";
import { deletedBy, insertedBy } from "../model/Version.js";
import { idsOf } from "../model/Assumption.js";
import { mean, Millimeters } from "../model/Quantity.js";
import { featuresIn } from "../lookup/lookup.js";
import { perState } from "../lookup/perState.js";
import { lineageOf } from "./stemma.js";

export const carriersOf = (edition: Pick<Edition, 'copies'>, symbol: AnySymbol): Readonly<NestedFeature>[] =>
    featuresIn(edition, idsOf(symbol.carriers))

/** The carriers that state a place of their own, which a feature on a patch does not. */
export const placedCarriersOf = (edition: Pick<Edition, 'copies'>, symbol: AnySymbol): Readonly<FeatureOrPatch>[] =>
    carriersOf(edition, symbol).filter(isPlaced)

/**
 * Where along the roll the symbol lies, as its carriers put it, or
 * nothing for a symbol no copy carries.
 *
 * Only the place is measured. Which track the symbol sits on is not
 * a measurement but a question for a tracker bar, since a note of
 * one pitch sits on exactly one position of a given bar: ask
 * `bar.positionOf`. The carriers cannot answer it, because a copy
 * cut for another system numbers its tracks differently, and one
 * symbol may be carried by copies of both — averaging a red carrier
 * on track 47 with a green one on 45 would give 46, a legal
 * position a semitone away on either bar.
 */
export const placeOf = (edition: Pick<Edition, 'copies'>, symbol: AnySymbol): Readonly<HorizontalSpan> | undefined => {
    const carriers = placedCarriersOf(edition, symbol)
    if (carriers.length === 0) return

    return {
        unit: 'mm',
        from: mean(carriers.map(carrier => carrier.horizontal.from)),
        to: mean(carriers.map(carrier => carrier.horizontal.to))
    }
}

/** Where the symbol begins, as the mean onset of its carriers, or nothing for a symbol without a place. */
export const onsetOf = (edition: Pick<Edition, 'copies'>, symbol: AnySymbol): Millimeters | undefined =>
    placeOf(edition, symbol)?.from

/** The symbols by onset, those without a place first; symbols at one place keep their order. */
const inOrderOfPlace = (edition: Pick<Edition, 'copies'>, symbols: readonly Readonly<AnySymbol>[]): Readonly<AnySymbol>[] =>
    symbols
        .map(symbol => ({ symbol, at: onsetOf(edition, symbol) || 0 }))
        .sort((a, b) => a.at - b.at)
        .map(({ symbol }) => symbol)

/** The snapshots of a state asked for so far, by version. */
const snapshotsIn = perState((_: Edition) => new Map<string, readonly Readonly<AnySymbol>[]>())

/**
 * The symbols the version shows: what it and its ancestors insert,
 * each version's deletions striking what it or its ancestors inserted.
 * They are worked out once for each state of the edition, and the list
 * is frozen, since everyone who asks is handed the same one.
 */
export const snapshotOf = (edition: Edition, versionId: string): readonly Readonly<AnySymbol>[] => {
    const known = snapshotsIn(edition)
    const kept = known.get(versionId)
    if (kept) return kept

    const deleted = new Set<string>()
    const symbols = lineageOf(edition, versionId).flatMap(version => {
        deletedBy(version).forEach(id => deleted.add(id))
        return insertedBy(version).filter(symbol => !deleted.has(symbol.id))
    })
    const snapshot = Object.freeze(inOrderOfPlace(edition, symbols))
    known.set(versionId, snapshot)
    return snapshot
}
