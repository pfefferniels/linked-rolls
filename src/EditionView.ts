import { CollationTolerance } from "./Collation";
import { Edition } from "./Edition";
import { flat } from "./EditorialAssumption";
import { RollFeature, HorizontalSpan, VerticalSpan } from "./Feature";
import { AnySymbol, Expression, Note } from "./Symbol";
import { Version } from "./Version";
import { NegotiatedEvent } from "./Emulation";

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

    readonly versionsById: Map<string, Version> = new Map()

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

        this.indexVersions()
        this.indexSymbolPaths()
        this.indexSymbolCarriers()
        this.indexFeatures()
    }

    private indexVersions() {
        this.edition.versions.forEach(version => {
            this.versionsById.set(version.id, version);
        })
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

    simplifySymbol(symbol: Note | Expression): NegotiatedEvent | null {
        const dim = this.dimensionOf(symbol)
        if (!symbol.carriers.length || !dim) return null

        return {
            ...symbol,
            ...dim
        }
    }
    
    travelUp(versionId: string, callback: (version: Readonly<Version>) => void) {
        const v = this.versionsById.get(versionId)
        if (!v) return

        callback(v);
        if (v.basedOn) {
            this.travelUp(flat(v.basedOn), callback);
        }
    }

    predecessorOf(versionId: string): Readonly<Version> | undefined {
        const v = this.versionsById.get(versionId)
        if (!v?.basedOn) return
        return this.versionsById.get(flat(v.basedOn))
    }

    dimensionOf(symbol: AnySymbol): Readonly<{ horizontal: HorizontalSpan, vertical: VerticalSpan }> | undefined {
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

    getSnapshot(versionId: string): readonly Readonly<AnySymbol>[] {
        const snapshot: AnySymbol[] = [];
        const toDelete: string[] = [];

        this.travelUp(versionId, s => {
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

    carriersOf(symbol: AnySymbol): readonly Readonly<RollFeature>[] {
        return this.symbolCarriers.get(symbol.id) || [];
    }

    pathOfSymbol(symbolId: string): Path | undefined {
        return this.symbolPaths.get(symbolId);
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
    withGenerations(): Array<Version & { generation: number }> {
        const memo = new Map<string, number>();
        const inStack = new Set<string>();

        const computeGeneration = (id: string): number => {
            if (memo.has(id)) return memo.get(id)!;
            if (inStack.has(id)) {
                throw new Error(
                    `Cycle detected involving node '${id}'. Check parentId links.`
                );
            }

            const node = this.versionsById.get(id);
            if (!node) {
                memo.set(id, 0);
                return 0;
            }

            inStack.add(id);

            let gen: number;
            const basedOn = node.basedOn?.assigned;

            if (basedOn === undefined) {
                gen = 0; // root
            } else if (!this.versionsById.has(basedOn)) {
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
}

