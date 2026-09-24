import { describeTrackerBar, Operation, TrackerBar } from "../TrackerBar.js"
import { metersPerMinute, mm } from "../../model/Quantity.js"

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
 * What each T-100 command operates, so that it can be set against the
 * T-98's words for the same function.
 *
 * This cannot be read off the names. The T-100 latches a function on
 * with one perforation and cancels it with a second, while the T-98
 * holds it for as long as one perforation lasts (Hagmann pp. 89 f. and
 * 100–103; Phillips p. 121), and Welte renamed two of the functions
 * between the scales: the red `SlowCrescendo` is the green `Crescendo`,
 * and the red's single `Forzando` valve answers to two green ones that
 * name the end they pull towards. So the correspondence is stated here
 * rather than derived, and only two types that operate one function can
 * stand for each other.
 *
 * `MotorOn`/`MotorOff`, `Rewind` and `ElectricCutOff` are left out on
 * purpose: the green scale has no word for any of them, its motor switch
 * being an automatic mercury contact (Skala-Rolle 98 §12) and its rewind
 * riding on the bass sforzando-piano line. A red command of those kinds
 * has no counterpart and stays a plain deletion.
 */
export const welteT100Operations: Readonly<Partial<Record<WelteT100ExpressionType, Operation>>> = {
    MezzoforteOn: { operates: 'mezzoforte', spelling: 'on', sided: true },
    MezzoforteOff: { operates: 'mezzoforte', spelling: 'off', sided: true },
    SlowCrescendoOn: { operates: 'crescendo', spelling: 'on', sided: true },
    SlowCrescendoOff: { operates: 'crescendo', spelling: 'off', sided: true },
    ForzandoOn: { operates: 'sforzando', spelling: 'on', sided: true },
    ForzandoOff: { operates: 'sforzando', spelling: 'off', sided: true },
    SustainPedalOn: { operates: 'sustainPedal', spelling: 'on', sided: false },
    SustainPedalOff: { operates: 'sustainPedal', spelling: 'off', sided: false },
    SoftPedalOn: { operates: 'softPedal', spelling: 'on', sided: false },
    SoftPedalOff: { operates: 'softPedal', spelling: 'off', sided: false }
}

/**
 * A single added accent on the T-100: a valve latched on and off again
 * straight away.
 */
export const welteT100Accents: readonly (readonly WelteT100ExpressionType[])[] = [
    ['SlowCrescendoOn', 'SlowCrescendoOff'],
    ['ForzandoOn', 'ForzandoOff']
]

/**
 * Welte-Mignon T-100 ("red Welte"), cf. Hagmann, pp. 75 and 178.
 *
 * The note block spans 80 positions from C1 to g⁴, i.e. MIDI 24 to 103.
 * The expression valves are duplicated, bass below the note block and
 * treble above it, in mirrored order. The rolls run at three metres a
 * minute (Phillips 2016, p. 113; Bärtsch 2020 gives 3 or 2.9).
 */
export const welteT100: TrackerBar = describeTrackerBar({
    id: 'welte-t100',
    name: 'Welte-Mignon T100',
    width: mm(328),
    trackCount: 100,
    notes: { from: 11, to: 90, lowestPitch: 24 },
    paperSpeed: { value: metersPerMinute(3), unit: 'm/min' },
    operations: welteT100Operations,
    accents: welteT100Accents,
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
