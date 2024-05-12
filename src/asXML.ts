import { RollCopy } from './RollCopy'
import { Assumption, CollatedEvent } from './types'

const namespace = 'https://linked-rolls.org/rollo'

const wrapAll = (nodes: Element[], wrapper: Element) => {
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
}

export const asXML = (
    sources: RollCopy[],
    collatedEvents: CollatedEvent[],
    editorialAssumptions: Assumption[]) => {
    const doc = document.implementation.createDocument(null, 'roll');
    const roll = doc.documentElement

    const sourceDesc = doc.createElementNS(namespace, 'sourceDesc')
    for (const source of sources) {
        const sourceEl = doc.createElementNS(namespace, 'source')
        sourceEl.setAttribute('xml:id', source.physicalItem.id)
        sourceEl.setAttribute('type', source.physicalItem.hasType)

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
    for (const event of collatedEvents) {
        if (!event.wasCollatedFrom.length) continue

        const firstEvent = event.wasCollatedFrom[0]
        const type = firstEvent.type
        const holeStart = event.wasCollatedFrom.reduce((acc, curr) => acc + curr.hasDimension.from, 0) / event.wasCollatedFrom.length
        const holeEnd = event.wasCollatedFrom.reduce((acc, curr) => acc + curr.hasDimension.to, 0) / event.wasCollatedFrom.length
        const holeUnit = event.wasCollatedFrom[0].hasDimension.hasUnit

        const eventEl = doc.createElementNS(namespace, type)
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

        for (const collatedEvent of event.wasCollatedFrom) {
            if (!collatedEvent.annotates) return

            const facs = doc.createElementNS(namespace, 'facs')
            facs.setAttribute('url', collatedEvent.annotates)
            eventEl.appendChild(facs)
        }

        body.appendChild(eventEl)
    }

    for (const assumption of editorialAssumptions) {
        if (assumption.type === 'unification') {
            if (!assumption.unified.length) continue

            const choice = doc.createElementNS(namespace, 'choice')
            const sic = doc.createElementNS(namespace, 'sic')
            const affectedElements = assumption.unified
                .map(event => roll.querySelector(`*[*|id='${event.id}']`))
                .filter(element => element !== null)
            wrapAll(affectedElements as Element[], sic)
            choice.appendChild(sic)
            wrapAll([sic], choice)

            const corr = doc.createElementNS(namespace, 'corr')
            const meanOnsets = assumption.unified.map(event => {
                const sum = event.wasCollatedFrom.reduce((acc, curr) => acc + curr.hasDimension.from, 0)
                return sum / event.wasCollatedFrom.length
            })

            const meanOffsets = assumption.unified.map(event => {
                const sum = event.wasCollatedFrom.reduce((acc, curr) => acc + curr.hasDimension.to, 0)
                return sum / event.wasCollatedFrom.length
            })

            const beginning = Math.min(...meanOnsets)
            const end = Math.min(...meanOffsets)

            const virtualHole = doc.createElementNS(namespace, assumption.unified[0].wasCollatedFrom[0].type)
            virtualHole.setAttribute('hole.start', beginning.toString())
            virtualHole.setAttribute('hole.end', end.toString())
            virtualHole.setAttribute('hole.unit', assumption.unified[0].wasCollatedFrom[0].hasDimension.hasUnit)

            corr.appendChild(virtualHole)
            choice.appendChild(corr)
        }
    }
    roll.appendChild(body)

    return roll
}
