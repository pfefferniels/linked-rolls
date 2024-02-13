const welte100Map = new Map<number, string>(
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

export const typeToKey = (type: string) => {
    for (const entry of welte100Map.entries()) {
        if (entry[1] === type) return entry[0]
    }
}
