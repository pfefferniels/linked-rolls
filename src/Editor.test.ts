import { describe, expect, it } from 'vitest'
import { Editor } from './Editor';
import { CollatedEvent } from './.ldo/rollo.typings';

describe('Editor', () => {
    const editor = new Editor()

    it('makes a relative placement of two events', async () => {
        const event1: CollatedEvent = {
            type: 'CollatedEvent',
            wasCollatedFrom: [{
                'type': 'Note',
                'P43HasDimension': {
                    'from': 20,
                    'to': 22,
                    'P91HasUnit': 'mm',
                    'type': 'EventSpan'
                },
                'hasPitch': 60
            }, 
            {
                'type': 'Note',
                'P43HasDimension': {
                    'from': 21,
                    'to': 22,
                    'P91HasUnit': 'mm',
                    'type': 'EventSpan'
                },
                'hasPitch': 60
            }]
        }

        const event2: CollatedEvent = {
            type: 'CollatedEvent',
            wasCollatedFrom: [{
                'type': 'Note',
                'P43HasDimension': {
                    'from': 20.5,
                    'to': 23,
                    'P91HasUnit': 'mm',
                    'type': 'EventSpan'
                },
                'hasPitch': 60
            }]
        }

        editor
            .makePlacement()
            .where(event1)
            .startsBeforeTheStartOf(event2)
        
        expect(editor.assumptions).toHaveLength(1)
    })

    it('makes tempo adjustments to physical rolls', async () => {

    })
})
