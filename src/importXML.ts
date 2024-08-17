import { v4 } from 'uuid';
import { RollCopy } from './RollCopy'
import { Assumption, CollatedEvent, ExpressionScope, ExpressionType, Reading } from './types'

export type RollEdition = {
    sources: RollCopy[],
    collatedEvents: CollatedEvent[],
    assumptions: Assumption[]
}

const noteAsCollatedEvent = (note: Element): CollatedEvent => {
    return {
        id: note.getAttribute('xml:id')!,
        wasCollatedFrom: [{
            id: v4(),
            type: 'note',
            hasDimension: {
                id: v4(),
                horizontal: {
                    from: +note.getAttribute('horizontal.start')!,
                    to: +note.getAttribute('horizontal.end')!,
                    hasUnit: note.getAttribute('hole.unit')! as 'mm',
                },
                vertical: {
                    from: +note.getAttribute('trackerHole')!,
                    hasUnit: 'track'
                }
            },
            hasPitch: +note.getAttribute('pitch')!
        }]
    }
}

const expressionAsCollatedEvent = (expression: Element): CollatedEvent => {
    return {
        id: expression.getAttribute('xml:id')!,
        wasCollatedFrom: [{
            id: v4(),
            type: 'expression',
            hasScope: expression.getAttribute('scope') as ExpressionScope,
            P2HasType: expression.getAttribute('type') as ExpressionType,
            hasDimension: {
                id: v4(),
                horizontal: {
                    from: +expression.getAttribute('horizontal.start')!,
                    to: +expression.getAttribute('horizontal.end')!,
                    hasUnit: expression.getAttribute('horizontal.hasUnit')! as 'mm',
                },
                vertical: {
                    from: +expression.getAttribute('vertical.from')!,
                    hasUnit: expression.getAttribute('vertical.hasUnit')! as 'mm'
                }
            },
        }]
    }
}

export const importXML = (doc: Document): RollEdition => {
    const collatedEvents: CollatedEvent[] = []

    const notes = doc.querySelectorAll('note')
    const expressions = doc.querySelectorAll('expression')

    collatedEvents.push(...Array.from(notes).map(noteAsCollatedEvent))
    collatedEvents.push(...Array.from(expressions).map(expressionAsCollatedEvent))

    const assumptions: Assumption[] = []

    const sources: RollCopy[] = []
    const sourcEls = doc.querySelectorAll('source')
    for (const sourceEl of sourcEls) {
        const id = sourceEl.getAttribute('xml:id')
        if (!id) continue

        const newCopy = new RollCopy()
        newCopy.id = id

        const alignments = sourceEl.querySelector('collationDesc')
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
                // console.log(e)
                const docEl = Array.from(doc.querySelectorAll('note,expression')).find(event => {
                    event.getAttribute('xml:id') === e.id
                })
                if (!docEl) return true

                const rdg = docEl.closest('rdg')
                if (!rdg) return true

                const sources = rdg.getAttribute('source')
                if (!sources) return true

                const sourcesArr = sources.split(' ')
                return sourcesArr.includes(newCopy.id)
            })
            .map(e => {
                return e.wasCollatedFrom[0]
            })
    }

    const apps = doc.querySelectorAll('app')
    for (const appEl of apps) {
        const readings: Reading[] = []
        const readingEls = appEl.querySelectorAll('rdg')
        for (const readingEl of readingEls) {
            const notes = readingEl.querySelectorAll('note')
            const expressions = readingEl.querySelectorAll('expression')
    
            const contains = []
            contains.push(...Array.from(notes).map(noteAsCollatedEvent))
            contains.push(...Array.from(expressions).map(expressionAsCollatedEvent))
        
            readings.push({
                id: v4(),
                contains
            })
        }

        assumptions.push({
            type: 'relation',
            relates: readings,
            id: appEl.getAttribute('xml:id')!,
            carriedOutBy: '',
        })
    }

    return {
        collatedEvents,
        assumptions,
        sources
    }
}

