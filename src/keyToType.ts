import { ExpressionType } from "./RollEvent";

type TechnicalType = 'MotorOff' | 'MotorOn' | 'Rewind' | 'ElectricCutoff'; 

const welte100Map = new Map<number, ExpressionType | TechnicalType>(
    [
        [14, 'MezzoforteOff'],
        [15, 'MezzoforteOn'],
        [16, 'SlowCrescendoOff'],
        [17, 'SlowCrescendoOn'],
        [18, 'ForzandoOff'],
        [19, 'ForzandoOn'],
        [20, 'SoftPedalOff'],
        [21, 'SoftPedalOn'],
        [22, 'MotorOff'],
        [23, 'MotorOn'],
        [104, 'Rewind'],
        [105, 'ElectricCutoff'],
        [106, 'SustainPedalOn'],
        [107, 'SustainPedalOff'],
        [108, 'ForzandoOn'],
        [109, 'ForzandoOff'],
        [110, 'SlowCrescendoOn'],
        [111, 'SlowCrescendoOff'],
        [112, 'MezzoforteOn'],
        [113, 'MezzoforteOff']
    ]
)

export const keyToType = (key: number) => {
    return welte100Map.get(key)
}

export const typeToKey = (type: string, scope?: 'bass' | 'treble') => {
    const entries = Array.from(welte100Map.entries())

    // search the list in reverse, so starting with the treble
    if (scope === 'treble') {
        const match = entries.slice().reverse().find(([_, t]) => t === type)
        if (match) return match[0]
    }
    // if no scope is given or it is bass, search it in normal order
    else {
        const match = entries.find(([_, t]) => t === type)
        if (match) return match[0]
    }
}
