import { Edition } from "./Edition";
import { HorizontalSpan, VerticalSpan, AnyFeature } from "./Feature";
import { AnySymbol, Expression, Note } from "./Symbol";
import { deletedBy, insertedBy, Version } from "./Version";
import { NegotiatedEvent } from "./ReproducingSystem";
import { idOf, idsOf } from "./Assumption";
import { mean, Millimeters } from "./Quantity";

export type Path = (string | number)[];

export const getAt = <T,>(path: Path, obj: unknown): T | undefined => {
    let node: any = obj
    for (const key of path) {
        if (node == null) return undefined;
        node = node[key as any];
    }
    return node as T;
}

/** Keys under which an object names others by id, singly or in a list. */
const referenceKeys = ['delete', 'comprehends', 'motivation'] as const;

const isObject = (v: unknown): v is object => v !== null && typeof v === "object";

/** An object that names another by its id and says nothing else, save perhaps a belief about the reference. */
const isReferenceOnly = (keys: readonly string[]): boolean =>
    keys.every(key => key === 'id' || key === '@annotation');

/**
 * A path as the walk over the edition grows it, one link per step and
 * shared with the steps above, so that a step costs no copy. It is laid
 * out as a `Path` only when one is asked for.
 */
type Trail = { readonly key: string | number, readonly up: Trail } | null

const pathOf = (trail: Trail): Path => {
    const path: Path = []
    for (let link = trail; link !== null; link = link.up) path.push(link.key)
    return path.reverse()
}

export class EditionView {
    readonly edition: Edition

    /**
     * Map from id to object
     */
    private readonly byId: Map<string, any> = new Map()

    /**
     * Map from id to its path within the edition
     */
    private readonly paths: Map<string, Trail> = new Map()

    /**
     * Map from id to paths where it is referenced
     */
    private readonly links: Map<string, Trail[]> = new Map()

    constructor(edition: Edition) {
        this.edition = edition;
        this.indexObjects();
    }

    atPath<T>(path: Path): T | null {
        const node = getAt<T>(path, this.edition);
        return node || null;
    }

    indexObjects() {
        const visited = new WeakSet<object>();

        const link = (id: string, trail: Trail) => {
            const trails = this.links.get(id);
            if (trails) trails.push(trail);
            else this.links.set(id, [trail]);
        };

        const index = (record: Record<string, unknown>, keys: readonly string[], trail: Trail) => {
            if (typeof record.id !== "string") return;
            if (isReferenceOnly(keys)) link(record.id, { key: 'id', up: trail });
            else if (!this.byId.has(record.id)) {
                this.byId.set(record.id, record);
                this.paths.set(record.id, trail);
            }
        };

        const linkReferences = (record: Record<string, unknown>, trail: Trail) =>
            referenceKeys.forEach(key => {
                const ref = record[key];
                if (typeof ref === "string") link(ref, { key, up: trail });
                else if (Array.isArray(ref)) ref.forEach((r, i) => {
                    if (typeof r === "string") link(r, { key: i, up: { key, up: trail } });
                });
            });

        const traverse = (node: unknown, trail: Trail) => {
            if (!isObject(node) || visited.has(node)) return;
            visited.add(node);

            if (Array.isArray(node)) {
                node.forEach((item, i) => traverse(item, { key: i, up: trail }));
                return;
            }

            const record = node as Record<string, unknown>;
            const keys = Object.keys(record);
            index(record, keys, trail);
            linkReferences(record, trail);
            keys.forEach(key => traverse(record[key], { key, up: trail }));
        };

        traverse(this.edition, null);
    }

    get<T,>(anyId: string): T | undefined {
        return this.byId.get(anyId) as T;
    }

    getAll<T,>(anyIds: readonly string[]): T[] {
        return anyIds.map(id => this.get<T>(id)).filter((v): v is T => !!v);
    }

    getPath(anyId: string): Path | undefined {
        const trail = this.paths.get(anyId);
        return trail === undefined ? undefined : pathOf(trail);
    }

    linksTo(anyId: string): Path[] {
        return (this.links.get(anyId) ?? []).map(pathOf);
    }

    travelUp(versionId: string, callback: (version: Readonly<Version>) => void) {
        const v = this.get<Version>(versionId)
        if (!v) return

        callback(v);
        if (v.basedOn) {
            this.travelUp(idOf(v.basedOn), callback);
        }
    }

    /** The version and its ancestors, from the version up to the root. */
    private lineageOf(versionId: string): Readonly<Version>[] {
        const lineage: Readonly<Version>[] = []
        this.travelUp(versionId, version => lineage.push(version))
        return lineage
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
        const carriers = this.getAll<AnyFeature>(idsOf(symbol.carriers))
        if (carriers.length === 0) {
            return
        }

        const farEnds = carriers.flatMap(carrier => carrier.vertical.to === undefined ? [] : [carrier.vertical.to])

        return {
            horizontal: {
                unit: 'mm',
                from: mean(carriers.map(carrier => carrier.horizontal.from)),
                to: mean(carriers.map(carrier => carrier.horizontal.to))
            },
            vertical: {
                unit: 'track',
                from: mean(carriers.map(carrier => carrier.vertical.from)),
                ...(farEnds.length > 0 && { to: mean(farEnds) })
            }
        };
    }

    /** Where the symbol begins, as the mean onset of its carriers, or nothing for a symbol without a place. */
    onsetOf(symbol: AnySymbol): Millimeters | undefined {
        const carriers = this.carriersOf(symbol)
        return carriers.length > 0 ? mean(carriers.map(carrier => carrier.horizontal.from)) : undefined
    }

    /** The symbols by onset, those without a place first; symbols at one place keep their order. */
    private inOrderOfPlace(symbols: readonly Readonly<AnySymbol>[]): Readonly<AnySymbol>[] {
        return symbols
            .map(symbol => ({ symbol, at: this.onsetOf(symbol) || 0 }))
            .sort((a, b) => a.at - b.at)
            .map(({ symbol }) => symbol)
    }

    /**
     * The symbols the version shows: what it and its ancestors insert,
     * each version's deletions striking what it or its ancestors inserted.
     */
    snapshot(versionId: string): readonly Readonly<AnySymbol>[] {
        const deleted = new Set<string>()
        const symbols = this.lineageOf(versionId).flatMap(version => {
            deletedBy(version).forEach(id => deleted.add(id))
            return insertedBy(version).filter(symbol => !deleted.has(symbol.id))
        })
        return this.inOrderOfPlace(symbols)
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
