import { describeTrackerBar, TrackerBar } from "../../TrackerBar"
import { mm } from "../../Quantity"

/**
 * The commands of the Welte-Mignon T-100, as its tracker bar reads them.
 */
export const welteT100ExpressionTypes = [
    'SustainPedalOn',
    'SustainPedalOff',
    'SoftPedalOn',
    'SoftPedalOff',
    'MezzoforteOff',
    'MezzoforteOn',
    'SlowCrescendoOn',
    'SlowCrescendoOff',
    'ForzandoOn',
    'ForzandoOff',
    'MotorOff',
    'MotorOn',
    'Rewind',
    'ElectricCutOff'
] as const

export type WelteT100ExpressionType = typeof welteT100ExpressionTypes[number]

/**
 * Welte-Mignon T-100 ("red Welte"), cf. Hagmann, pp. 75 and 178.
 *
 * The note block spans 80 positions from C1 to g⁴, i.e. MIDI 24 to 103.
 * The expression valves are duplicated, bass below the note block and
 * treble above it, in mirrored order.
 */
export const welteT100: TrackerBar = describeTrackerBar({
    id: 'welte-t100',
    name: 'Welte-Mignon T100',
    width: mm(328),
    trackCount: 100,
    notes: { from: 11, to: 90, lowestPitch: 24 },
    expressions: new Map<number, WelteT100ExpressionType>([
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
})
