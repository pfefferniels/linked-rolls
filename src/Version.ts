import { v4 } from "uuid";
import { ActorAssignment, Edit } from "./Edit";
import { EditorialAssumption, Motivation, flat } from "./EditorialAssumption";
import { AnySymbol, dimensionOf } from "./Symbol";
import { CollationTolerance } from "./Collation";

export type Derivation = EditorialAssumption<'derivation', Version>

export const versionTypes = [
    /**
     * The roll is in a state where it is used as 
     * the master roll for several new reproductions.
     */
    'edition',

    /**
     * This denotes a version which is specific to (early)
     * Welte-Mignon piano rolls, where rolls inteded to 
     * be pulished are revised by a controller first. These
     * rolls typically carry a "controlliert" stamp. The
     * revision is done on the same date as the perforation 
     * and the date is written on the roll towards its end.
     */
    'authorised-revision',

    /**
     * Unauthorised revisions are those, which cannot be linked
     * to a specific controller and are likely done by
     * a later, anonymous hand. 
     */
    'unauthorised-revision',

    /**
     * In the case of Welte Mignon rolls, glosses are
     * typically comments about the roll's condition, added
     * e.g. by the collector.
     */
    'gloss'
] as const

export type VersionType = typeof versionTypes[number];

/**
 * Version + Version Creation
 */
export interface Version {
    id: string // This is the id of the actual version which is R17 created
    siglum: string; // the siglum of the version, e.g. P9
    actor?: ActorAssignment
    basedOn?: Derivation; // if no derivation is defined, it is assumed that this version represents the mother roll
    edits: Edit[]; // P9 consists of
    motivations: Motivation<string>[]
    type: VersionType
}

export const traverseVersions = (version: Version, callback: (version: Version) => void) => {
    callback(version);
    if (version.basedOn) {
        traverseVersions(flat(version.basedOn), callback);
    }
}

export const getSnapshot = (version: Version): AnySymbol[] => {
    const snapshot: AnySymbol[] = [];
    const toDelete: AnySymbol[] = [];

    traverseVersions(version, s => {
        snapshot.push(...s.edits.flatMap(edit => edit.insert || []));

        // as we travel further up, remove symbols that are 
        // deleted in the versions further down
        const deleted: AnySymbol[] = []
        for (const toRemove of toDelete) {
            const index = snapshot.findIndex(s => s === toRemove);
            if (index !== -1) {
                snapshot.splice(index, 1);
                deleted.push(toRemove)
            }
        }
        for (const del of deleted) {
            toDelete.splice(toDelete.indexOf(del), 1);
        }

        // collect symbols that are deleted in the current version
        toDelete.push(...s.edits.flatMap(edit => edit.delete || []));
    });

    return snapshot.sort((a, b) => {
        const aDimension = dimensionOf(a)
        const bDimension = dimensionOf(b)
        return aDimension.horizontal.from - bDimension.horizontal.from;
    })
}

const isCollatable = (
    symbolA: AnySymbol,
    symbolB: AnySymbol,
    tolerance: CollationTolerance = {
        toleranceEnd: 5,
        toleranceStart: 5
    }
): boolean => {
    // two symbols are collatible if they share the same 
    // symbol characteristics (pitch, expression type etc.)
    // and occur in the same horizontal position.
    if (symbolA.type === 'note' && symbolB.type === 'note') {
        if (symbolA.pitch !== symbolB.pitch) return false;
    }
    else if (symbolA.type === 'expression' && symbolB.type === 'expression') {
        if (symbolA.expressionType !== symbolB.expressionType) return false;
        if (symbolA.scope !== symbolB.scope) return false;
    }

    const dimensionA = dimensionOf(symbolA);
    const dimensionB = dimensionOf(symbolB);

    const distanceStart = Math.abs(dimensionA.horizontal.from - dimensionB.horizontal.from);
    const distanceEnd = Math.abs(dimensionA.horizontal.to - dimensionB.horizontal.to);

    if (distanceStart > tolerance.toleranceStart
        || distanceEnd > tolerance.toleranceEnd
    ) {
        // the symbols are too far apart to be collated
        return false;
    }

    return true
}

type LazyDimension = Partial<{ from: number, to: number }>;

type LazyArea = {
    horizontal: LazyDimension;
    vertical: LazyDimension;
}

const overlaps = (a: LazyArea, b: LazyArea): boolean => {
    const overlapsDimension = (a: LazyDimension, b: LazyDimension): boolean =>
        (a.from ?? 0) < (b.to ?? Infinity) && (b.from ?? 0) < (a.to ?? Infinity);

    return overlapsDimension(a.horizontal, b.horizontal) && overlapsDimension(a.vertical, b.vertical);
}

/**
 * Walks through the versions. If it finds a symbol that is still
 * part of the tradition (i.e. it is included in the current snapshot)
 * and is equivalent with the given symbol, it will add the feature
 * carrying the symbol to the collated symbol. Otherwise, the
 * given symbol will be added to the current version's insertions.
 * 
 * All symbols of the tradition that are not included in the given 
 * symbols are considered to be deleted.
 * 
 * @param creation 
 * @param symbols 
 * @returns 
 */
export function fillEdits(
    currentVersion: Version,
    symbols: AnySymbol[],
    tolerance: CollationTolerance = {
        toleranceEnd: 5,
        toleranceStart: 5
    }
) {
    const snapshot = getSnapshot(currentVersion);

    const treatedSymbols: AnySymbol[] = []

    // can it be collated with any of the symbols of 
    // included in the current snapshot?
    const insertions = [...symbols]
    for (const symbol of symbols) {
        snapshot
            .filter(toCompare => isCollatable(symbol, toCompare, tolerance))
            .forEach(corresp => {
                corresp.carriers.push(...symbol.carriers);
                insertions.splice(insertions.indexOf(symbol), 1);
                treatedSymbols.push(corresp)
            })
    }

    // special treatment for covers
    const covers = insertions.filter(symbol => symbol.type === 'cover');
    for (const cover of covers) {
        // find perforations in the snapshot that 
        // overlap with the cover
        snapshot
            .filter(
                symbol => symbol.type === 'note' || symbol.type === 'expression'
            )
            .map(dimensionOf)
            .filter(dimension => overlaps(dimension, dimensionOf(cover)))
            .forEach(dimension => {
                const coverDimension = dimensionOf(cover)

                // check if the cover partially covers the beginning
                if (dimension.horizontal.from >= coverDimension.horizontal.from &&
                    dimension.horizontal.from <= coverDimension.horizontal.to) {
                    // the note starts where the cover ends
                    dimension.horizontal.from = coverDimension.horizontal.to
                }

                // check if the cover partially covers the ending
                if (dimension.horizontal.to >= coverDimension.horizontal.from &&
                    dimension.horizontal.to <= coverDimension.horizontal.to) {
                    // the note ends where the cover starts
                    dimension.horizontal.to = coverDimension.horizontal.from
                }
            })


        insertions.splice(insertions.indexOf(cover), 1);
    }

    currentVersion.edits.push(
        ...insertions.map((symbol): Edit => {
            return {
                insert: [symbol],
                delete: [],
                id: v4(),
            }
        }));

    const deletions = snapshot.filter(sym => {
        return !treatedSymbols.includes(sym)
    });

    for (const symbol of deletions) {
        currentVersion.edits.push({
            insert: [],
            delete: [symbol],
            id: v4(),
        });
    }
}
