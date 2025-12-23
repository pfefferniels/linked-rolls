import { CollationTolerance } from "./Collation";
import { Edition } from "./Edition";
import { HorizontalSpan, VerticalSpan, AnyFeature } from "./Feature";
import { AnySymbol, Expression, Note } from "./Symbol";
import { Version } from "./Version";
import { NegotiatedEvent } from "./Emulation";
import { idOf, idsOf } from "./Assumption";

export type Path = (string | number)[];

export const getAt = <T,>(path: Path, obj: unknown): T | undefined => {
    let node: any = obj
    for (const key of path) {
        if (node == null) return undefined;
        node = node[key as any];
    }
    return node as T;
}

const referenceKeys = new Set([
    'delete',
    'comprehends',
    'motivation'
]);

export class EditionView {
    readonly edition: Edition

    /**
     * Map from id to object
     */
    private readonly byId: Map<string, any> = new Map()

    /**
     * Map from id to its path within the edition
     */
    private readonly paths: Map<string, Path> = new Map()

    /**
     * Map from id to paths where it is referenced
     */
    private readonly links: Map<string, Set<Path>> = new Map()

    /**
     * Dimensions cache: one frequent operation is to find the average
     * dimensions of a symbol based on its carriers. This cache stores
     * the computed dimensions for reuse.
     */
    //private readonly dimensionsCache: Map<string, { horizontal: HorizontalSpan, vertical: VerticalSpan }> = new Map()


    constructor(edition: Edition) {
        this.edition = edition;
        this.indexObjects();
        //this.buildDimensionsCache()
    }

    // private buildDimensionsCache() {
    //     for (const version of this.edition.versions) {
    //         for (const symbol of version.edits.flatMap(edit => edit.insert || [])) {
    //             const dim = this.dimensionOf(symbol)
    //             if (dim) {
    //                 this.dimensionsCache.set(symbol.id, dim)
    //             }
    //         }
    //     }
    // }

    atPath<T>(path: Path): T | null {
        const node = getAt<T>(path, this.edition);
        return node || null;
    }

    indexObjects() {
        const visited = new WeakSet<object>();

        const isObject = (v: unknown): v is object => v !== null && typeof v === "object";

        const traverse = (node: unknown, path: Path) => {
            if (!isObject(node)) return;
            if (visited.has(node)) return;
            visited.add(node);

            const anyNode = node as any;
            if (typeof anyNode.id === "string") {
                if (Object.keys(anyNode).filter(k => k !== '@annotation').length === 1) {
                    // this is a reference-only object, store link
                    if (!this.links.has(anyNode.id)) {
                        this.links.set(anyNode.id, new Set());
                    }
                    this.links.get(anyNode.id)!.add([...path, 'id']);
                }
                else {
                    if (!this.byId.has(anyNode.id)) {
                        this.byId.set(anyNode.id, node);
                        this.paths.set(anyNode.id, [...path]);
                    }
                }
            }

            Object
                .keys(anyNode)
                .filter(k => referenceKeys.has(k))
                .forEach(key => {
                    const ref = anyNode[key];
                    if (typeof ref === "string") {
                        if (!this.links.has(ref)) {
                            this.links.set(ref, new Set());
                        }
                        this.links.get(ref)!.add([...path, key]);
                    } else if (Array.isArray(ref)) {
                        for (const r of ref) {
                            if (typeof r === "string") {
                                if (!this.links.has(anyNode.id)) {
                                    this.links.set(anyNode.id, new Set());
                                }
                                this.links.get(anyNode.id)!.add([...path, key]);
                            }
                        }
                    }
                })

            if (Array.isArray(node)) {
                for (let i = 0; i < node.length; i++) {
                    traverse(node[i], [...path, i]);
                }
            } else {
                for (const key of Object.keys(node)) {
                    traverse(anyNode[key], [...path, key]);
                }
            }
        };

        traverse(this.edition, []);
    }

    get<T,>(anyId: string): T | undefined {
        return this.byId.get(anyId) as T;
    }

    getAll<T,>(anyIds: readonly string[]): T[] {
        return anyIds.map(id => this.get<T>(id)).filter((v): v is T => !!v);
    }

    getPath(anyId: string): Path | undefined {
        return this.paths.get(anyId);
    }

    linksTo(anyId: string): Path[] {
        return Array.from(this.links.get(anyId) || []);
    }

    travelUp(versionId: string, callback: (version: Readonly<Version>) => void) {
        const v = this.get<Version>(versionId)
        if (!v) return

        callback(v);
        if (v.basedOn) {
            this.travelUp(idOf(v.basedOn), callback);
        }
    }

    carriersOf(symbol: AnySymbol): Readonly<AnyFeature>[] {
        return this.getAll<AnyFeature>(idsOf(symbol.carriers));
    }

    predecessorOf(versionId: string): Readonly<Version> | undefined {
        const v = this.get<Version>(versionId)
        if (!v?.basedOn) return
        return this.get<Version>(idOf(v.basedOn))
    }

    dimensionOf(symbol: AnySymbol): Readonly<{ horizontal: HorizontalSpan, vertical: VerticalSpan }> | undefined {
        // if (this.dimensionsCache.has(symbol.id)) {
        //     return this.dimensionsCache.get(symbol.id);
        // }

        const carriers = this.getAll<AnyFeature>(idsOf(symbol.carriers))
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

    snapshot(versionId: string): readonly Readonly<AnySymbol>[] {
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

            const node = this.get<Version>(id);
            if (!node) {
                memo.set(id, 0);
                return 0;
            }

            inStack.add(id);

            let gen: number;
            const basedOn = node.basedOn && idOf(node.basedOn);

            if (basedOn === undefined) {
                gen = 0; // root
            } else if (!this.get(basedOn)) {
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

    simplifySymbol(symbol: Note | Expression): NegotiatedEvent | null {
        const dim = this.dimensionOf(symbol)
        if (!symbol.carriers.length || !dim) return null

        return {
            ...symbol,
            ...dim
        }
    }
}

