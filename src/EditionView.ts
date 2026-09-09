import { Edition } from "./Edition";
import { HorizontalSpan, AnyFeature, withBorneFeatures } from "./Feature";
import { AnySymbol, Expression, Note } from "./Symbol";
import { deletedBy, insertedBy, Version } from "./Version";
import { NegotiatedEvent } from "./ReproducingSystem";
import { systemIdOf, TrackerBar } from "./TrackerBar";
import { isPaperStretch, RollCopy } from "./RollCopy";
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

/** What a reference may state besides the id: a belief about it, and the tolerance a derivation was collated at. */
const referenceOwnKeys = new Set(['id', '@annotation', 'collationTolerance']);

/** An object that names another by its id and says nothing of its own beyond that. */
const isReferenceOnly = (keys: readonly string[]): boolean =>
    keys.every(key => referenceOwnKeys.has(key));

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

    /** Built when a copy is first asked for, the walk not recording it. */
    private copiesByFeature?: Map<string, RollCopy>

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

    /** The copy a feature sits on, a patch and everything it bears included. */
    copyOf(featureId: string): Readonly<RollCopy> | undefined {
        if (!this.copiesByFeature) {
            this.copiesByFeature = new Map(this.edition.copies.flatMap(copy =>
                copy.features
                    .flatMap(withBorneFeatures)
                    .map(feature => [feature.id, copy] as const)))
        }
        return this.copiesByFeature.get(featureId)
    }

    /**
     * How a place on the edition's shared axis relates to the paper of
     * this version: place × factor = millimetres of its own paper.
     *
     * Copies cut for different systems are scaled onto one axis so that
     * they can be collated at all, which leaves a version of another
     * system carrying places in the axis copy's millimetres. A
     * performance needs the paper the roll actually ran on, and the
     * factor is the inverse of the scale `alignCopy` recorded.
     *
     * It is read only from the copies of the version's own system, since
     * under the shared axis a green version's notes are carried by red
     * copies too and those say nothing about green paper. A copy whose
     * scale is put down to its own paper having stretched is left out as
     * well: that is a fact about the one exemplar, not about the speed
     * the system's rolls were cut at. Where what remains disagrees,
     * `constraintProblems` reports it rather than averaging it away.
     */
    toOwnPaperOf(version: Readonly<Version>): number | undefined {
        const scales = this.speedScalesIn(version)
        return scales.length === 1 ? 1 / scales[0] : undefined
    }

    /** The scales of the version's own copies that are not their own paper stretch. */
    speedScalesIn(version: Readonly<Version>): number[] {
        return [...new Set(this.copiesOwning(version)
            .filter(copy => !copy.conditions.some(isPaperStretch))
            .map(copy => copy.measurements.scale)
            .filter((scale): scale is number => scale !== undefined && scale > 0))]
    }

    /** The copies of the version's own system that carry any of its symbols. */
    copiesOwning(version: Readonly<Version>): Readonly<RollCopy>[] {
        const system = systemIdOf(version.system)
        const carrying = new Set(this.snapshot(version.id)
            .flatMap(symbol => idsOf(symbol.carriers))
            .flatMap(id => {
                const copy = this.copyOf(id)
                return copy ? [copy.id] : []
            }))

        return this.edition.copies.filter(copy =>
            carrying.has(copy.id) && systemIdOf(copy.production?.system) === system)
    }

    predecessorOf(versionId: string): Readonly<Version> | undefined {
        const v = this.get<Version>(versionId)
        if (!v?.basedOn) return
        return this.get<Version>(idOf(v.basedOn))
    }

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
    placeOf(symbol: AnySymbol): Readonly<HorizontalSpan> | undefined {
        const carriers = this.getAll<AnyFeature>(idsOf(symbol.carriers))
        if (carriers.length === 0) return

        return {
            unit: 'mm',
            from: mean(carriers.map(carrier => carrier.horizontal.from)),
            to: mean(carriers.map(carrier => carrier.horizontal.to))
        }
    }

    /** Where the symbol begins, as the mean onset of its carriers, or nothing for a symbol without a place. */
    onsetOf(symbol: AnySymbol): Millimeters | undefined {
        return this.placeOf(symbol)?.from
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

    /**
     * The symbol as a performance needs it: where it lies, and the
     * position the performing bar reads it on.
     *
     * Nothing where that bar reads nothing of it, which is the case a
     * transfer between systems leaves behind: a red `ForzandoOn` a
     * green version still inherits cannot be performed on a green
     * machine, and an edit has yet to say what took its place.
     */
    simplifySymbol(symbol: Note | Expression, bar: TrackerBar): NegotiatedEvent | null {
        const horizontal = this.placeOf(symbol)
        const position = bar.positionOf(symbol)
        if (!horizontal || position === undefined) return null

        return {
            ...symbol,
            horizontal,
            vertical: { unit: 'track', from: position }
        }
    }
}
