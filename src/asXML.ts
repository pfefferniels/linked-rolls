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
    const result = document.implementation.createDocument(null, 'roll');

    const sourceDesc = result.createElementNS(namespace, 'sourceDesc')
    for (const source of sources) {
        const sourceEl = result.createElementNS(namespace, 'source')
        sourceEl.setAttribute('xml:id', source.physicalItem.id)
        sourceEl.setAttribute('type', source.physicalItem.hasType)

        if (source.operations.length) {
            const collationDesc = result.createElementNS(namespace, 'collation')
            for (const op of source.operations) {
                const child = result.createElementNS(namespace, op.type)
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
    result.appendChild(sourceDesc)

    const body = result.createElementNS(namespace, 'body')
    for (const event of collatedEvents) {
        if (!event.wasCollatedFrom.length) continue

        const type = event.wasCollatedFrom[0].type
        const holeStart = event.wasCollatedFrom.reduce((acc, curr) => acc + curr.hasDimension.from, 0) / event.wasCollatedFrom.length
        const holeEnd = event.wasCollatedFrom.reduce((acc, curr) => acc + curr.hasDimension.to, 0) / event.wasCollatedFrom.length
        const holeUnit = event.wasCollatedFrom[0].hasDimension.hasUnit

        const eventEl = result.createElementNS(namespace, type)
        eventEl.setAttribute('hole.start', holeStart.toString())
        eventEl.setAttribute('hole.end', holeEnd.toString())
        eventEl.setAttribute('hole.unit', holeUnit)

        body.appendChild(eventEl)
    }

    for (const assumption of editorialAssumptions) {
        if (assumption.type === 'unification') {
            if (!assumption.unified.length) continue

            const choice = result.createElementNS(namespace, 'choice')
            const sic = result.createElementNS(namespace, 'sic')
            const affectedElements = assumption.unified
                .map(event => result.querySelector(`*[*|id='${event.id}']`))
                .filter(element => element !== null)
            wrapAll(affectedElements as Element[], sic)
            choice.appendChild(sic)
            wrapAll([sic], choice)

            const corr = result.createElementNS(namespace, 'corr')
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

            const virtualHole = result.createElementNS(namespace, assumption.unified[0].wasCollatedFrom[0].type)
            virtualHole.setAttribute('hole.start', beginning.toString())
            virtualHole.setAttribute('hole.end', end.toString())
            virtualHole.setAttribute('hole.unit', assumption.unified[0].wasCollatedFrom[0].hasDimension.hasUnit)

            corr.appendChild(virtualHole)
            choice.appendChild(corr)
        }
    }
    result.appendChild(body)

    return result
}
