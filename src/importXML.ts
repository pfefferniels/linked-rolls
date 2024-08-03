import { v4 } from 'uuid';
import { RollCopy } from './RollCopy'
import { Assumption, CollatedEvent, ExpressionScope, ExpressionType } from './types'

export const importXML = (doc: Document) => {
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
                    from: +note.getAttribute('hole.start')!,
                    to: +note.getAttribute('hole.end')!,
                    hasUnit: note.getAttribute('hole.unit')! as 'mm',
                },
                trackerHole: +note.getAttribute('trackerHole')!,
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
                    from: +expression.getAttribute('hole.start')!,
                    to: +expression.getAttribute('hole.end')!,
                    hasUnit: expression.getAttribute('hole.unit')! as 'mm',
                },
                trackerHole: +expression.getAttribute('trackerHole')!,
            }]
        })
    }

    const assumptions: Assumption[] = []
    const sources: RollCopy[] = []

    return {
        collatedEvents,
        assumptions,
        sources
    }
}

