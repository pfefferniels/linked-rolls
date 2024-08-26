import { Edition } from './Edition'
import { RollCopy } from './RollCopy'
import { CollatedEvent, ExpressionScope, ExpressionType } from './types'
import { AnyEditorialAction, Reading } from "./EditorialActions"
import { v4 } from 'uuid'

const noteAsCollatedEvent = (note: Element): CollatedEvent => {
    return {
        id: note.getAttribute('xml:id')!,
        wasCollatedFrom: [{
            id: v4(),
            type: 'note',
            hasDimension: {
                id: v4(),
                horizontal: {
                    from: parseFloat(note.getAttribute('horizontal.from')!),
                    to: parseFloat(note.getAttribute('horizontal.to')!),
                    hasUnit: note.getAttribute('horizontal.hasUnit')! as 'mm',
                },
                vertical: {
                    from: +note.getAttribute('vertical.from')!,
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
            hasScope: expression.getAttribute('hasScope') as ExpressionScope,
            P2HasType: expression.getAttribute('P2HasType') as ExpressionType,
            hasDimension: {
                id: v4(),
                horizontal: {
                    from: parseFloat(expression.getAttribute('horizontal.from')!),
                    to: parseFloat(expression.getAttribute('horizontal.to')!),
                    hasUnit: expression.getAttribute('horizontal.hasUnit')! as 'mm',
                },
                vertical: {
                    from: +expression.getAttribute('vertical.from')!,
                    hasUnit: expression.getAttribute('vertical.hasUnit')! as 'track'
                }
            },
        }]
    }
}

export const importXML = (doc: Document): Edition => {
    const edition = new Edition()
    const collatedEvents: CollatedEvent[] = []

    const notes = doc.querySelectorAll('note')
    const expressions = doc.querySelectorAll('expression')

    collatedEvents.push(...Array.from(notes).map((n => noteAsCollatedEvent(n))))
    collatedEvents.push(...Array.from(expressions).map(e => expressionAsCollatedEvent(e)))

    const assumptions: AnyEditorialAction[] = []

    const sources: RollCopy[] = []
    const sourcEls = doc.querySelectorAll('source')
    for (const sourceEl of sourcEls) {
        const sourceXmlId = sourceEl.getAttribute('xml:id')
        if (!sourceXmlId) continue

        const newCopy = new RollCopy()
        sources.push(newCopy)
        newCopy.id = sourceXmlId
        
        const alignments = sourceEl.querySelector('collationDesc')
        if (alignments) {
            for (const operation of alignments.children) {
                const xmlId = operation.getAttribute('xml:id')
                const resp = operation.getAttribute('resp')

                if (operation.localName === 'stretching') {
                    assumptions.push({
                        type: 'stretch',
                        factor: +(operation.getAttribute('factor') || 1),
                        id: xmlId || v4(),
                        carriedOutBy: resp || 'unknown',
                        copy: newCopy.id
                    })
                }
                else if (operation.localName === 'shifting') {
                    assumptions.push({
                        type: 'shift',
                        horizontal: +(operation.getAttribute('horizontal') || 0),
                        vertical: +(operation.getAttribute('vertical') || 0),
                        id: xmlId || v4(),
                        copy: newCopy.id,
                        carriedOutBy: resp || 'unknown'
                    })
                }
            }
        }

        const edits = sourceEl.querySelectorAll('handNote')
        for (const edit of edits) {
            const xmlId = edit.getAttribute('xml:id')
            newCopy.addManualEditing({
                id: xmlId || v4(),
                carriedOutBy: edit.getAttribute('who') || 'unknown',
                hasTimeSpan: {
                    id: v4(),
                    atSomeTimeWithin: edit.getAttribute('when') || 'unknown'
                },
                hasModified: newCopy.physicalItem,
                note: edit.textContent || undefined
            })
        }

        // const allRdgEls = doc.querySelectorAll('rdg')

        newCopy.events = collatedEvents
            .filter(e => {
                const docEl = Array.from(doc.querySelectorAll('note, expression')).find(event => {
                    return event.getAttribute('xml:id') === e.id
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
            const notes = readingEl.querySelectorAll('note, expression')
    
            const contains = []
            for (const note of notes) {
                const ce = collatedEvents.find(ce => ce.id === note.getAttribute('xml:id'))
                if (!ce) continue 
                contains.push(ce)
            }
        
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

    edition.collationResult.events = collatedEvents
    assumptions.forEach(edition.addEditorialAction)
    edition.copies = sources

    edition.copies.forEach(copy => {
        copy.applyActions(assumptions)
    })
    
    return edition
}

