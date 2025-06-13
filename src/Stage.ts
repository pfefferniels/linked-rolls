import { Edit } from "./Edit";
import { Intention, Derivation, flat } from "./EditorialAssumption";
import { AnySymbol, dimensionOf } from "./Symbol";

/**
 * Stage + Stage Creation
 */
export interface Stage {
    id: string // This is the id of the actual stage which is R17 created
    siglum: string; // the siglum of the stage, e.g. P9
    basedOn?: Derivation; // if no derivation is defined, it is assumed that this stage represents the mother roll
    edits: Edit[]; // P9 consists of
    intentions: Intention[]
}

export const traverseStages = (stage: Stage, callback: (stage: Stage) => void) => {
    callback(stage);
    if (stage.basedOn) {
        traverseStages(flat(stage.basedOn), callback);
    }
}

export const getSnaphsot = (stage: Stage): AnySymbol[] => {
    const snapshot: AnySymbol[] = [];
    traverseStages(stage, s => {
        snapshot.push(...s.edits.flatMap(edit => edit.insert || []));
        const deletions = s.edits.flatMap(edit => edit.delete || []);
        for (const toRemove of deletions) {
            const index = snapshot.findIndex(s => s.id === toRemove.id);
            if (index !== -1) {
                snapshot.splice(index, 1);
            }
        }
    });
    return snapshot;
}

const isCollatable = (symbolA: AnySymbol, symbolB: AnySymbol): boolean => {
    // two symbols are collatible if they share the same 
    // symbol characteristics (pitch, expression type etc.)
    // and occur in the same horizontal position.
    if (symbolA.symbolType === 'note' && symbolB.symbolType === 'note') {
        if (symbolA.pitch !== symbolB.pitch) return false;
    }
    else if (symbolA.symbolType === 'expression' && symbolB.symbolType === 'expression') {
        if (symbolA.expressionType !== symbolB.expressionType) return false;
        if (symbolA.scope !== symbolB.scope) return false;
    }

    const dimensionA = dimensionOf(symbolA);
    const dimensionB = dimensionOf(symbolB);

    const distanceStart = Math.abs(dimensionA.horizontal.from - dimensionB.horizontal.from);
    const distanceEnd = Math.abs(dimensionA.horizontal.to - dimensionB.horizontal.to);

    if (distanceStart > 5 || distanceEnd > 5) {
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
 * Walks through the stages. If it finds a symbol that is still
 * part of the tradition (i.e. it is included in the current snapshot)
 * and is equivalent with the given symbol, it will add the feature
 * carrying the symbol to the collated symbol. Otherwise, the
 * given symbol will be added to the current stage's insertions.
 * 
 * All symbols of the tradition that are not included in the given 
 * symbols are considered to be deleted.
 * 
 * @param creation 
 * @param symbols 
 * @returns 
 */
export function fillEdits(currentStage: Stage, symbols: AnySymbol[]) {
    const snapshot = getSnaphsot(currentStage);

    // can it be collated with any of the symbols of 
    // included in the current snapshot?
    const insertions = [...symbols]
    for (const symbol of symbols) {
        snapshot
            .filter(toCompare => isCollatable(symbol, toCompare))
            .forEach(corresp => {
                corresp.carriers.push(...symbol.carriers);
                insertions.splice(insertions.indexOf(symbol), 1);
            })
    }

    // special treatment for covers
    const covers = insertions.filter(symbol => symbol.symbolType === 'cover');
    for (const cover of covers) {
        // find perforations in the snapshot that 
        // overlap with the cover
        snapshot
            .filter(
                symbol => symbol.symbolType === 'note' || symbol.symbolType === 'expression'
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

    currentStage.edits.push(
        ...insertions.map((symbol): Edit => {
            return {
                insert: [symbol],
                delete: [],
                id: symbol.id,
            }
        }));

    const deletions = new Set(snapshot).difference(new Set(symbols));
    for (const symbol of deletions) {
        currentStage.edits.push({
            insert: [],
            delete: [symbol],
            id: symbol.id,
        });
    }
}
