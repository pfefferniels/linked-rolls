/**
 * Every stemma a handful of copies can stand in: rooted trees whose
 * nodes are versions, a copy carrying any of them, a lost one above
 * any two or more.
 */

/**
 * A node of a stemma: the copy carrying it at first hand, by its number,
 * or none for a lost state, and the nodes derived from it.
 */
export interface StemmaNode {
    readonly copy?: number
    readonly children: readonly StemmaNode[]
}

const leaf = (copy: number): StemmaNode => ({ copy, children: [] })

/** Every way to add the copy to the tree: as a further child of a lost node, or on an edge, above any subtree. */
function* insertions(tree: StemmaNode, copy: number): Generator<StemmaNode> {
    yield { children: [tree, leaf(copy)] }
    if (tree.children.length === 0) return
    yield { ...tree, children: [...tree.children, leaf(copy)] }
    for (let i = 0; i < tree.children.length; i++) {
        for (const child of insertions(tree.children[i], copy)) {
            yield { ...tree, children: [...tree.children.slice(0, i), child, ...tree.children.slice(i + 1)] }
        }
    }
}

/** The trees whose leaves are the copies 0 to n − 1 and whose inner nodes are all lost, each once. */
const leafTrees = (n: number): StemmaNode[] => {
    if (n === 1) return [leaf(0)]
    let trees: StemmaNode[] = [{ children: [leaf(0), leaf(1)] }]
    for (let copy = 2; copy < n; copy++) {
        trees = trees.flatMap(tree => [...insertions(tree, copy)])
    }
    return trees
}

const product = <T,>(lists: readonly (readonly T[])[]): T[][] =>
    lists.reduce<T[][]>((combos, list) => combos.flatMap(combo => list.map(item => [...combo, item])), [[]])

/**
 * The tree with as many of its copies moved up as it allows: at each
 * lost node, at most one copy among its leaf children may come to carry
 * it instead, making that copy's text the ancestor of the others'.
 * Every stemma arises from exactly one leaf tree in exactly one way.
 */
function* promotions(tree: StemmaNode): Generator<StemmaNode> {
    if (tree.children.length === 0) {
        yield tree
        return
    }
    const options = tree.children.map(child => [...promotions(child)])
    const leaves = tree.children.flatMap((child, index) => child.children.length === 0 ? [index] : [])
    for (const combo of product(options)) {
        yield { children: combo }
        for (const index of leaves) {
            yield { copy: tree.children[index].copy, children: combo.filter((_, i) => i !== index) }
        }
    }
}

const cache = new Map<number, StemmaNode[]>()

/**
 * Every stemma of n copies: 3 for two copies, 91,984 for six. They are
 * produced one by one, so that only the leaf trees, far fewer, are held.
 */
export function* stemmataOf(n: number): Generator<StemmaNode> {
    let trees = cache.get(n)
    if (!trees) {
        trees = leafTrees(n)
        cache.set(n, trees)
    }
    if (n === 1) {
        yield trees[0]
        return
    }
    for (const tree of trees) yield* promotions(tree)
}

/** How many stemmata the exhaustive search scores, at most. */
export const MAX_COPIES = 7
