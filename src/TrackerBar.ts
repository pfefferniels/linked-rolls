export interface Note {
    type: 'note';
    pitch: number;
}

export type ExpressionScope = 'bass' | 'treble';

export type ExpressionType =
    | 'SustainPedalOn'
    | 'SustainPedalOff'
    | 'SoftPedalOn'
    | 'SoftPedalOff'
    | 'MezzoforteOff'
    | 'MezzoforteOn'
    | 'SlowCrescendoOn'
    | 'SlowCrescendoOff'
    | 'ForzandoOn'
    | 'ForzandoOff'
    | 'MotorOff'
    | 'MotorOn'
    | 'Rewind';

export interface Expression {
    type: 'expression';
    scope: ExpressionScope;
    expressionType: ExpressionType;
}

export abstract class TrackerBar {
    abstract meaningOf(track: number): Note | Expression
}

export class WelteT100 {
    meaningOf(track: number): Note | Expression {
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
            [7, 'SustainPedalOff'],
            [8, 'SustainPedalOn'],
            [9, 'MotorOff'],
            [10, 'MotorOn'],
            [91, 'Rewind'],
            // 92 has no meaning
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
            type: 'note'
        }
    }
}
