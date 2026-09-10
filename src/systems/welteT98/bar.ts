import { describeTrackerBar, TrackerBar } from "../../TrackerBar"
import { metersPerMinute, mm } from "../../Quantity"

/**
 * The commands of the Welte-Mignon T-98, as its tracker bar reads them.
 *
 * They are not the T-100's. Where the T-100 latches a function on with
 * one perforation and cancels it with a second, the T-98 holds it for
 * as long as one continuous perforation lasts (Hagmann, pp. 89 f. and
 * 100–103; Phillips, p. 121), so none of these is an On or an Off. The
 * two sforzando valves name the end of the range they pull towards.
 */
export const welteT98ExpressionTypes = [
    'SforzandoPiano',
    'SforzandoForte',
    'Mezzoforte',
    'Crescendo',
    'SustainPedal',
    'SoftPedal'
] as const

export type WelteT98ExpressionType = typeof welteT98ExpressionTypes[number]

/**
 * Welte-Mignon T-98 ("green Welte"), cf. Hagmann, Anhang 11 (p. 179)
 * and Phillips, p. 121.
 *
 * 98 positions at nine to the inch on paper 286 mm wide, five expression
 * valves on each side and 88 note positions between them, A0 to c⁵ (MIDI
 * 21 to 108). A roll re-cut from a Mignon master uses only the middle 80
 * of those, C1 to g⁴, which is the T-100's compass.
 *
 * The rewind is not a valve of its own: a long perforation on the bass
 * sforzando-piano position drives it, which is why that position is
 * named for the valve and the rewind stated separately.
 *
 * Measured against Julian Dyer's scan of the T-98 copy of roll 225
 * (Grünfeld, Träumerei): 98 columns 2.818 mm apart on paper 285.6 mm
 * wide, notes on the middle 80 columns, the sustain valve punched 52
 * times in the music where the T-100 copy latches its sustain on 52
 * times. A 53rd perforation on that track belongs to the test pattern
 * after the rewind.
 *
 * The paper speed is the Deutsches Museum's figure for its Welte grün /
 * T 98 rolls, 220 cm/min. Phillips gives 7 ft/min = 2.134 m/min (p. 121);
 * midi2exp's and PlaySK's green defaults of 72.2 and 72.27, read as the
 * Stanford convention of feet per minute times ten, are 2.201 m/min, which
 * is the museum's figure; and the two copies of roll 225 last the same
 * time if the green starts at about 7.30 ft/min. Welte's own booklets give
 * no speed, only that the roll must run from the first "A" of the chromatic
 * scale to the cross-line bearing the dial number in half a minute
 * (Skala-Rolle 98 §1b). This is documentation; what sets the emulator's
 * time axis is the spool.
 */
export const welteT98: TrackerBar = describeTrackerBar({
    id: 'welte-green',
    name: 'Welte-Mignon T98',
    width: mm(286),
    trackCount: 98,
    notes: { from: 6, to: 93, lowestPitch: 21 },
    paperSpeed: { value: metersPerMinute(2.2), unit: 'm/min' },
    rewindTrack: 1,

    /**
     * The T-98 gives the rewind no line of its own — Welte's Forzando P line
     * doubles as it — so a perforation there is the rewind only when it is far
     * longer than the command that line usually carries. On the Monteurscala
     * the rewind is a single continuous 103.8 mm perforation (Kontrolle 10, 40
     * punches with gaps of 0.51–0.93 mm), where a commanded sforzando-piano
     * runs a couple of millimetres — a median of 0.06 s against the rewind's
     * 10.2 s on WM 184. 40 mm sits between the two with a wide margin either
     * side, so the threshold is not a fitted number and does not need to be.
     */
    rewindHold: mm(40),
    expressions: new Map<number, WelteT98ExpressionType>([
        [1, 'SforzandoPiano'],
        [2, 'Mezzoforte'],
        [3, 'SustainPedal'],
        [4, 'Crescendo'],
        [5, 'SforzandoForte'],
        [94, 'SforzandoForte'],
        [95, 'Crescendo'],
        [96, 'SoftPedal'],
        [97, 'Mezzoforte'],
        [98, 'SforzandoPiano']
    ])
})
