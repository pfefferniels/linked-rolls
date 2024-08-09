import { AnyRollEvent, Certainty, Expression, Note } from "../types";

export interface Typed<T> {
    type: T
}

export interface WithId {
    xmlId: string
}

export const find = (root: AnyElement, xmlId: string): AnyElement | undefined => {
    if (root.xmlId === xmlId) return root
    if (!root.children) return
    for (const child of root.children) {
        if (!child) continue
        const found = find(child, xmlId)
        if (found) return found
    }
}

export const isEmpty = (el: AnyElement) => {
    return !el.children || el.children.length === 0
}

export const findAncestor = (el: AnyElement, type: string): AnyElement | undefined => {
    if (el.type === type) return el
    if (!el.parent) return undefined
    return findAncestor(el.parent, type)
}

export const findDescendant = (el: AnyElement, type: string): AnyElement | undefined => {
    if (el.type === type) return el
    if (!el.children) return undefined 
    for (const child of el.children) {
        const found = findDescendant(child, type)
        if (found) return found
    }
}

export interface CollatedEventNode extends Typed<'collatedEvent'>, WithId {
    parent: RdgNode | SicNode | CorrNode | BodyNode
    children: AnyEventNode[]
}

export interface BodyNode extends Typed<'body'>, WithId {
    parent: undefined
    children: (CollatedEventNode | AppNode | ChoiceNode)[]
}

export interface NoteNode extends Typed<'note'>, WithId, Note {
    parent: CollatedEventNode
    children: undefined
}

export interface ExpressionNode extends Typed<'expression'>, WithId, Expression {
    parent: CollatedEventNode
    children: undefined
}

type AsNode<T> = {
    parent: CollatedEventNode
    children: undefined
} & T & WithId

export type AnyEventNode = AsNode<AnyRollEvent>

export interface RdgNode extends Typed<'rdg'>, WithId {
    parent: AppNode,
    children: (ChoiceNode | CollatedEventNode)[]

    source: string[]
    hand?: string[]
    resp?: string[]
    cert?: Certainty
}

export interface AppNode extends Typed<'app'>, WithId {
    parent: BodyNode
    children: RdgNode[]
}

export interface ChoiceNode extends Typed<'choice'>, WithId {
    parent: BodyNode | RdgNode
    children: (SicNode | CorrNode)[]
}

export interface SicNode extends Typed<'sic'>, WithId {
    parent: ChoiceNode
    children: CollatedEventNode[]
}

export interface CorrNode extends Typed<'corr'>, WithId {
    parent: ChoiceNode
    children: CollatedEventNode[]
}

export type AnyElement =
    AnyEventNode
    | AppNode
    | RdgNode
    | BodyNode
    | CollatedEventNode
    | ChoiceNode
    | SicNode
    | CorrNode
