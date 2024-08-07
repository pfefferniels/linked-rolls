import { v4 } from 'uuid';
import { RollCopy } from './RollCopy'
import { AnyRollEvent, Assumption, CollatedEvent, Relation } from './types'

const namespace = 'https://linked-rolls.org/rollo'

const determineSource = (sources: RollCopy[], event: AnyRollEvent) => {
    const containingSource = sources.find(source => source.hasEvent(event))
    if (!containingSource) return
    return containingSource.id
}

const determineSources = (sources: RollCopy[], events: CollatedEvent[]) => {
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

/*
const wrapAll = (nodes: Element[], wrapper: Element) => {
    if (!nodes.length) {
        console.log('nodes cannot be empty when wrapping')
        return wrapper
    }

    // Cache the current parent and previous sibling of the first node.
    const parent = nodes[0].parentNode;
    if (!parent) return

    const previousSibling = nodes[0].previousSibling;

    // Place each node in wrapper.
    //  - If nodes is an array, we must increment the index we grab from 
    //    after each loop.
    //  - If nodes is a NodeList, each node is automatically removed from 
    //    the NodeList when it is removed from its parent with appendChild.
    for (let i = 0; nodes.length - i; wrapper.firstChild === nodes[0] && i++) {
        wrapper.appendChild(nodes[i]);
    }

    // Place the wrapper just after the cached previousSibling,
    // or if that is null, just before the first child.
    const nextSibling = previousSibling ? previousSibling.nextSibling : parent.firstChild;
    parent.insertBefore(wrapper, nextSibling);

    return wrapper;
}*/

const eventAsXML = (event: CollatedEvent, doc: Document, sources: RollCopy[]) => {
    if (!event.wasCollatedFrom.length) return

    const firstEvent = event.wasCollatedFrom[0]
    const type = firstEvent.type

    const holeStart = event.wasCollatedFrom.reduce((acc, curr) => acc + curr.hasDimension.from, 0) / event.wasCollatedFrom.length
    const holeEnd = event.wasCollatedFrom.reduce((acc, curr) => acc + curr.hasDimension.to, 0) / event.wasCollatedFrom.length
    const holeUnit = event.wasCollatedFrom[0].hasDimension.hasUnit

    const eventEl = doc.createElementNS(namespace, type)
    eventEl.setAttribute('id', event.id)
    eventEl.setAttribute('hole.start', holeStart.toString())
    eventEl.setAttribute('hole.end', holeEnd.toString())
    eventEl.setAttribute('hole.unit', holeUnit)
    eventEl.setAttribute('trackerHole', firstEvent.trackerHole.toString())

    if (type == 'note') {
        eventEl.setAttribute('pitch', firstEvent.hasPitch.toString())
    }
    else if (type === 'expression') {
        eventEl.setAttribute('scope', firstEvent.hasScope)
        eventEl.setAttribute('type', firstEvent.P2HasType)
    }

    for (const originalEvent of event.wasCollatedFrom) {
        if (!originalEvent.annotates) continue

        const facs = doc.createElementNS(namespace, 'facs')
        facs.setAttribute('url', originalEvent.annotates)
        const source = determineSource(sources, originalEvent)
        if (source) facs.setAttribute('source', `#${source}`)

        eventEl.appendChild(facs)
    }

    return eventEl
}

export const asXML = (
    sources: RollCopy[],
    collatedEvents_: CollatedEvent[],
    editorialAssumptions_: Assumption[]) => {
    const collatedEvents = structuredClone(collatedEvents_)
    const editorialAssumptions = structuredClone(editorialAssumptions_)

    const doc = document.implementation.createDocument(namespace, 'roll');
    const roll = doc.documentElement

    const sourceDesc = doc.createElementNS(namespace, 'sourceDesc')
    for (const source of sources) {
        const sourceEl = doc.createElementNS(namespace, 'source')
        sourceEl.setAttribute('xml:id', source.physicalItem.id)
        sourceEl.setAttribute('type', source.physicalItem.hasType)

        const rollDate = doc.createElementNS(namespace, 'rollDate')
        rollDate.textContent = source.physicalItem.rollDate
        sourceEl.appendChild(rollDate)

        for (const editing of source.editings) {
            const editEl = doc.createElementNS(namespace, 'manualEdit')
            editEl.setAttribute('xml:id', editing.id)
            editEl.setAttribute('who', editing.carriedOutBy)
            editEl.setAttribute('when', editing.hasTimeSpan.atSomeTimeWithin)
            sourceEl.appendChild(editEl)
        }

        if (source.operations.length) {
            const collationDesc = doc.createElementNS(namespace, 'collation')
            for (const op of source.operations) {
                const child = doc.createElementNS(namespace, op.type)
                if (op.type === 'shifting') {
                    child.setAttribute('horizontal', op.horizontal.toString())
                    child.setAttribute('vertical', op.vertical.toString())
                }
                else if (op.type === 'stretching') {
                    child.setAttribute('factor', op.factor.toString())
                }
                collationDesc.appendChild(child)
            }
            sourceEl.appendChild(collationDesc)
        }
        sourceDesc.appendChild(sourceEl)
    }
    roll.appendChild(sourceDesc)

    const body = doc.createElementNS(namespace, 'body')
    roll.appendChild(body)

    // apply pre-collation editorial actions
    for (const assumption of editorialAssumptions) {
        if (assumption.type === 'separation') {
            if (!assumption.into.length) continue

            const sic = doc.createElementNS(namespace, 'sic')
            const sicEl = eventAsXML({
                id: v4(),
                wasCollatedFrom: [assumption.separated]
            }, doc, sources)
            if (sicEl) sic.appendChild(sicEl)

            const choice = doc.createElementNS(namespace, 'choice')
            choice.setAttribute('id', assumption.id)
            choice.appendChild(sic)

            const corr = doc.createElementNS(namespace, 'corr')
            let relation: Relation = {
                type: 'relation',
                id: v4(),
                carriedOutBy: '#xml-export',
                relates: [
                    {
                        contains: []
                    }, {
                        contains: []
                    }
                ]
            }

            for (const event of assumption.into) {
                // turn the roll copy's event into a collated event
                const asCollatedEvent: CollatedEvent = {
                    wasCollatedFrom: [event],
                    id: v4()
                }

                // has this event been collated with
                // another event?
                for (const collatedEvent of collatedEvents) {
                    const index = collatedEvent.wasCollatedFrom.findIndex(e => e.id === event.id)
                    if (index === -1) continue

                    // take it out of that context
                    collatedEvent.wasCollatedFrom.splice(index, 1)
                    if (!collatedEvent.wasCollatedFrom.length) {
                        collatedEvents.splice(collatedEvents.indexOf(collatedEvent), 1)
                    }
                    else {
                        relation.relates[0].contains.push(collatedEvent)
                    }

                    // add that event to an alternative reading
                    // of the originally collated event
                    relation.relates[1].contains.push(asCollatedEvent)
                    break
                }

                const eventEl = eventAsXML(asCollatedEvent, doc, sources)
                if (!eventEl) continue
                corr.appendChild(eventEl)
            }
            editorialAssumptions.push(relation)

            choice.appendChild(corr)
            body.appendChild(choice)

            if (assumption.certainty) {
                corr.setAttribute('cert', assumption.certainty)
            }

            if (assumption.note) {
                const noteEl = doc.createElementNS(namespace, 'comment')
                noteEl.textContent = assumption.note
                choice.appendChild(noteEl)
            }
        }
        if (assumption.type === 'unification') {
            if (!assumption.unified.length) continue

            const choice = doc.createElementNS(namespace, 'choice')
            choice.setAttribute('id', assumption.id)
            const sic = doc.createElementNS(namespace, 'sic')

            for (const singleEvent of assumption.unified) {
                const eventEl = eventAsXML({
                    id: v4(),
                    wasCollatedFrom: [singleEvent]
                }, doc, sources)
                if (eventEl) sic.appendChild(eventEl)
            }

            const corr = doc.createElementNS(namespace, 'corr')

            const relation: Relation = {
                id: v4(),
                carriedOutBy: '#xml-collator',
                type: 'relation',
                relates: [
                    {
                        contains: []
                    },
                    {
                        contains: []
                    }
                ]
            }

            // before collation, the first unified event has been
            // extended to include all unified perforation. Try 
            // to find this event among the collated events
            for (const collatedEvent of collatedEvents) {
                const index = collatedEvent.wasCollatedFrom.findIndex(rollEvent =>
                    rollEvent.id === assumption.unified[0].id)

                if (index === -1) continue

                // Take out the roll copies' event from its collated
                // context, create a new event and relate the new event
                // to the remaining connected elements
                const newCollatedEvent = {
                    id: v4(),
                    wasCollatedFrom: [collatedEvent.wasCollatedFrom[index]]
                }
                collatedEvent.wasCollatedFrom.splice(index, 1)

                // The event stood for itself, it has not been collated 
                // to another roll's event. Remove its hull, we gave it a new
                // context already.
                if (!collatedEvent.wasCollatedFrom.length) {
                    collatedEvents.splice(collatedEvents.indexOf(collatedEvent), 1)
                }
                else {
                    relation.relates[0].contains.push(collatedEvent)
                }

                relation.relates[1].contains.push(newCollatedEvent)

                const eventEl = eventAsXML(newCollatedEvent, doc, sources)
                if (eventEl) corr.appendChild(eventEl)

                break
            }
            editorialAssumptions.push(relation)
            console.log('pushed', relation)

            choice.appendChild(sic)
            choice.appendChild(corr)
            body.appendChild(choice)

            if (assumption.certainty) {
                corr.setAttribute('cert', assumption.certainty)
            }

            if (assumption.note) {
                const noteEl = doc.createElementNS(namespace, 'comment')
                noteEl.textContent = assumption.note
                choice.appendChild(noteEl)
            }
        }
        else if (assumption.type === 'handAssignment') {
            // preserve the hand assignment by 
            // taking the event out of its aligned
            // context
            const affectedEvents = []
            const affectedOtherEvents = []
            for (const assignedTo of assumption.assignedTo) {
                for (const collatedEvent of collatedEvents) {
                    const index = collatedEvent.wasCollatedFrom.findIndex(e => {
                        return e.id === assignedTo.id
                    })

                    if (index === -1) continue

                    const newCollatedEvent = {
                        id: v4(),
                        wasCollatedFrom: [assignedTo]
                    }

                    affectedEvents.push(newCollatedEvent)

                    collatedEvent.wasCollatedFrom.splice(index, 1)
                    if (!collatedEvent.wasCollatedFrom.length) {
                        collatedEvents.splice(collatedEvents.indexOf(collatedEvent), 1)
                    }
                    else {
                        affectedOtherEvents.push(collatedEvent)
                    }
                }
            }

            const app = doc.createElementNS(namespace, 'app')
            const rdg = doc.createElementNS(namespace, 'rdg')

            rdg.setAttribute('hand', assumption.hand.id)
            rdg.setAttribute('source',
                Array
                    .from(determineSources(sources, affectedEvents))
                    .join(' '))

            if (assumption.certainty) {
                rdg.setAttribute('cert', assumption.certainty)
            }
            rdg.setAttribute('resp', assumption.carriedOutBy)

            if (assumption.note) {
                const note = doc.createElementNS(namespace, 'comment')
                note.textContent = assumption.note
                rdg.appendChild(note)
            }

            for (const e of affectedEvents) {
                const eventEl = eventAsXML(e, doc, sources)
                if (!eventEl) break

                rdg.appendChild(eventEl)
            }
            app.appendChild(rdg)

            const otherRdg = doc.createElementNS(namespace, 'rdg')
            otherRdg.setAttribute('source',
                Array
                    .from(determineSources(sources, affectedOtherEvents))
                    .join(' '))
            for (const e of affectedOtherEvents) {
                const eventEl = eventAsXML(e, doc, sources)
                if (!eventEl) break;
                otherRdg.appendChild(eventEl)
            }
            app.appendChild(otherRdg)

            body.appendChild(app)
        }
    }

    // Apply all collated events
    for (const event of collatedEvents) {
        const eventEl = eventAsXML(event, doc, sources)
        if (eventEl) {
            body.appendChild(eventEl)
        }
        else {
            console.log('no element created for', event)
        }
    }

    // Apply post-collation editorial actions
    for (const assumption of editorialAssumptions) {
        if (assumption.type === 'relation') {
            if (!assumption.relates.length) continue

            const app = doc.createElementNS(namespace, 'app')
            for (const reading of assumption.relates) {
                const rdg = doc.createElementNS(namespace, 'rdg')

                // Determine the sources
                const rdgSources = determineSources(sources, reading.contains)

                rdg.setAttribute(
                    'source',
                    Array
                        .from(rdgSources)
                        .map(source => `#${source}`)
                        .join(' ')
                )

                const els = reading.contains
                    .map(event => roll.querySelector(`*[*|id='${event.id}']`))
                    .filter(element => element !== null) as Element[]

                if (els.length) {
                    let choice = els[0].closest('choice')
                    if (els.some(el => el.closest('choice') !== choice)) {
                        choice = null
                    }

                    if (choice) {
                        rdg.appendChild(choice)
                    }
                    else {
                        els.forEach(el => rdg.appendChild(el))
                    }
                }

                app.appendChild(rdg)
            }

            app.setAttribute('id', assumption.id)
            body.appendChild(app)
        }
    }

    // TODO: sort body 

    return roll
}
