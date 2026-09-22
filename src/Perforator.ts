import { ObjectAssumption } from "./Assumption.js";
import { ConditionState } from "./ConditionState.js";
import { Measure, Millimeters } from "./Quantity.js";
import { WithId } from "./utils.js";

/**
 * The pitch in the engineering sense: the distance along the roll from
 * one punch of a chain to the next, which is the slot one firing cut
 * together with the bridge of paper left before the next. It is taken
 * on held notes, whose chains repeat it, as the median over them. It
 * runs along the roll, and is another thing than the hole separation,
 * which is the distance across the roll from one track to the next.
 * @see crm:E54 Dimension
 */
export interface ChainPitch extends Measure<'mm'> {
    /**
     * The length along the roll of one slot of a chain.
     * @see reo:slot
     */
    slot?: Millimeters

    /**
     * The paper left standing between two slots of a chain. Slot and
     * bridge are medians of their own and need not add up to the pitch.
     * @see reo:bridge
     */
    bridge?: Millimeters

    /**
     * How many pitches the median was taken over.
     * @see reo:sampleSize
     */
    n?: number
}

/**
 * The step by which the perforator moved the paper on, read as the
 * period the lengths of the slots keep: a slot is the punch together
 * with a whole number of steps, so its lengths fall on a comb of this
 * spacing.
 * @see crm:E54 Dimension
 */
export interface Advance extends Measure<'mm'> {
    /**
     * How closely the lengths keep the period, from 0 where they scatter
     * to 1 where every one falls on the comb: the mean resultant length
     * of the lengths folded onto it. A period found weakly is the result
     * of a search all the same; the belief it is stated with says how far
     * it is held to be the machine's step.
     * @see reo:strength
     */
    strength?: number

    /**
     * How many slot lengths were folded.
     * @see reo:sampleSize
     */
    n?: number
}

/**
 * How the perforator was set when it punched the copy, as far as the
 * perforations show it. No time is stated: how long a machine kept a
 * setting is for a comparison across rolls to find out.
 * @see crm:E3 Condition State
 */
export interface PerforatorSetting extends ConditionState<'setting'> {
    /**
     * The diameter of the round punch. Taken across the roll, it is the
     * one value of the setting that neither the scale along the roll nor
     * the shrinkage of the paper enters.
     * @see reo:punchDiameter
     */
    punchDiameter?: ObjectAssumption<Measure<'mm'>>

    /**
     * @see reo:chainPitch
     */
    chainPitch?: ObjectAssumption<ChainPitch>

    /**
     * @see reo:advance
     */
    advance?: ObjectAssumption<Advance>
}

/**
 * The machine that punched the copy. It stands for this production
 * alone. Whether it is the one another copy was punched on is left to a
 * statement of identity made about it elsewhere, which its id allows.
 * @see crm:E22 Human-Made Object
 */
export interface Perforator extends WithId {
    /**
     * @see crm:P44 has condition
     */
    condition?: PerforatorSetting
}
