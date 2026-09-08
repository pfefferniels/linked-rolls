import { describeTrackerBar, TrackerBar } from "../../TrackerBar"
import { mm } from "../../Quantity"
import { WelteT100ExpressionType } from "../welteT100/bar"

/**
 * Welte-Mignon (Licensee), the American re-cut of the T-100 rolls on
 * a roll 11¼ inches wide with 98 positions at nine to the inch, cf.
 * Hagmann, p. 40 f. and Phillips, p. 123. It reads the same commands
 * as the T-100 and lays them out the same way, minus the two motor
 * tracks, so the note block and the treble valves sit two positions
 * lower. The layout is the one Stanford's midi2exp reads, checked
 * valve by valve on roll 225 against the T-100 copies.
 */
export const welteLicensee: TrackerBar = describeTrackerBar({
    id: 'welte-licensee',
    name: 'Welte-Mignon (Licensee)',
    width: mm(285.75),
    trackCount: 98,
    notes: { from: 9, to: 88, lowestPitch: 24 },
    expressions: new Map<number, WelteT100ExpressionType>([
        [1, 'MezzoforteOff'],
        [2, 'MezzoforteOn'],
        [3, 'SlowCrescendoOff'],
        [4, 'SlowCrescendoOn'],
        [5, 'ForzandoOff'],
        [6, 'ForzandoOn'],
        [7, 'SoftPedalOff'],
        [8, 'SoftPedalOn'],
        [89, 'Rewind'],
        [90, 'ElectricCutOff'],
        [91, 'SustainPedalOn'],
        [92, 'SustainPedalOff'],
        [93, 'ForzandoOn'],
        [94, 'ForzandoOff'],
        [95, 'SlowCrescendoOn'],
        [96, 'SlowCrescendoOff'],
        [97, 'MezzoforteOn'],
        [98, 'MezzoforteOff']
    ])
})
