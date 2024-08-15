import { v4 } from 'uuid';
import { RollCopy } from './RollCopy'
import { AnyRollEvent, Assumption, CollatedEvent } from './types'
import { HandAssignmentTransformer } from './transformers/HandAssignmentTransformer';
import { asJSON } from './asJSON';
import { AnyOperationNode, BodyNode, CollationDescNode, EditionStmtNode, EditorNode, HeaderNode, MeasurementDescNode, MeasurementNode, SoftwareNode, SourceDescNode, SourceNode } from './transformers/Node';
import { InsertCollatedEvent } from './transformers/InsertCollatedEvent';
import { SeparationTransformer } from './transformers/SeparationTransfromer';
import { XMLBuilder } from 'fast-xml-parser';
import { SortNodes } from './transformers/SortNodes';
import { RelationTransformer } from './transformers/RelationTransformer';
import { UnpackCollatedEvents } from './transformers/UnpackCollatedEvents';
import { InsertAnnots } from './transformers/InsertAnnots';

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

        for (const hand of source.editings) {
            sourceNode.children.push({
                type: 'handNote',
                who: hand.carriedOutBy,
                when: hand.hasTimeSpan.atSomeTimeWithin,
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

        for (const measurement of source.measurements) {
            const measurementNode: MeasurementNode = {
                type: 'measurement',
                parent: measurementDesc,
                children: [],
                when: measurement.hasTimeSpan.atSomeTimeWithin,
                xmlId: measurement.id
            }

            const software: SoftwareNode = {
                children: undefined,
                type: 'application',
                name: measurement.usedSoftware,
                // url, version
                parent: measurementNode,
                xmlId: v4()
            }
            measurementNode.children = [software]
            measurementDesc.children.push(measurementNode)
        }

        if (source.operations.length > 0) {
            const collationDesc: CollationDescNode = {
                parent: sourceNode,
                children: [],
                type: 'collationDesc'
            }

            for (const op of source.operations) {
                const opNode: AnyOperationNode = {
                    ...op,
                    parent: collationDesc,
                    children: undefined
                }
                collationDesc.children.push(opNode)
            }
            sourceNode.children.push(collationDesc)
        }
    }

    return header
}

export const asXML = (
    sources: RollCopy[],
    collatedEvents: CollatedEvent[],
    assumptions: Assumption[]) => {
    const body: BodyNode = {
        type: 'body',
        parent: undefined,
        xmlId: v4(),
        children: []
    }

    const insertEvent = new InsertCollatedEvent(sources, body, assumptions)
    for (const event of collatedEvents) {
        insertEvent.apply(event)
    }

    const insertAnnots = new InsertAnnots(sources, body, assumptions)
    for (const assumption of assumptions) {
        if (assumption.type === 'handAssignment') {
            const insertHandAssignments = new HandAssignmentTransformer(sources, body, assumptions)
            insertHandAssignments.apply(assumption)
        }
        else if (assumption.type === 'separation') {
            const insertSeparation = new SeparationTransformer(sources, body, assumptions)
            insertSeparation.apply(assumption)
        }
        else if (assumption.type === 'relation') {
            const insertRelation = new RelationTransformer(sources, body, assumptions)
            insertRelation.apply(assumption)
        }

        insertAnnots.apply(assumption)
    }

    const unpack = new UnpackCollatedEvents(sources, body, assumptions)
    unpack.apply()

    const sorter = new SortNodes(sources, body, assumptions)
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
