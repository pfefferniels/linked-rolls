import { RollCopy } from './RollCopy'
import { AnyRollEvent, CollatedEvent } from './types'
import { HandAssignmentTransformer } from './transformers/HandAssignmentTransformer';
import { asJSON } from './asJSON';
import { AnyOperationNode, BodyNode, CollationDescNode, EditionStmtNode, EditorNode, HeaderNode, MeasurementDescNode, MeasurementNode, SoftwareNode, SourceDescNode, SourceNode } from './transformers/Node';
import { InsertCollatedEvent } from './transformers/InsertCollatedEvent';
import { XMLBuilder } from 'fast-xml-parser';
import { SortNodes } from './transformers/SortNodes';
import { RelationTransformer } from './transformers/RelationTransformer';
import { InsertAnnots } from './transformers/InsertAnnots';
import { UnpackCollatedEvents } from './transformers/UnpackCollatedEvents';
import { v4 } from 'uuid';
import { ConjectureTransformer } from './transformers/ConjectureTransformer';
import { Edition } from './Edition';

export const namespace = 'https://linked-rolls.org/rollo'

const determineSource = (sources: RollCopy[], event: AnyRollEvent) => {
    const containingSource = sources.find(source => source.hasEvent(event))
    if (!containingSource) return
    return containingSource.id
}

export const determineSources = (sources: RollCopy[], events: CollatedEvent[]) => {
    const result: Set<string> = new Set()

    for (const event of events) {
        for (const copyEvent of event.wasCollatedFrom) {
            const sourceLink = determineSource(sources, copyEvent)
            if (!sourceLink) continue

            result.add(sourceLink)
        }
    }

    return result
}

const makeHeader = (sources: RollCopy[]) => {
    const header: HeaderNode = {
        parent: undefined,
        children: [],
        type: 'header',
        xmlId: v4()
    }

    const sourceDesc: SourceDescNode = {
        parent: header,
        children: [],
        type: 'sourceDesc',
        xmlId: v4()
    }

    const editionStmt: EditionStmtNode = {
        parent: header,
        children: [],
        type: 'editionStmt',
        xmlId: v4()
    }

    const editor: EditorNode = {
        parent: editionStmt,
        type: 'editor',
        text: 'Niels Pfeffer',
        xmlId: 'np',
        children: undefined
    }

    editionStmt.children.push(editor)
    header.children = [editionStmt, sourceDesc]

    for (const source of sources) {
        const sourceNode: SourceNode = {
            type: 'source',
            children: [],
            parent: sourceDesc,
            xmlId: source.id
        }
        sourceDesc.children.push(sourceNode)

        for (const hand of source.hands) {
            sourceNode.children.push({
                type: 'handNote',
                who: hand.carriedOutBy,
                when: hand.date,
                text: hand.note,
                xmlId: hand.id,
                parent: sourceNode,
                children: undefined
            })
        }

        const measurementDesc: MeasurementDescNode = {
            type: 'measurementDesc',
            parent: sourceNode,
            children: [],
            xmlId: v4()
        }

        sourceNode.children.push(measurementDesc)

        if (source.measurement) {
            const measurementNode: MeasurementNode = {
                type: 'measurement',
                parent: measurementDesc,
                children: [],
                when: source.measurement.executions.at(0)?.date || 'unknown',
                xmlId: source.measurement.id
            }

            for (const exec of source.measurement.executions) {
                const software: SoftwareNode = {
                    children: undefined,
                    type: 'application',
                    name: exec.software,
                    // url, version, date
                    parent: measurementNode,
                    xmlId: v4()
                }
                measurementNode.children.push(software)
            }
            measurementDesc.children.push(measurementNode)
        }

        const collationDesc: CollationDescNode = {
            parent: sourceNode,
            children: [],
            type: 'collationDesc'
        }
        sourceNode.children.push(collationDesc)

        if (source.shift) {
            const opNode: AnyOperationNode = {
                ...source.shift,
                parent: collationDesc,
                children: undefined
            }
            collationDesc.children.push(opNode)
        }

        if (source.stretch) {
            const opNode: AnyOperationNode = {
                ...source.stretch,
                parent: collationDesc,
                children: undefined
            }
            collationDesc.children.push(opNode)
        }
    }

    return header
}

export const asXML = (edition: Edition) => {
    const sources = edition.copies
    const collatedEvents = edition.collationResult.events

    const body: BodyNode = {
        type: 'body',
        parent: undefined,
        xmlId: v4(),
        children: []
    }

    // transformations have to be applied in a certain order
    // (mostly, top-down, mainly to reduce their complexity).
    // Do not change it.

    const insertEvent = new InsertCollatedEvent(sources, body)
    for (const event of collatedEvents) {
        insertEvent.apply(event)
    }

    const insertAnnots = new InsertAnnots(sources, body)

    const relations = edition.relations
    const insertRelation = new RelationTransformer(sources, body)
    relations.forEach(r => insertRelation.apply(r))

    const conjectures = edition.copies.map(copy => copy.conjectures).flat()
    const insertConjectures = new ConjectureTransformer(sources, body)
    conjectures.forEach(c => insertConjectures.apply(c))

    const handAssignments = edition.copies.map(copy => copy.additions).flat()
    const insertHandAssignments = new HandAssignmentTransformer(sources, body)
    handAssignments.forEach(h => insertHandAssignments.apply(h))

    const allActions = [...edition.actions, ...edition.copies.map(copy => copy.actions).flat()]
    allActions
        .filter(a => a !== undefined)
        .forEach(a => insertAnnots.apply(a))

    const unpack = new UnpackCollatedEvents(sources, body)
    unpack.apply()

    const sorter = new SortNodes(sources, body)
    sorter.apply()

    const bodyJson = asJSON(body)
    const headerJson = asJSON(makeHeader(sources))

    const builder = new XMLBuilder({
        preserveOrder: true,
        ignoreAttributes: false,
    })

    return builder.build([{
        ':@': {
            '@_xmlns': namespace
        },
        'roll': [
            headerJson,
            bodyJson
        ]
    }])
}
