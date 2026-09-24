/** Rewritings that return the very object they were given wherever they change nothing, so that an immer draft is left untouched there. */


/** The items that do not match, or the very same array when none does, so that a draft stays untouched. */
export const without = <T,>(items: T[], matches: (item: T) => boolean): T[] =>
    items.some(matches) ? items.filter(item => !matches(item)) : items

/** The items each changed, or the very same array when the change left every one as it was. */
export const mapped = <T,>(items: T[], change: (item: T) => T): T[] => {
    const changed = items.map(change)
    return changed.every((item, i) => item === items[i]) ? items : changed
}

/** The items each changed, less those the change emptied; the very same array where it changed none. */
export const pruned = <T,>(items: T[], change: (item: T) => T, emptied: (item: T) => boolean): T[] => {
    const changed = mapped(items, change)
    return changed === items ? items : changed.filter((item, i) => item === items[i] || !emptied(item))
}

/** The record with the field replaced, or the very same record where that is what stood there. */
export const replacing = <T extends object, K extends keyof T>(record: T, key: K, value: T[K]): T =>
    record[key] === value ? record : { ...record, [key]: value }

/** A record of the edition, as the walk over it sees one. */
export type Node = Record<string, unknown>

export const isRecord = (value: unknown): value is Node =>
    typeof value === 'object' && value !== null

/** The record's values each changed, or the very same record where the change left every one as it was. */
const withValues = (record: Node, change: (value: unknown) => unknown): Node => {
    const entries = Object.entries(record)
    const changed = entries.map(([key, value]): [string, unknown] => [key, change(value)])
    return changed.every(([, value], i) => value === entries[i][1]) ? record : Object.fromEntries(changed)
}

/** The value with the change applied to every record within it and then to itself, innermost first. */
export const deeply = (change: (record: object) => object) => {
    const changed = (value: unknown): unknown =>
        Array.isArray(value) ? mapped(value as unknown[], changed)
            : isRecord(value) ? change(withValues(value, changed))
                : value
    return changed
}

/** Whether the two stand alike, so that what differs within them can be written where it lies. */
const alike = (before: unknown, after: unknown): boolean => {
    if (!isRecord(before) || !isRecord(after)) return false
    if (Array.isArray(before)) return Array.isArray(after) && before.length === after.length
    return !Array.isArray(after)
}

/** Writes onto the draft what the rewriting changed, as deep as the change reaches. */
export const writeInto = (draft: Node, before: Node, after: Node) =>
    Object.entries(after).forEach(([key, value]) => {
        if (value === before[key]) return
        if (alike(before[key], value)) writeInto(draft[key] as Node, before[key] as Node, value as Node)
        else draft[key] = value
    })
