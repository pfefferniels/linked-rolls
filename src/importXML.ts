import { RollCopy } from './RollCopy'
import { Assumption, CollatedEvent, ExpressionScope, ExpressionType, Reading } from './types'
import { v4 } from 'uuid'

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

    collatedEvents.push(...Array.from(notes).map((n => noteAsCollatedEvent(n))))
    collatedEvents.push(...Array.from(expressions).map(e => expressionAsCollatedEvent(e)))

    const assumptions: Assumption[] = []

    const sources: RollCopy[] = []
    const sourcEls = doc.querySelectorAll('source')
    for (const sourceEl of sourcEls) {
        const sourceXmlId = sourceEl.getAttribute('xml:id')
        if (!sourceXmlId) continue

        const newCopy = new RollCopy()
        newCopy.id = sourceXmlId

        const alignments = sourceEl.querySelector('collationDesc')
        if (alignments) {
            for (const operation of alignments.children) {
                const xmlId = operation.getAttribute('xml:id')
                if (operation.localName === 'stretching') {
                    newCopy.operations.push({
                        type: 'stretching',
                        factor: +(operation.getAttribute('factor') || 1),
                        id: xmlId || v4()
                    })
                }
                else if (operation.localName === 'shifting') {
                    newCopy.operations.push({
                        type: 'shifting',
                        horizontal: +(operation.getAttribute('horizontal') || 0),
                        vertical: +(operation.getAttribute('vertical') || 0),
                        id: xmlId || v4()
                    })
                }
            }
        }

        const edits = sourceEl.querySelectorAll('manualEdit')
        for (const edit of edits) {
            const xmlId = edit.getAttribute('xml:id')
            newCopy.addManualEditing({
                id: xmlId || v4(),
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
            contains.push(...Array.from(notes).map(n => noteAsCollatedEvent(n)))
            contains.push(...Array.from(expressions).map(n => expressionAsCollatedEvent(n)))
        
            readings.push({
                id: v4(),
                contains
            })
        }

        const appXmlId = appEl.getAttribute('xml:id')
        assumptions.push({
            type: 'relation',
            relates: readings,
            id: appXmlId || v4(),
            carriedOutBy: appEl.getAttribute('resp') || 'unknown',
        })
    }

    return {
        collatedEvents,
        assumptions,
        sources
    }
}

