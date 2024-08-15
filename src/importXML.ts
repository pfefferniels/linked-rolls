import { v4 } from 'uuid';
import { RollCopy } from './RollCopy'
import { Assumption, CollatedEvent, ExpressionScope, ExpressionType } from './types'

export type RollEdition = {
    sources: RollCopy[],
    collatedEvents: CollatedEvent[],
    assumptions: Assumption[]
}

export const importXML = (doc: Document): RollEdition => {
    const collatedEvents: CollatedEvent[] = []

    const notes = doc.querySelectorAll('note')
    for (const note of notes) {
        collatedEvents.push({
            id: note.getAttribute('id')!,
            wasCollatedFrom: [{
                id: v4(),
                type: 'note',
                hasDimension: {
                    id: v4(),
                    horizontal: {
                        from: +note.getAttribute('hole.start')!,
                        to: +note.getAttribute('hole.end')!,
                        hasUnit: note.getAttribute('hole.unit')! as 'mm',
                    },
                    vertical: {
                        from: +note.getAttribute('trackerHole')!,
                        hasUnit: 'track'
                    }
                },
                hasPitch: +note.getAttribute('pitch')!
            }]
        })
    }

    const expressions = doc.querySelectorAll('expression')
    for (const expression of expressions) {
        collatedEvents.push({
            id: expression.getAttribute('id')!,
            wasCollatedFrom: [{
                id: v4(),
                type: 'expression',
                hasScope: expression.getAttribute('scope') as ExpressionScope,
                P2HasType: expression.getAttribute('type') as ExpressionType,
                hasDimension: {
                    id: v4(),
                    horizontal: {
                        from: +expression.getAttribute('hole.start')!,
                        to: +expression.getAttribute('hole.end')!,
                        hasUnit: expression.getAttribute('hole.unit')! as 'mm',
                    },
                    vertical: {
                        from: +expression.getAttribute('trackerHole')!,
                        hasUnit: 'track'
                    }
                },
            }]
        })
    }

    const assumptions: Assumption[] = []

    const sources: RollCopy[] = []
    const sourcEls = doc.querySelectorAll('source')
    for (const sourceEl of sourcEls) {
        const id = sourceEl.getAttribute('xml:id')
        if (!id) continue

        const newCopy = new RollCopy()
        newCopy.id = id

        const alignments = sourceEl.querySelector('collation')
        if (alignments) {
            for (const operation of alignments.children) {
                if (operation.localName === 'stretching') {
                    newCopy.operations.push({
                        type: 'stretching',
                        factor: +(operation.getAttribute('factor') || 1),
                        id: operation.getAttribute('xml:id') || v4()
                    })
                }
                else if (operation.localName === 'shifting') {
                    newCopy.operations.push({
                        type: 'shifting',
                        horizontal: +(operation.getAttribute('horizontal') || 0),
                        vertical: +(operation.getAttribute('vertical') || 0),
                        id: operation.getAttribute('xml:id') || v4()
                    })
                }
            }
        }

        const edits = sourceEl.querySelectorAll('manualEdit')
        for (const edit of edits) {
            newCopy.addManualEditing({
                id: edit.getAttribute('xml:id') || v4(),
                carriedOutBy: edit.getAttribute('who') || 'unknown',
                hasTimeSpan: {
                    id: v4(),
                    atSomeTimeWithin: edit.getAttribute('when') || 'unknown'
                },
                hasModified: newCopy.physicalItem
            })
        }

        // const allRdgEls = doc.querySelectorAll('rdg')

        newCopy.events = collatedEvents
            .filter(e => {
                console.log(e)
                // TODO 
                return true
            })
            .map(e => {
                return e.wasCollatedFrom[0]
            })
    }

    return {
        collatedEvents,
        assumptions,
        sources
    }
}

