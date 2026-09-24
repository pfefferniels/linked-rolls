import { Concept } from "./Agent.js";
import { ObjectAssumption } from "./Assumption.js";
import { ConditionState } from "./ConditionState.js";
import { Measure, Millimeters } from "./Quantity.js";
import { WithId, WithType } from "../shared/utils.js";

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
 * How the punches of a perforator were driven, after Phillips (2016,
 * pp. 112 f.): all at once by one ram head, or each by a driver of its
 * own. `ontology/types.ttl` defines them, and a test holds this list
 * against it.
 * @see crm:E55 Type
 */
export const drives = [
    { id: 'https://w3id.org/reo/type/drive/ram-head', name: 'ram head' },
    { id: 'https://w3id.org/reo/type/drive/asynchronous', name: 'asynchronous' }
] as const satisfies readonly Concept[]

export type DriveId = typeof drives[number]['id']

/**
 * A drive, named by its IRI alone.
 * @see crm:E55 Type
 */
export interface Drive {
    /** The IRI the type vocabulary gives the drive. */
    readonly id: DriveId
}

/**
 * The machine that punched the copy. It stands for this production
 * alone. Whether it is the one another copy was punched on is left to a
 * statement of identity made about it elsewhere, which its id allows.
 * @see crm:E22 Human-Made Object
 */
export interface Perforator extends WithType<'Perforator'>, WithId {
    /**
     * How its punches were driven, as the rows of its chains show it:
     * in line across the tracks where one ram head drove them all, and
     * staggered where each punch had a driver of its own. It is part of
     * how the machine was built and so no part of its setting.
     * @see reo:drive
     */
    drive?: ObjectAssumption<Drive>

    /**
     * @see crm:P44 has condition
     */
    condition?: PerforatorSetting
}
