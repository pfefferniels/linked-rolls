import { Expression, ExpressionType, Note } from "./Symbol"

export abstract class TrackerBar {
    abstract meaningOf(track: number): Partial<Note> | Partial<Expression>
}

export class WelteT100 {
    meaningOf(track: number):
        Pick<Note, 'type' | 'pitch'> | Pick<Expression, 'type' | 'expressionType' | 'scope'> {
        if (track <= 0 || track > 100) {
            throw new Error('Track out of range')
        }

        // Cf. Hagmann, p. 178
        const expressionMap = new Map<number, ExpressionType>([
            [1, 'MezzoforteOff'],
            [2, 'MezzoforteOn'],
            [3, 'SlowCrescendoOff'],
            [4, 'SlowCrescendoOn'],
            [5, 'ForzandoOff'],
            [6, 'ForzandoOn'],
            [7, 'SoftPedalOff'],
            [8, 'SoftPedalOn'],
            [9, 'MotorOff'],
            [10, 'MotorOn'],
            [91, 'Rewind'],
            [92, 'ElectricCutOff'],
            [93, 'SustainPedalOn'],
            [94, 'SustainPedalOff'],
            [95, 'ForzandoOn'],
            [96, 'ForzandoOff'],
            [97, 'SlowCrescendoOn'],
            [98, 'SlowCrescendoOff'],
            [99, 'MezzoforteOn'],
            [100, 'MezzoforteOff']
        ])

        if (track <= 10 || track >= 91) {
            const scope = track <= 10 ? 'bass' : 'treble'
            return {
                expressionType: expressionMap.get(track)!,
                scope,
                type: 'expression'
            }
        }

        // C1-G4 = track 11-90 = 24-103 in MIDI keys
        return {
            pitch: track + 13,
            type: 'note',
        }
    }
}
