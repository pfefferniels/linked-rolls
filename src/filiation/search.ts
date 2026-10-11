/**
 * The stemma that explains the presence of the readings at the least
 * cost, searched among all of them, and what each node of it holds.
 */
import { Presence } from "./presence.js"
import { leadsTo, systemAbove } from "./systems.js"
import { StemmaNode, stemmataOf } from "./trees.js"

/**
 * What the search counts against a stemma. A reading arising costs
 * `gain`, and a reading the base text holds arose too. A reading lost
 * costs 1, or less where the editorial principles say a loss is weak
 * evidence.
 * @category Filiation
 */
export interface Costs {
    /**
     * A reading arising. Ten times a loss, since an addition at exactly
     * the same place is very unlikely to be made twice (shared addition),
     * while a perforation is easily struck.
     */
    gain: number

    /**
     * A redundant reading lost, for the share of a loss: the removal of
     * redundancies is expected and happens in two branches independently
     * (independent cleanup).
     */
    redundantLoss: number

    /**
     * A reading lost on the way into another system, for the share of a
     * loss: a re-cut was an editorial pass of its own, and what it lacks
     * says little about where it was cut from.
     */
    transferLoss: number

    /**
     * The copy carrying a version lacking one of its readings, since a
     * copy may fail to show what its version holds. Where it is
     * `Infinity`, a copy carries its version exactly.
     */
    copyDeviation: number

    /** A lost state, so that one is posited only where shared additions require it. */
    lostState: number
}

/**
 * The costs the edition of WM 225 is reproduced with: a gain 10, a lost
 * redundancy 0.25, a loss on a transfer 0.25, a deviation of a copy 1
 * and a lost state 4. They were found by searching for values that give
 * that stemma, so they say that it is consistent with such rules, not
 * that the rules confirm it.
 * @category Filiation
 */
export const defaultCosts: Costs = {
    gain: 10,
    redundantLoss: 0.25,
    transferLoss: 0.25,
    copyDeviation: 1,
    lostState: 4
}

const INF = 1e12

/**
 * A stemma laid out for counting: its nodes children first, the root
 * last, each with the copy it carries, its parent, its system, whether
 * it was re-cut from its parent, and the copies at and below it.
 */
export interface LaidOut {
    copy: Int16Array
    parent: Int16Array
    transfer: Uint8Array
    system: string[]
    below: Int32Array
    lost: number
    notation: string
}

const lay = (
    tree: StemmaNode,
    systems: readonly string[],
    names: readonly string[],
    transfers: ReadonlyMap<string, ReadonlySet<string>>
): LaidOut | undefined => {
    const copy: number[] = []
    const parent: number[] = []
    const system: string[] = []
    const below: number[] = []
    let lost = 0

    const visit = (node: StemmaNode): { index: number, systems: Set<string>, notation: string } | undefined => {
        const visited = []
        for (const child of node.children) {
            const done = visit(child)
            if (!done) return undefined
            visited.push(done)
        }
        const under = new Set(visited.flatMap(child => [...child.systems]))
        let own: string | undefined
        if (node.copy !== undefined) {
            own = systems[node.copy]
            // A copy carrying a version above others is of a system that leads to theirs.
            if ([...under].some(other => !leadsTo(transfers, own!, other))) return undefined
        } else {
            own = systemAbove(transfers, under)
            if (own === undefined) return undefined
            lost++
        }
        const index = copy.length
        copy.push(node.copy ?? -1)
        parent.push(-1)
        system.push(own)
        below.push(visited.reduce((mask, child) => mask | below[child.index], node.copy !== undefined ? 1 << node.copy : 0))
        visited.forEach(child => { parent[child.index] = index })
        const label = node.copy !== undefined ? names[node.copy] : '*'
        const notation = visited.length === 0 ? label : `${label}(${visited.map(child => child.notation).sort().join(',')})`
        return { index, systems: new Set([own, ...under]), notation }
    }

    const root = visit(tree)
    if (!root) return undefined
    const transfer = system.map((own, index) => parent[index] >= 0 && system[parent[index]] !== own ? 1 : 0)
    return {
        copy: Int16Array.from(copy),
        parent: Int16Array.from(parent),
        transfer: Uint8Array.from(transfer),
        system,
        below: Int32Array.from(below),
        lost,
        notation: root.notation
    }
}

/** The readings in classes of the same presence and loss, so that each class is counted once. */
interface Classes {
    weight: Float64Array
    loss: Float64Array
    /** By copy, by class: what the copy forbids its node to hold or to lack. */
    forbidsAbsent: Uint8Array[]
    forbidsPresent: Uint8Array[]
    total: number
}

const classesOf = (rows: readonly { presence: readonly Presence[], redundant: boolean }[], copies: number, costs: Costs): Classes => {
    const counts = new Map<string, { row: typeof rows[number], n: number }>()
    for (const row of rows) {
        const key = `${row.presence.map(p => p[0]).join('')}${row.redundant ? 'r' : ''}`
        const known = counts.get(key)
        if (known) known.n++
        else counts.set(key, { row, n: 1 })
    }
    const classes = [...counts.values()]
    return {
        weight: Float64Array.from(classes.map(({ n }) => n)),
        loss: Float64Array.from(classes.map(({ row }) => row.redundant ? costs.redundantLoss : 1)),
        forbidsAbsent: Array.from({ length: copies }, (_, c) => Uint8Array.from(classes.map(({ row }) => row.presence[c] === 'present' ? 1 : 0))),
        forbidsPresent: Array.from({ length: copies }, (_, c) => Uint8Array.from(classes.map(({ row }) => row.presence[c] === 'absent' ? 1 : 0))),
        total: rows.length
    }
}

/**
 * The cost of every class at every node, children first: what the
 * subtree below costs if the node lacks the reading (`absent`) and if
 * it holds it (`present`).
 */
const fill = (tree: LaidOut, classes: Classes, costs: Costs, absent: Float64Array[], present: Float64Array[]) => {
    const k = classes.weight.length
    for (let v = 0; v < tree.copy.length; v++) {
        const a = absent[v]
        const p = present[v]
        a.fill(0)
        p.fill(0)
        const copy = tree.copy[v]
        if (copy >= 0) {
            const inner = tree.below[v] !== 1 << copy
            const noAbsent = classes.forbidsAbsent[copy]
            const noPresent = classes.forbidsPresent[copy]
            for (let c = 0; c < k; c++) {
                if (noAbsent[c]) a[c] = INF
                if (noPresent[c]) p[c] = inner ? costs.copyDeviation : INF
            }
        }
    }
    for (let v = 0; v < tree.copy.length; v++) {
        const u = tree.parent[v]
        if (u < 0) continue
        const factor = tree.transfer[v] ? costs.transferLoss : 1
        const a = absent[v]
        const p = present[v]
        const pa = absent[u]
        const pp = present[u]
        for (let c = 0; c < k; c++) {
            pa[c] += Math.min(a[c], p[c] + costs.gain)
            pp[c] += Math.min(p[c], a[c] + classes.loss[c] * factor)
        }
    }
}

const scoreOf = (tree: LaidOut, classes: Classes, costs: Costs, absent: Float64Array[], present: Float64Array[]): number => {
    fill(tree, classes, costs, absent, present)
    const root = tree.copy.length - 1
    let sum = 0
    for (let c = 0; c < classes.weight.length; c++) {
        sum += classes.weight[c] * Math.min(absent[root][c], present[root][c] + costs.gain)
    }
    return sum - costs.gain * classes.total + costs.lostState * tree.lost
}

/**
 * A stemma the search scored, in a notation naming the copies: a lost
 * state as `*`, the versions derived from a node in brackets after it.
 * @category Filiation
 */
export interface Scored {
    notation: string
    cost: number
    lost: number
}

/**
 * How much more the best stemma without one of the best one's groupings
 * costs: the margin by which the copies decide it.
 * @category Filiation
 */
export interface Support {
    /** The copies the grouping holds, as the copies of a node and those below it. */
    copies: string[]
    /** Whether it is the grouping of a copy carrying a version above others, rather than of the copies below a node. */
    ancestor?: string
    margin: number
}

/** The outcome of the search. */
export interface Search {
    best: LaidOut
    cost: number
    scored: number
    alternatives: Scored[]
    supports: Support[]
}

const before = (a: Scored, b: Scored): boolean =>
    a.cost < b.cost - 1e-9 || (Math.abs(a.cost - b.cost) <= 1e-9 && (a.lost < b.lost || (a.lost === b.lost && a.notation < b.notation)))

/**
 * Scores every stemma of the copies and keeps the best, the runners-up
 * and, for each grouping of the best, the best stemma without it. Ties
 * go to fewer lost states, then to the notation, so that the outcome
 * depends on nothing but the copies and the costs.
 */
export const searchStemmata = (
    copies: readonly string[],
    names: readonly string[],
    systems: readonly string[],
    rows: readonly { presence: readonly Presence[], redundant: boolean }[],
    costs: Costs,
    transfers: ReadonlyMap<string, ReadonlySet<string>>,
    keep: number
): Search => {
    const n = copies.length
    const classes = classesOf(rows, n, costs)
    const pool = 2 * n
    const absent = Array.from({ length: pool }, () => new Float64Array(classes.weight.length))
    const present = Array.from({ length: pool }, () => new Float64Array(classes.weight.length))

    const masks = 1 << n
    const without = new Float64Array(masks).fill(Infinity)
    const notAncestor = new Float64Array(n).fill(Infinity)
    const top: (Scored & { tree: LaidOut })[] = []
    let scored = 0

    for (const tree of stemmataOf(n)) {
        const laid = lay(tree, systems, names, transfers)
        if (!laid) continue
        scored++
        const cost = scoreOf(laid, classes, costs, absent, present)
        const entry = { notation: laid.notation, cost, lost: laid.lost, tree: laid }

        if (top.length <= keep || before(entry, top[top.length - 1])) {
            top.push(entry)
            top.sort((a, b) => before(a, b) ? -1 : before(b, a) ? 1 : 0)
            if (top.length > keep + 1) top.pop()
        }

        const groupings = new Set<number>()
        let ancestors = 0
        for (let v = 0; v < laid.copy.length; v++) {
            if (laid.below[v] === (laid.copy[v] >= 0 ? 1 << laid.copy[v] : -1)) continue
            groupings.add(laid.below[v])
            if (laid.copy[v] >= 0) ancestors |= 1 << laid.copy[v]
        }
        for (let mask = 1; mask < masks; mask++) {
            if (!groupings.has(mask) && cost < without[mask]) without[mask] = cost
        }
        for (let c = 0; c < n; c++) {
            if (!(ancestors & (1 << c)) && cost < notAncestor[c]) notAncestor[c] = cost
        }
    }

    if (top.length === 0) throw new Error('No stemma of these copies is admissible')
    const best = top[0]
    const supports: Support[] = []
    const named = (mask: number) => copies.filter((_, c) => mask & (1 << c))
    const seen = new Set<number>()
    for (let v = 0; v < best.tree.copy.length; v++) {
        const mask = best.tree.below[v]
        const copy = best.tree.copy[v]
        if (copy >= 0 && mask === 1 << copy) continue
        if (mask === masks - 1 && copy < 0) continue
        if (!seen.has(mask)) {
            seen.add(mask)
            supports.push({ copies: named(mask), margin: without[mask] - best.cost })
        }
        if (copy >= 0) supports.push({ copies: named(mask), ancestor: copies[copy], margin: notAncestor[copy] - best.cost })
    }

    return {
        best: best.tree,
        cost: best.cost,
        scored,
        alternatives: top.slice(1).map(({ notation, cost, lost }) => ({ notation, cost, lost })),
        supports
    }
}

/**
 * What every node holds of one reading under the least costly account
 * of it: children first, as `LaidOut` orders the nodes. A node may be
 * held to a state (`fixed`), as an edit the editor wrote holds a
 * version to what it inserts or deletes. Where two accounts cost the
 * same, the one with the node lacking the reading is taken, so that a
 * reading arises as late as the copies allow. Nothing where the fixed
 * states cannot be met.
 */
export const statesOf = (
    tree: LaidOut,
    presence: readonly Presence[],
    redundant: boolean,
    costs: Costs,
    fixed?: ReadonlyMap<number, boolean>
): boolean[] | undefined => {
    const size = tree.copy.length
    const absent = new Float64Array(size)
    const present = new Float64Array(size)
    const loss = redundant ? costs.redundantLoss : 1
    for (let v = 0; v < size; v++) {
        const copy = tree.copy[v]
        if (copy >= 0) {
            const inner = tree.below[v] !== 1 << copy
            if (presence[copy] === 'present') absent[v] = INF
            if (presence[copy] === 'absent') present[v] = inner ? costs.copyDeviation : INF
        }
        const held = fixed?.get(v)
        if (held === true) absent[v] = INF
        if (held === false) present[v] = INF
    }
    for (let v = 0; v < size; v++) {
        const u = tree.parent[v]
        if (u < 0) continue
        const factor = tree.transfer[v] ? costs.transferLoss : 1
        absent[u] += Math.min(absent[v], present[v] + costs.gain)
        present[u] += Math.min(present[v], absent[v] + loss * factor)
    }

    const states: boolean[] = Array.from({ length: size }, () => false)
    const root = size - 1
    const rootAbsent = absent[root]
    const rootPresent = present[root] + costs.gain
    if (Math.min(rootAbsent, rootPresent) >= INF / 2) return undefined
    states[root] = rootPresent < rootAbsent
    for (let v = size - 2; v >= 0; v--) {
        const u = tree.parent[v]
        const factor = tree.transfer[v] ? costs.transferLoss : 1
        const a = states[u] ? absent[v] + loss * factor : absent[v]
        const p = states[u] ? present[v] : present[v] + costs.gain
        states[v] = p < a
    }
    return states
}
