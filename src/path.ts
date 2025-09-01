type AnyArr = readonly unknown[] | unknown[];
type Index = number;
type IsFn<T> = T extends (...a: any[]) => any ? true : false;

// depth counter to prevent runaway recursion
type Prev = [0, 0, 1, 2, 3, 4, 5, 6];

// All valid paths (tuples) inside T up to depth D (default 4)
export type Path<T, D extends number = 4> =
    D extends 0
    ? [] // stop
    : T extends AnyArr
    ? [Index] | [Index, ...Path<T[number], Prev[D]>]
    : T extends object
    ? IsFn<T> extends true
    ? [] // don't recurse into functions
    : {
        [K in keyof T]-?:
        [K] | [K, ...Path<T[K], Prev[D]>]
    }[keyof T]
    : [];

// Value at path P in T
export type PathValue<T, P> =
    P extends []
    ? T
    : P extends [infer K, ...infer R]
    ? K extends Index
    ? T extends AnyArr ? PathValue<T[number], R> : never
    : K extends keyof T ? PathValue<T[K], R> : never
    : never;

/** Path-first read. T is inferred from the path, not the object. */
export function getAt<T, P extends Path<T>>(
    path: P,
    obj: unknown
): PathValue<T, P> | undefined {
    let node: any = obj;
    for (const key of path as readonly (string | number)[]) {
        if (node == null) return undefined;
        node = node[key as any];
    }
    return node as any;
}

export type PathTo<T, Target> =
    Path<T> extends infer P
    ? P extends any
    ? PathValue<T, P> extends Target
    ? P
    : never
    : never
    : never;
