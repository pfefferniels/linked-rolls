import { describe, expect, it } from 'vitest'
import { AnySymbol, Expression } from '../src/Symbol'
import { HorizontalSpan } from '../src/Feature'
import { mm } from '../src/Quantity'
import { commandOf, substitutionsBetween } from '../src/substitution'

const at = (from: number, to: number): HorizontalSpan => ({ unit: 'mm', from: mm(from), to: mm(to) })

const places = new Map<string, HorizontalSpan>()

const command = (id: string, expressionType: string, scope: 'bass' | 'treble', from: number, to: number): Expression => {
    places.set(id, at(from, to))
    return { type: 'expression', id, expressionType, scope, carriers: [] }
}

const locate = (symbol: AnySymbol) => places.get(symbol.id)

describe('what a Welte command operates', () => {
    it('puts the red and the green word for one function together', () => {
        expect(commandOf('SlowCrescendoOn')?.operates).toBe('crescendo')
        expect(commandOf('Crescendo')?.operates).toBe('crescendo')
        expect(commandOf('SlowCrescendoOn')?.spelling).toBe('on')
        expect(commandOf('Crescendo')?.spelling).toBe('held')
    })

    it('answers the red sforzando with both green ones', () => {
        expect(commandOf('ForzandoOn')?.operates).toBe('sforzando')
        expect(commandOf('SforzandoForte')?.operates).toBe('sforzando')
        expect(commandOf('SforzandoPiano')?.operates).toBe('sforzando')
    })

    it('knows nothing of a command the green scale has no word for', () => {
        expect(commandOf('MotorOn')).toBeUndefined()
        expect(commandOf('Rewind')).toBeUndefined()
        expect(commandOf('ElectricCutOff')).toBeUndefined()
    })
})

describe('substituting a held perforation for a latched pair', () => {
    it('pairs a green crescendo with the red pair it stands for', () => {
        const on = command('on', 'SlowCrescendoOn', 'bass', 1000, 1002)
        const off = command('off', 'SlowCrescendoOff', 'bass', 1200, 1202)
        const held = command('held', 'Crescendo', 'bass', 1000, 1200)

        const [substitution, ...rest] = substitutionsBetween([held], [on, off], locate)
        expect(rest).toEqual([])
        expect(substitution.by.id).toBe('held')
        expect(substitution.replaced.map(symbol => symbol.id)).toEqual(['on', 'off'])
    })

    /**
     * The T-100 puts both pedals on the treble, the T-98 splits them,
     * sustain on the bass and soft on the treble, so a rule that
     * compared sides would leave every pedal unpaired.
     */
    it('pairs the pedals across the edges they sit on', () => {
        const on = command('on', 'SustainPedalOn', 'treble', 500, 502)
        const off = command('off', 'SustainPedalOff', 'treble', 700, 702)
        const held = command('held', 'SustainPedal', 'bass', 500, 700)

        expect(substitutionsBetween([held], [on, off], locate)).toHaveLength(1)
    })

    it('keeps the dynamics to their own half of the keyboard', () => {
        const on = command('on', 'MezzoforteOn', 'bass', 100, 102)
        const off = command('off', 'MezzoforteOff', 'bass', 200, 202)
        const held = command('held', 'Mezzoforte', 'treble', 100, 200)

        expect(substitutionsBetween([held], [on, off], locate)).toEqual([])
    })

    it('leaves a red command the green scale cannot say alone', () => {
        const motorOn = command('motor-on', 'MotorOn', 'bass', 10, 12)
        const motorOff = command('motor-off', 'MotorOff', 'bass', 20, 22)

        expect(substitutionsBetween([], [motorOn, motorOff], locate)).toEqual([])
    })

    it('does not pair one that spans another stretch of the roll', () => {
        const on = command('on', 'SlowCrescendoOn', 'bass', 1000, 1002)
        const off = command('off', 'SlowCrescendoOff', 'bass', 1200, 1202)
        const elsewhere = command('held', 'Crescendo', 'bass', 1000, 1400)

        expect(substitutionsBetween([elsewhere], [on, off], locate)).toEqual([])
    })

    it('reports neither where two held perforations answer one pair', () => {
        const on = command('on', 'SlowCrescendoOn', 'bass', 1000, 1002)
        const off = command('off', 'SlowCrescendoOff', 'bass', 1200, 1202)
        const one = command('one', 'Crescendo', 'bass', 1000, 1200)
        const other = command('other', 'Crescendo', 'bass', 1001, 1201)

        expect(substitutionsBetween([one, other], [on, off], locate)).toEqual([])
    })

    /**
     * A second On while the function already stands is redundant, so the
     * interval began at the first. This is how a red copy reads that
     * carries two Ons and only one Off, which all three copies of Welte
     * 225 do near the end of the roll.
     */
    it('runs a latched interval from the first On, a second being redundant', () => {
        const first = command('first-on', 'ForzandoOn', 'treble', 300, 302)
        const second = command('second-on', 'ForzandoOn', 'treble', 340, 342)
        const off = command('off', 'ForzandoOff', 'treble', 400, 402)
        const held = command('held', 'SforzandoForte', 'treble', 300, 400)

        const [substitution, ...rest] = substitutionsBetween([held], [first, second, off], locate)

        expect(rest).toEqual([])
        expect(substitution.replaced.map(symbol => symbol.id)).toEqual(['first-on', 'off'])
    })

    /**
     * The green coder chose between two sforzando valves where the red
     * has one, and which he chose is on the paper rather than ours to
     * work out. Both are read as answering the red pair.
     */
    it('takes whichever sforzando the green coder punched', () => {
        const on = command('on', 'ForzandoOn', 'treble', 800, 802)
        const off = command('off', 'ForzandoOff', 'treble', 900, 902)
        const piano = command('piano', 'SforzandoPiano', 'treble', 800, 900)

        const [substitution] = substitutionsBetween([piano], [on, off], locate)
        expect(substitution.by.expressionType).toBe('SforzandoPiano')
    })

    it('says nothing of a latched pair the newer version keeps latched', () => {
        const on = command('on', 'MezzoforteOn', 'bass', 100, 102)
        const off = command('off', 'MezzoforteOff', 'bass', 200, 202)
        const stillLatched = command('still', 'MezzoforteOn', 'bass', 100, 102)

        expect(substitutionsBetween([stillLatched], [on, off], locate)).toEqual([])
    })
})
