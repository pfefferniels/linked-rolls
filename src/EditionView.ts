import { v4 } from "uuid";
import { CollationTolerance } from "./Collation";
import { Edit, EditMotivation } from "./Edit";
import { Edition } from "./Edition";
import { assign, flat } from "./EditorialAssumption";
import { NegotiatedEvent } from "./Emulation";
import { RollFeature, HorizontalSpan, VerticalSpan } from "./Feature";
import { AnySymbol, CarrierAssignment, Expression, ExpressionType, Note } from "./Symbol";
import { Version } from "./Version";
import { Draft } from "immer";

export type Path = (string | number)[];

export const getAt = <T,>(path: Path, obj: unknown): T | undefined => {
    let node: any = obj
    for (const key of path) {
        if (node == null) return undefined;
        node = node[key as any];
    }
    return node as T;
}

export class EditionView {
    readonly edition: Edition

    // maps symbol IDs to the features that carry them
    readonly symbolCarriers: Map<string, RollFeature[]> = new Map()

    // maps symbol IDs to their path in the edition structure
    readonly symbolPaths: Map<string, Path> = new Map()

    // maps feature IDs to the copy they belong to and the symbol they carry
    readonly featureInfos: Map<string, {
        copyId: string,
        symbolId?: string
    }> = new Map()

    constructor(edition: Edition) {
        this.edition = edition;
        this.indexSymbolPaths()
        this.indexSymbolCarriers()
        this.indexFeatures()
    }

    private indexFeatures() {
        this.edition.copies.forEach(copy => {
            copy.features.forEach(feature => {
                let symbolId
                for (const [key, value] of this.symbolCarriers) {
                    if (value.find(f => f.id === feature.id)) {
                        symbolId = key;
                        break;
                    }
                }

                this.featureInfos.set(feature.id, {
                    copyId: copy.id,
                    symbolId: symbolId
                })
            })
        })
    }

    private indexSymbolCarriers() {
        const flatFeatures = this.edition.copies.map(c => c.features).flat();
        this.edition.versions.forEach(version => {
            version.edits.forEach(edit => {
                (edit.insert || []).forEach(symbol => {
                    const carriers = symbol.carriers
                        .map(featureId => {
                            return flatFeatures.find(f => f.id === flat(featureId));
                        })
                        .filter((f): f is RollFeature => !!f);
                    this.symbolCarriers.set(symbol.id, carriers);
                })
            })
        })
    }

    private indexSymbolPaths() {
        this.edition.versions.forEach((version, vi) => {
            version.edits.forEach((edit, ei) => {
                (edit.insert || []).forEach((symbol, si) => {
                    const path: Path = ['versions', vi, 'edits', ei, 'insert', si] as const
                    this.symbolPaths.set(symbol.id, path);
                })
            })
        })
    }

    travelUp(version: Version, callback: (version: Version) => void) {
        callback(version);
        if (version.basedOn) {
            const v = this.edition.versions.find(v => v.id === flat(version.basedOn!))
            if (!v) return

            this.travelUp(v, callback);
        }
    }

    predecessorOf(version: Version) {
        if (!version.basedOn) return
        return this.edition.versions.find(v => v.id === flat(version.basedOn!))
    }

    dimensionOf(symbol: AnySymbol): { horizontal: HorizontalSpan, vertical: VerticalSpan } | undefined {
        const carriers = this.carriersOf(symbol);

        if (carriers.length === 0) {
            return
        }

        const horizontalFrom = carriers.reduce((hAcc, h) => hAcc + h.horizontal.from, 0) / carriers.length;
        const horizontalTo = carriers.reduce((hAcc, h) => hAcc + h.horizontal.to, 0) / carriers.length;
        const verticalFrom = carriers.reduce((vAcc, v) => vAcc + v.vertical.from, 0) / carriers.length;

        const definedVerticalTo = carriers.filter(v => v.vertical.to !== undefined)
        let verticalTo: number | undefined = undefined
        if (definedVerticalTo.length > 0) {
            verticalTo = definedVerticalTo
                .reduce((vAcc, v) => vAcc + v.vertical.to!, 0) / definedVerticalTo.length;
        }

        return {
            horizontal: { unit: 'mm', from: horizontalFrom, to: horizontalTo },
            vertical: { unit: 'track', from: verticalFrom, to: verticalTo }
        };
    }

    getSnapshot(version: Version): readonly AnySymbol[] {
        const snapshot: AnySymbol[] = [];
        const toDelete: string[] = [];

        this.travelUp(version, s => {
            console.log('dealing with version,', version)
            snapshot.push(...s.edits.flatMap(edit => edit.insert || []));

            // as we travel further up, remove symbols that are 
            // deleted in the versions further down
            const deleted: string[] = []
            for (const toRemove of toDelete) {
                const index = snapshot.findIndex(s => s.id === toRemove);
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
            const aDimension = this.dimensionOf(a)
            const bDimension = this.dimensionOf(b)
            return (aDimension?.horizontal.from || 0) - (bDimension?.horizontal.from || 0);
        })
    }

    carriersOf(symbol: AnySymbol): RollFeature[] {
        return this.symbolCarriers.get(symbol.id) || [];
    }

    pathOfSymbol(symbol: AnySymbol): Path | undefined {
        return this.symbolPaths.get(symbol.id);
    }

    isCollatable(
        symbolA: AnySymbol,
        symbolB: AnySymbol,
        tolerance: CollationTolerance = {
            toleranceEnd: 5,
            toleranceStart: 5
        },
    ): boolean {
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

        const dimensionA = this.dimensionOf(symbolA);
        const dimensionB = this.dimensionOf(symbolB);

        if (!dimensionA || !dimensionB) return false

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

    /**
     * Assigns a generation (depth) to every node.
     */
    assignGenerations(): Array<Version & { generation: number }> {
        const byId = new Map<string, Version>();
        for (const n of this.edition.versions) byId.set(n.id, n);

        const memo = new Map<string, number>();
        const inStack = new Set<string>();

        const computeGeneration = (id: string): number => {
            if (memo.has(id)) return memo.get(id)!;
            if (inStack.has(id)) {
                throw new Error(
                    `Cycle detected involving node '${id}'. Check parentId links.`
                );
            }

            const node = byId.get(id);
            if (!node) {
                memo.set(id, 0);
                return 0;
            }

            inStack.add(id);

            let gen: number;
            const basedOn = node.basedOn?.assigned;

            if (basedOn === undefined) {
                gen = 0; // root
            } else if (!byId.has(basedOn)) {
                // Orphaned parent reference — treat boundary as root
                gen = 0;
            } else {
                gen = 1 + computeGeneration(basedOn);
            }

            inStack.delete(id);
            memo.set(id, gen);
            return gen;
        };

        // Compute for all nodes (order doesn’t matter)
        const withGen = this.edition.versions.map(n => ({
            ...n,
            generation: computeGeneration(n.id),
        }));

        return withGen;
    }

    findSymbol(symbolId: string): AnySymbol | undefined {
        const path = this.symbolPaths.get(symbolId)
        if (!path) return

        const symbol = getAt<AnySymbol>(path, this.edition)
        if (!symbol) return

        return symbol
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
    planEdits(
        currentVersion: Version,
        symbols: AnySymbol[],
        tolerance: CollationTolerance = {
            toleranceEnd: 5,
            toleranceStart: 5
        },
        onAttach: (symbolPath: Path, carrierAssignments: CarrierAssignment[]) => void,
        onAdd: (edits: Edit[]) => void
    ): void {
        const snapshot = this.getSnapshot(currentVersion);
        const treatedSymbols: AnySymbol[] = []

        // can it be collated with any of the symbols of 
        // included in the current snapshot?
        const insertions = [...symbols]
        for (const symbol of symbols) {
            snapshot
                .filter(toCompare => this.isCollatable(symbol, toCompare, tolerance))
                .forEach(corresp => {
                    onAttach(this.pathOfSymbol(corresp)!, symbol.carriers);
                    insertions.splice(insertions.indexOf(symbol), 1);
                    treatedSymbols.push(corresp)
                })
        }
        console.log('insertions=', insertions);

        const edits: Edit[] = insertions.map((symbol): Edit => {
            return {
                insert: [symbol],
                delete: [],
                id: v4(),
            }
        })

        const deletions = snapshot.filter(sym => {
            return !treatedSymbols.includes(sym)
        });

        for (const symbol of deletions) {
            edits.push({
                insert: [],
                delete: [symbol.id],
                id: v4(),
            });
        }

        onAdd(edits)
    }

    planCover(
        copyId: string,
        versionId: string,
        coverDimension: { horizontal: HorizontalSpan, vertical: VerticalSpan },
        material: string | undefined = undefined,
    ) {
        return (draft: Draft<Edition>): void => {
            console.log('planning cover')
            const version = draft.versions.find(v => v.id === versionId)
            const copy = draft.copies.find(c => c.id === copyId)
            console.log('on version', version)
            if (!version || !copy) return

            // find perforations in the snapshot that 
            // overlap with the cover
            const overlappingSymbols =
                this.getSnapshot(version)
                    .filter(symbol => {
                        const dimension = this.dimensionOf(symbol)
                        if (!dimension) return false

                        return (
                            (symbol.type === 'note' || symbol.type === 'expression') &&
                            overlaps(dimension, coverDimension)
                        )
                    })


            console.log('out of', this.getSnapshot(version), 'overlapping symbols:', overlappingSymbols)

            if (!overlappingSymbols.length) return undefined

            const deepClone = JSON.parse(JSON.stringify(overlappingSymbols)) as AnySymbol[]
            console.log('deepl clone')

            for (const symbol of deepClone) {
                //symbol.id = v4();
                console.log('dealing with,', symbol)

                const dimension = structuredClone(this.dimensionOf(symbol))
                console.log('dimension', dimension)
                if (!dimension) continue

                console.log('comparing', dimension.horizontal.from, 'and', coverDimension.horizontal.from)
                console.log('comparing', dimension.horizontal.to, 'and', coverDimension.horizontal.to)

                // check if the cover partially covers the beginning
                if (dimension.horizontal.from >= coverDimension.horizontal.from &&
                    dimension.horizontal.from <= coverDimension.horizontal.to) {
                    console.log("the note starts where the cover ends")
                    dimension.horizontal.from = coverDimension.horizontal.to
                }

                // check if the cover partially covers the ending
                if (dimension.horizontal.to >= coverDimension.horizontal.from &&
                    dimension.horizontal.to <= coverDimension.horizontal.to) {
                    console.log("the note ends where the cover starts")
                    dimension.horizontal.to = coverDimension.horizontal.from
                }

                const newFeature: RollFeature = {
                    ...dimension,
                    id: v4(),
                }
                console.log('pushing to', copy, 'new feature', newFeature)
                copy.features.push(newFeature)
                symbol.id = `symbol-${v4().slice(0,8)}`
                symbol.carriers = [assign('carrierAssignment', newFeature.id)]
            }

            const coverId = `cover-${v4().slice(0, 8)}`
            copy.features.push({
                ...coverDimension,
                id: coverId,
            })

            console.log('pushing to copy', copy.id, 'cover')

            const edit: Edit = {
                id: v4(),
                delete: overlappingSymbols.map(s => s.id),
                insert: deepClone,
                intentionOf: [{
                    type: 'cover',
                    id: v4(),
                    note: material,
                    carriers: [assign('carrierAssignment', coverId)],
                }]
            }

            draft.versions.push({
                edits: [edit],
                id: v4(),
                basedOn: assign('derivation', version.id),
                siglum: version.siglum + ' rev',
                type: 'authorised-revision',
                motivations: [{
                    assigned: 'Stanzfehler korrigiert',
                    type: 'motivationAssignment',
                    id: v4()
                }],
            })

            console.log('starting new version', draft.versions[draft.versions.length - 1])
        }
    }

    planRemoveFeatures(featureIDs: string[]) {
        return (draft: Draft<Edition>) => {
            for (const featureID of featureIDs) {
                const info = this.featureInfos.get(featureID)
                if (!info) return

                const copy = draft.copies.find(c => c.id === info.copyId)
                if (!copy) return

                copy.features.splice(copy.features.findIndex(f => f.id === featureID), 1);

                const symbolId = this.featureInfos.get(featureID)?.symbolId
                if (!symbolId) continue

                const symbolPath = this.symbolPaths.get(symbolId)
                if (!symbolPath) continue

                // remove the last segment
                symbolPath.splice(-1, 1)
                const insert = getAt(symbolPath, draft) as AnySymbol[] | undefined
                if (!insert) continue

                insert.splice(insert.findIndex(s => s.id === symbolId), 1)

                // remove one more segment
                symbolPath.splice(-1, 1)
                const edit = getAt(symbolPath, draft) as Edit
                if (edit.insert?.length === 0 && edit.delete?.length === 0) {
                    // remove the edit completly 
                    symbolPath.splice(-1, 1)
                    const edits = getAt(symbolPath, draft) as Edit[] | undefined
                    if (!edits) continue

                    const index = edits.findIndex(e => e.id === edit.id)
                    if (index !== -1) edits.splice(index, 1)
                }
            }
        }
    }

    guessMotivation(edit: Edit): EditMotivation {
        const inserts = (edit.insert || [])
        const deletes = (edit.delete || [])
            .map(id => {
                const path = this.symbolPaths.get(id)
                if (!path) return undefined
                return getAt(path, this.edition) as AnySymbol | undefined
            })
            .filter((s) => !!s)

        const types = [
            inserts.filter(e => e.type === 'expression').map(e => e.expressionType),
            deletes.filter(e => e.type === 'expression').map(e => e.expressionType)
        ]

        if (arraysIdentical<ExpressionType[]>(
            types, [['SlowCrescendoOn', 'SlowCrescendoOff'], []]
        )) {
            return 'additional-accent'
        }
        else if (arraysIdentical<ExpressionType[]>(
            types, [['ForzandoOn', 'ForzandoOff'], []]
        )) {
            // TODO: check if the inserts are very close
            // and return 'short-dynamic-differentation'
            return 'additional-accent'
        }
        else if (types.every(t => t.length > 1) && arraysIdentical<ExpressionType>(
            types[0],
            types[1]
        )) {
            return 'shift'
        }
        else if (types[0].length === 0 && types[1].length === 1) {
            return 'remove-redundancy'
        }

        if (inserts.length === 1 && deletes.length === 1) {
            const insertDim = this.dimensionOf(inserts[0])?.horizontal
            const deleteDim = this.dimensionOf(deletes[0])?.horizontal

            if (!insertDim || !deleteDim) {
                return 'correct-error'
            }

            if (Math.abs(insertDim.from - deleteDim.from) < 5) {
                const insertLength = Math.abs(insertDim.to - insertDim.from)
                const deleteLength = Math.abs(deleteDim.to - deleteDim.from)
                if (insertLength < deleteLength) {
                    return 'shorten'
                }
                else {
                    return 'prolong'
                }
            }
        }

        return 'correct-error'
    }

    planMerge = (selection: Edit[]): Edit => {
        const result = structuredClone(selection[0])

        selection
            .slice(1)
            .forEach(edit => {
                if (result.insert) {
                    result.insert.push(...(edit.insert || []))
                }
                else {
                    result.insert = edit.insert
                }

                if (result.delete) {
                    result.delete.push(...(edit.delete || []))
                }
                else {
                    result.delete = edit.delete
                }
            })

        return {
            ...result,
            id: v4(),
            motivation: assign('motivationAssignment', this.guessMotivation(result)),
        }
    }

    planSplit = (edit: Edit): Edit[] => {
        const result: Edit[] = []

        for (const insert of edit.insert ?? []) {
            result.push({
                id: v4(),
                insert: [insert]
            })
        }

        for (const remove of edit.delete ?? []) {
            result.push({
                id: v4(),
                delete: [remove]
            })
        }

        return result
    }

    simplifySymbol(symbol: Note | Expression): NegotiatedEvent | null {
        const dim = this.dimensionOf(symbol)
        if (!symbol.carriers.length || !dim) return null

        return {
            ...symbol,
            ...dim
        }
    }
}

type LazyDimension = Partial<{ from: number, to: number }>;

type LazyArea = {
    horizontal: LazyDimension;
    vertical: LazyDimension;
}

const overlaps = (a: LazyArea, b: LazyArea): boolean => {
    const overlapsDimension = (a: LazyDimension, b: LazyDimension): boolean =>
        (a.from ?? 0) < (b.to ?? Infinity) && (b.from ?? 0) < (a.to ?? Infinity);

    console.log('do the dimensions overlap?', a, b)

    return overlapsDimension(a.horizontal, b.horizontal);
}

const arraysIdentical = <T,>(a: T[], b: T[]) => {
    let i = a.length;
    if (i != b.length) return false;
    while (i--) {
        if (Array.isArray(a[i]) && Array.isArray(b[i])) {
            return arraysIdentical(a[i] as any[], b[i] as any[]);
        }
        if (a[i] !== b[i]) return false;
    }
    return true;
};

