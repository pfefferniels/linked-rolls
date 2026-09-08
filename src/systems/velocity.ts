/**
 * How bellows travel becomes a MIDI velocity.
 *
 * Shared by every Welte system rather than declared per system, and that is a
 * decision about comparability rather than about accuracy. The point of running
 * a red issue and a green issue of one recording through two emulators is to
 * attribute the difference between them to the coding. If the two systems used
 * two velocity maps, the difference between the maps would dominate and the
 * comparison would measure the maps.
 *
 * Nothing in either mechanism determines the map. These three anchors are
 * midi2exp's published velocities, joined linearly with the middle one at the
 * Mezzoforte pin of the half in question, and they are what the T-100's
 * published results were produced with. Two independent implementations
 * disagree with them and may well be right: Stahnke gives `v_h = K_s √(w − W_s)`
 * for vacuum to hammer velocity and `V_MIDI = round(52 + 25 log₂ v_h)` for
 * velocity to MIDI, and Phillips and Gosden's *Rollmidi*, in the same volume,
 * uses an explicitly logarithmic curve; Phillips's own bench measurement has the
 * suction-to-velocity relation "essentially logarithmic" (pp. 215 f.). The
 * default should change only once a red/green comparison has been run both ways
 * and the difference measured, and then for both systems at once.
 */

export type VelocityMap = {
    piano: number
    mezzoforte: number
    forte: number
}

/** midi2exp's three velocities, which is what the T-100's published results used. */
export const defaultVelocityMap: VelocityMap = { piano: 35, mezzoforte: 60, forte: 90 }

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/**
 * The map joined linearly through its three anchors, with the middle one at the
 * Mezzoforte pin of the half in question.
 */
export const velocityOf = (travel: number, hook: number, map: VelocityMap): number => {
    const position = clamp(travel, 0, 1)
    if (position <= hook) {
        return map.piano + (position / hook) * (map.mezzoforte - map.piano)
    }
    return map.mezzoforte + ((position - hook) / (1 - hook)) * (map.forte - map.mezzoforte)
}
