import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { edition } from './editionFixture'
import { symbolIn } from '../src/lookup/lookup'
import { AnyCommand } from '../src/model/Symbol'
import { Edition } from '../src/model/Edition'
import { placeCommand, removeSymbols } from '../src/ops'
import { reading } from '../src/ops/draft'

const commandIn = (e: Edition, id: string) =>
    symbolIn(e, id) as AnyCommand

/**
 * An operation that reads the edition reads the draft it is applied to,
 * and several operations may run on one draft. One that runs after
 * another has changed the draft must not act on what stood there before.
 */
describe('operations run one after another on one draft', () => {
    it('act on the draft as it stands, not as it stood before', () => {
        const e = edition()
        const next = produce(e, draft => {
            // Takes the first insertion out, so every later one moves up.
            removeSymbols('A', ['note'])(draft)
            placeCommand('other-note', 'forzando-off', 'before')(draft)
        })

        expect(commandIn(next, 'other-note').before?.id).toBe('forzando-off')
        expect(commandIn(next, 'forzando-off').before).toBeUndefined()
    })

    it('read a draft nothing has changed as the state it was drafted from', () => {
        const e = edition()
        let read: Edition | undefined
        produce(e, reading(state => { read = state; return () => undefined }))
        expect(read).toBe(e)
    })

    it('read a draft something has changed as it stands', () => {
        const e = edition()
        let read: Edition | undefined
        produce(e, draft => {
            removeSymbols('A', ['note'])(draft)
            reading(state => { read = state; return () => undefined })(draft)
        })
        expect(read).not.toBe(e)
        expect(symbolIn(read!, 'note')).toBeUndefined()
    })

    it('place a command on a draft nothing has changed', () => {
        const e = edition()
        const next = produce(e, placeCommand('other-note', 'forzando-off', 'before'))
        expect(commandIn(next, 'other-note').before?.id).toBe('forzando-off')
    })
})
