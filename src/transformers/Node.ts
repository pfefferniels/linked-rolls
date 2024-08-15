import { AnyRollEvent, Certainty, Shifting, Stretching } from "../types";

export interface Typed<T> {
    type: T
}

export interface WithId {
    xmlId: string
}

export const find = (root: AnyBodyNode, xmlId: string): AnyBodyNode | undefined => {
    if (root.xmlId === xmlId) return root
    if (!root.children) return
    for (const child of root.children) {
        if (!child) continue
        const found = find(child, xmlId)
        if (found) return found
    }
}

export const isEmpty = (el: AnyBodyNode) => {
    return !el.children || el.children.length === 0
}

export const findAncestor = (el: AnyBodyNode, type: string): AnyBodyNode | undefined => {
    if (el.type === type) return el
    if (!el.parent) return undefined
    return findAncestor(el.parent, type)
}

export const findDescendant = (el: AnyBodyNode, type: string): AnyBodyNode | undefined => {
    if (el.type === type) return el
    if (!el.children) return undefined
    for (const child of el.children) {
        const found = findDescendant(child, type)
        if (found) return found
    }
}

export const filter = (root: AnyBodyNode, predicate: (el: AnyBodyNode) => boolean): AnyBodyNode[] => {
    const acc = []
    if (predicate(root)) acc.push(root)
    if (!root.children) return acc

    for (const child of root.children) {
        if (!child) continue
        acc.push(...filter(child, predicate))
    }
    return acc
}

export interface CollatedEventNode extends Typed<'collatedEvent'>, WithId {
    parent: RdgNode | SicNode | CorrNode | BodyNode
    children: AnyRollEventNode[]
}

export interface BodyNode extends Typed<'body'>, WithId {
    parent: undefined
    children: (AnyEventNode | AppNode | ChoiceNode)[]
}

export interface FacsNode extends Typed<'facs'>, WithId {
    url: string
    source: string
    parent: AnyRollEventNode
    children: undefined
}

type AsNode<T> = {
    parent: CollatedEventNode | RdgNode | SicNode | CorrNode | BodyNode
    children: FacsNode[] | undefined
} & T & WithId

export type AnyRollEventNode = AsNode<AnyRollEvent>

export type AnyEventNode = CollatedEventNode | AnyRollEventNode

export interface RdgNode extends Typed<'rdg'>, WithId {
    parent: AppNode,
    children: (ChoiceNode | AnyEventNode)[]

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
    children: AnyEventNode[]
}

export interface CorrNode extends Typed<'corr'>, WithId {
    parent: ChoiceNode
    children: AnyEventNode[]
}

export type AnyBodyNode =
    | AppNode
    | RdgNode
    | BodyNode
    | AnyEventNode
    | ChoiceNode
    | SicNode
    | CorrNode
    | FacsNode


export interface HeaderNode extends Typed<'header'>, WithId {
    parent: undefined 
    children: (SourceDescNode | EditionStmtNode)[]
}

export interface EditionStmtNode extends Typed<'editionStmt'>, WithId {
    parent: HeaderNode
    children: EditorNode[]
}

export interface EditorNode extends Typed<'editor'>, WithId {
    parent: EditionStmtNode
    children: undefined
    text: string
}

export interface SourceDescNode extends Typed<'sourceDesc'>, WithId {
    parent: HeaderNode
    children: SourceNode[]
}

export interface SourceNode extends Typed<'source'>, WithId {
    parent: SourceDescNode
    children: (HandNoteNode | MeasurementDescNode | CollationDescNode)[]
}

export type AnyOperationNode = (Shifting | Stretching) & {
    parent: CollationDescNode 
    children: undefined
}

export interface CollationDescNode extends Typed<'collationDesc'> {
    parent: SourceNode 
    children: AnyOperationNode[]
}

export interface ShiftingNode extends Typed<'shifting'> {
    parent: CollationDescNode 
    children: undefined 
    horizontal: number 
    vertical: number 
}

export interface HandNoteNode extends Typed<'handNote'>, WithId {
    parent: SourceNode
    children: undefined
    text?: string
    who: string
    when: string
}

export interface SoftwareNode extends Typed<'application'>, WithId {
    name: string 
    version?: string
    url?: string
    resp?: string
    parent: MeasurementNode
    children: undefined
}

export interface MeasurementNode extends Typed<'measurement'>, WithId {
    when: string
    parent: MeasurementDescNode
    children: SoftwareNode[]
}

export interface MeasurementDescNode extends Typed<'measurementDesc'>, WithId {
    parent: SourceNode
    children: MeasurementNode[]
}

export type AnyHeaderNode =
    | HeaderNode
    | EditionStmtNode
    | EditorNode
    | SourceDescNode
    | SourceNode
    | HandNoteNode
    | MeasurementNode
    | MeasurementDescNode
    | SoftwareNode
    | CollationDescNode
    | AnyOperationNode

export type AnyNode =
    | AnyBodyNode
    | AnyHeaderNode
