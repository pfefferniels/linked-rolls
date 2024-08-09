import { v4 } from 'uuid';
import { RollCopy } from './RollCopy'
import { AnyRollEvent, Assumption, CollatedEvent } from './types'
import { HandAssignmentTransformer } from './transformers/HandAssignmentTransformer';
import { asJSON } from './asJSON';
import { BodyNode } from './transformers/Node';
import { CollatedEventTransfromer } from './transformers/CollatedEventTransformer';
import { SeparationTransformer } from './transformers/SeparationTransfromer';
import { XMLBuilder } from 'fast-xml-parser';
import { SortNodes } from './transformers/SortNodes';

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

export const asXML = (
    sources: RollCopy[],
    collatedEvents: CollatedEvent[],
    assumptions: Assumption[]) => {
    const root: BodyNode = {
        type: 'body',
        parent: undefined,
        xmlId: v4(),
        children: []
    }

    const insertEvents = new CollatedEventTransfromer(sources, root)
    for (const event of collatedEvents) {
        insertEvents.apply(event)
    }

    for (const assumption of assumptions) {
        if (assumption.type === 'handAssignment') {
            const insertHandAssignments = new HandAssignmentTransformer(sources, root)
            insertHandAssignments.apply(assumption)
        }
        else if (assumption.type === 'separation') {
            const insertSeparation = new SeparationTransformer(sources, root)
            insertSeparation.apply(assumption)
        }
    }

    const sorter = new SortNodes(sources, root)
    sorter.apply()

    const json = asJSON(root)

    const builder = new XMLBuilder({
        preserveOrder: true,
        ignoreAttributes: false,
    })

    return builder.build([json])
}
