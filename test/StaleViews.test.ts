import { describe, expect, it } from 'vitest'
import { produce } from 'immer'
import { edition } from './editionFixture'
import { EditionView } from '../src/view/EditionView'
import { AnyCommand } from '../src/model/Symbol'
import { Edition } from '../src/model/Edition'
import { placeCommand, removeSymbols } from '../src/ops'
import { reading } from '../src/ops/draft'

const commandIn = (e: Edition, id: string) =>
    new EditionView(e).symbol(id) as AnyCommand

/**
 * An operation that reads the edition takes a view of it, and several
 * operations may run on one draft. One that runs after another has
 * changed the draft must not act on what the view says stood there.
 */
describe('operations run one after another on one draft', () => {
    it('act on the draft as it stands, not as the view saw it', () => {
        const e = edition()
        const view = new EditionView(e)
        const next = produce(e, draft => {
            // Takes the first insertion out, so every later one moves up.
            removeSymbols('A', ['note'])(draft)
            placeCommand(view, 'other-note', 'forzando-off', 'before')(draft)
        })

        expect(commandIn(next, 'other-note').before?.id).toBe('forzando-off')
        expect(commandIn(next, 'forzando-off').before).toBeUndefined()
    })

    it('take no second view of a draft nothing has changed', () => {
        const e = edition()
        const view = new EditionView(e)
        let used: EditionView | undefined
        produce(e, reading(view, fresh => { used = fresh; return () => undefined }))
        expect(used).toBe(view)
    })

    it('reuse the view where nothing has changed', () => {
        const e = edition()
        const next = produce(e, placeCommand(new EditionView(e), 'other-note', 'forzando-off', 'before'))
        expect(commandIn(next, 'other-note').before?.id).toBe('forzando-off')
    })
})
