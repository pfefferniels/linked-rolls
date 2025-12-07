import { Draft } from "immer";
import { EditionView, getAt } from "./EditionView";
import { Edition } from "./Edition";
import { AnySymbol, ExpressionType } from "./Symbol";
import { CollationTolerance } from "./Collation";
import { Edit, EditMotivation } from "./Edit";
import { v4 } from "uuid";
import { HorizontalSpan, RollFeature, VerticalSpan } from "./Feature";
import { Version } from "./Version";
import { asSymbols, RollCopy } from "./RollCopy";
import { assignObject, assignReference, idOf } from "./Assumption";

export type EditionOp = (d: Draft<Edition>) => void;

export interface Plan {
    build(): EditionOp[];
    setView: (view: EditionView) => void;
}

export const isPlan = (obj: any): obj is Plan => {
    return obj && typeof obj.build === 'function' && typeof obj.setView === 'function'
}

export abstract class BasePlan implements Plan {
    protected view: EditionView | null = null;
    setView: (view: EditionView) => void = (view) => {
        this.view = view;
    }
    abstract build(): EditionOp[];
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
export class ConnectVersions extends BasePlan {
    constructor(
        private childId: string,
        private parentId: string,
        private tolerance: CollationTolerance = {
            toleranceEnd: 5,
            toleranceStart: 5
        }
    ) {
        super();
    }

    build(): EditionOp[] {
        if (!this.view) return []
        const view = this.view;
        const result: EditionOp[] = []

        const parentSnapshot = view.snapshot(this.parentId);
        const childSnapshot = view.snapshot(this.childId);
        const treatedSymbols: AnySymbol[] = []

        // can the symbol be collated with any of the
        // symbols of the tradition, i.e. the ones 
        // included in the current snapshot?
        const insertions = [...childSnapshot]
        for (const symbol of childSnapshot) {
            parentSnapshot
                .filter(toCompare => view.isCollatable(symbol, toCompare, this.tolerance))
                .forEach(parentSymbol => {
                    result.push(draft => {
                        const symbolPath = view.getPath(parentSymbol.id)
                        if (!symbolPath) return

                        const correspSymbol = getAt<AnySymbol>(symbolPath, draft)
                        if (!correspSymbol) return

                        correspSymbol.carriers.push(...symbol.carriers)
                    })

                    insertions.splice(insertions.indexOf(symbol), 1);
                    treatedSymbols.push(parentSymbol)
                })
        }

        const edits: Edit[] = insertions.map((symbol): Edit => {
            return {
                type: 'edit',
                id: v4(),
                insert: [symbol],
                delete: [],
            }
        })

        const deletions = parentSnapshot.filter(sym => {
            return !treatedSymbols.includes(sym)
        });

        for (const symbol of deletions) {
            edits.push({
                type: 'edit',
                id: v4(),
                insert: [],
                delete: [symbol.id],
            });
        }

        result.push(draft => {
            const v = draft.versions.find(v => v.id === this.childId)
            if (!v) return
            v.edits = edits
            v.basedOn = assignReference(this.parentId)
        })

        return result
    }
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
export class CreateVersion extends BasePlan {
    constructor(
        private siglum: string,
        private copy: RollCopy,
    ) {
        super();
    }

    build(): EditionOp[] {
        const view = this.view
        if (!view) return []
        const result: EditionOp[] = []

        result.push(draft => {
            draft.copies.push(this.copy)

            const newVersion: Version = {
                siglum: this.siglum,
                id: v4(),
                edits: asSymbols(this.copy.features).map((symbol): Edit => {
                    return {
                        type: 'edit',
                        id: v4(),
                        insert: [symbol],
                        delete: [],
                    }
                }),
                type: 'edition',
                motivations: []
            }
            draft.versions.push(newVersion)
        })

        return result
    }
}


/**
 * Creates a new version based on the given version
 * calculating the effect of a cover on existing symbols.
 */
export class CoverPerforation extends BasePlan {
    constructor(
        private copyId: string,
        private versionId: string,
        private coverDimension: { horizontal: HorizontalSpan, vertical: VerticalSpan },
        private material: string | undefined = undefined,
    ) {
        super()
    }

    build(): EditionOp[] {
        const view = this.view
        if (!view) return []

        return [
            (draft: Draft<Edition>): void => {
                const version = draft.versions.find(v => v.id === this.versionId)
                const copy = draft.copies.find(c => c.id === this.copyId)
                if (!version || !copy) return

                // find perforations in the snapshot that 
                // overlap with the cover
                const overlappingSymbols =
                    view.snapshot(this.versionId)
                        .filter(symbol => {
                            const dimension = view.dimensionOf(symbol)
                            if (!dimension) return false

                            return (
                                (symbol.type === 'note' || symbol.type === 'expression') &&
                                overlaps(dimension, this.coverDimension)
                            )
                        })

                if (!overlappingSymbols.length) return undefined

                const deepClone = JSON.parse(JSON.stringify(overlappingSymbols)) as AnySymbol[]

                for (const symbol of deepClone) {
                    //symbol.id = v4();
                    const dimension = structuredClone(view.dimensionOf(symbol))
                    if (!dimension) continue

                    // check if the cover partially covers the beginning
                    if (dimension.horizontal.from >= this.coverDimension.horizontal.from &&
                        dimension.horizontal.from <= this.coverDimension.horizontal.to
                    ) {
                        dimension.horizontal.from = this.coverDimension.horizontal.to
                    }

                    // check if the cover partially covers the ending
                    if (dimension.horizontal.to >= this.coverDimension.horizontal.from &&
                        dimension.horizontal.to <= this.coverDimension.horizontal.to
                    ) {
                        dimension.horizontal.to = this.coverDimension.horizontal.from
                    }

                    const newFeature: RollFeature = {
                        ...dimension,
                        id: v4(),
                    }

                    copy.features.push(newFeature)
                    symbol.id = `symbol-${v4().slice(0, 8)}`
                    symbol.carriers = [assignReference(newFeature.id)]
                }

                const coverId = `cover-${v4().slice(0, 8)}`
                copy.features.push({
                    ...this.coverDimension,
                    id: coverId,
                })

                const edit: Edit = {
                    type: 'edit',
                    id: v4(),
                    delete: overlappingSymbols.map(s => s.id),
                    insert: deepClone,
                    intentionOf: [{
                        type: 'cover',
                        id: v4(),
                        note: this.material,
                        carriers: [assignReference(coverId)],
                    }]
                }

                draft.versions.push({
                    edits: [edit],
                    id: v4(),
                    basedOn: assignReference(version.id),
                    siglum: version.siglum + ' rev',
                    type: 'authorised-revision',
                    motivations: [
                        assignObject({ type: 'motivation', note: 'Stanzfehler korrigiert' }),
                    ],
                })
            }]
    }
}

export class RemoveFeature extends BasePlan {
    constructor(
        private copyID: string,
        private featureIDs: string[]
    ) {
        super()
    }

    build(): EditionOp[] {
        const view = this.view
        if (!view) return []

        return [
            (draft: Draft<Edition>) => {
                const copy = draft.copies.find(c => c.id === this.copyID)
                if (!copy) return

                copy.features = copy.features.filter(f => !this.featureIDs.includes(f.id))

                this.featureIDs.forEach(featureId => {
                    // expect a path of format:
                    // ['versions', index, 'edits', index, 'insert', index, 'carriers', index, 'id']
                    const carrierPath = view.linksTo(featureId).at(0)
                    if (!carrierPath) return

                    // expect to find the parent symbol at:
                    // ['versions', index, 'edits', index, 'insert', index]
                    const symbol = getAt<AnySymbol>(carrierPath.slice(0, 6), draft)
                    if (!symbol) return

                    symbol.carriers = symbol.carriers.filter(c => idOf(c) !== featureId)

                    // if the symbol has no more carriers, remove it
                    if (symbol.carriers.length === 0) {
                        // expect to find the parent edit at:
                        // ['versions', index, 'edits', index]
                        const inserts = getAt<AnySymbol[]>(carrierPath.slice(0, 5), draft)
                        if (!inserts) return

                        inserts.splice(inserts.findIndex(s => s.id === symbol.id), 1)
                        if (inserts.length === 0) {
                            const edit = getAt<Edit>(carrierPath.slice(0, 4), draft)
                            if (!edit) return

                            if (!edit.insert?.length && !edit.delete?.length) {
                                const edits = getAt<Edit[]>(carrierPath.slice(0, 3), draft)
                                if (!edits) return

                                edits.splice(edits.findIndex(e => e.id === edit.id), 1)
                            }
                        }
                    }
                })
            }
        ]
    }
}

export class MergeEdits extends BasePlan {
    constructor(
        private versionId: string,
        private toMerge: Edit[]
    ) {
        super()
    }

    private guessMotivation(edit: Edit): EditMotivation {
        const view = this.view
        if (!view) return 'correct-error'

        const inserts = (edit.insert || [])
        const deletes = view.getAll<AnySymbol>(edit.delete ?? [])

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
            const insertDim = view.dimensionOf(inserts[0])?.horizontal
            const deleteDim = view.dimensionOf(deletes[0])?.horizontal

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

    build(): EditionOp[] {
        const view = this.view
        if (!view) return []

        const result = structuredClone(this.toMerge[0])

        this.toMerge
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

        const edit: Edit = {
            ...result,
            id: v4(),
            motivation: this.guessMotivation(result),
        }

        return ([draft => {
            const version = draft.versions.find(v => v.id === this.versionId)
            if (!version) return

            // remove all edits that were merged
            for (const e of this.toMerge) {
                const index = version.edits.findIndex(ve => ve.id === e.id)
                if (index !== -1) version.edits.splice(index, 1)
            }

            version.edits.push(edit)
        }])
    }
}

export class SplitEdit extends BasePlan {
    constructor(
        private versionId: string,
        private toSplit: Edit
    ) {
        super()
    }

    build(): EditionOp[] {
        const view = this.view
        if (!view) return []

        const result: Edit[] = []

        for (const insert of this.toSplit.insert ?? []) {
            result.push({
                type: 'edit',
                id: v4(),
                insert: [insert]
            })
        }

        for (const remove of this.toSplit.delete ?? []) {
            result.push({
                type: 'edit',
                id: v4(),
                delete: [remove]
            })
        }

        return ([draft => {
            const version = draft.versions.find(v => v.id === this.versionId)
            if (!version) return

            // remove the edit that is split
            const index = version.edits.findIndex(ve => ve.id === this.toSplit.id)
            if (index !== -1) version.edits.splice(index, 1)

            version.edits.push(...result)
        }])
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

    // console.log('do the dimensions overlap?', a, b)

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

