/**
 * Where in an edition each id stands and where it is referenced, as
 * paths an operation can follow into a draft of it.
 */
import { Edition } from "../model/Edition.js";
import { perState } from "./perState.js";

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
const referenceKeys = ['delete', 'comprehends', 'motivation', 'premises', 'used'] as const;

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

const laidOut = (trail: Trail): Path => {
    const path: Path = []
    for (let link = trail; link !== null; link = link.up) path.push(link.key)
    return path.reverse()
}

interface Places {
    /** Where each id stands. */
    readonly paths: ReadonlyMap<string, Trail>
    /** Where each id is referenced. */
    readonly links: ReadonlyMap<string, readonly Trail[]>
}

/** Walks the edition and records where each id stands and where it is referenced. */
const placesIn = perState((edition: Edition): Places => {
    const paths = new Map<string, Trail>()
    const links = new Map<string, Trail[]>()
    const visited = new WeakSet<object>();

    const link = (id: string, trail: Trail) => {
        const trails = links.get(id);
        if (trails) trails.push(trail);
        else links.set(id, [trail]);
    };

    const index = (record: Record<string, unknown>, keys: readonly string[], trail: Trail) => {
        if (typeof record.id !== "string") return;
        if (isReferenceOnly(keys)) link(record.id, { key: 'id', up: trail });
        else if (!paths.has(record.id)) {
            paths.set(record.id, trail);
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

    traverse(edition, null);
    return { paths, links }
})

/** Where the entity with the id stands in the edition, or nothing where it holds none. */
export const pathOf = (edition: Edition, id: string): Path | undefined => {
    const trail = placesIn(edition).paths.get(id);
    return trail === undefined ? undefined : laidOut(trail);
}

/** Where the edition references the id. */
export const linksTo = (edition: Edition, id: string): Path[] =>
    (placesIn(edition).links.get(id) ?? []).map(laidOut);
