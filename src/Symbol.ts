import { idOf, ReferenceAssumption } from "./Assumption";
import { WithId } from "./utils";

/**
 * A symbol is an abstract musical or textual entity carried by one or more
 * physical features on the roll. Symbols are the result of interpreting
 * the physical features (holes, writings, etc.) on the roll copies.
 * @see crm:E90 Symbolic Object
 */
export interface Symbol<T extends string> extends WithId {
    type: T

    /**
     * References to the physical features (e.g. holes) on the roll copies
     * that carry this symbol. Since the association might be debatable,
     * it can be annotated. There might be e.g. doubts about the meaning
     * and correct transcription of a feature on a physical roll.
     * This points to a feature by its `@id`.
     * @see crm:P128i is carried by
     */
    carriers: ReferenceAssumption[]
}

export const isSymbol = (object: any): object is AnySymbol => {
    return (
        'type' in object
        && (object.type === 'note' || object.type === 'expression' || object.type === 'text')
    );
}

/**
 * A perforation is a symbol that is typically encoded as a single punched
 * hole or a group of punched holes in the physical carrier.
 * However, it might also have different physical appearences.
 * @see reo:Perforation
 */
export interface Perforation<T extends string> extends Symbol<T> {
    /**
     * In piano rolls, perforations are often aligned with other
     * perforations, e.g. a "crescendo off" might be logically
     * aligned to the start of a note perforation. This points
     * to the perforation by its `@id`.
     * @see reo:alignedWith
     */
    alignedWith?: ReferenceAssumption;

    /**
     * The perforation this one forms a pair with, e.g. a "forzando on"
     * with its "forzando off". Any two perforations may be paired.
     * The distance between the two is fixed: whatever displaces the
     * one displaces the other. The relation is symmetric and is stated
     * on one side only. This points to the perforation by its `@id`.
     * @see reo:pairedWith
     */
    pairedWith?: ReferenceAssumption;
}

type Pairable = WithId & { pairedWith?: ReferenceAssumption }

/**
 * The pairs among the given perforations, each once and in the order
 * the pairing is stated. A pair whose partner is absent is left out.
 */
export const pairsAmong = <S extends Pairable>(perforations: readonly S[]): [S, S][] => {
    const byId = new Map(perforations.map(p => [p.id, p]))
    return perforations
        .filter((p): p is S & Required<Pairable> => p.pairedWith !== undefined)
        .map((p): [S, S | undefined] => [p, byId.get(idOf(p.pairedWith))])
        .filter((pair): pair is [S, S] => pair[1] !== undefined)
}

/**
 * A note symbol, representing a single pitched musical event on the roll.
 * The pitch is encoded via the tracker bar position (track number).
 * @see reo:Note
 */
export interface Note extends Perforation<'note'> {
    /**
     * The MIDI pitch number of the note (e.g. 60 for middle C).
     * @see reo:pitch
     */
    pitch: number;
}

/**
 * The scope of an expression perforation, indicating whether it
 * applies to the bass or treble register of the piano.
 * @see reo:scope
 */
export type ExpressionScope = 'bass' | 'treble';

/**
 * The type of expression encoded by a perforation on the roll,
 * e.g. "crescendo on", "crescendo off", etc. on Welte T-100
 * rolls.
 * @see crm:P2 has type
 */
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
    | 'Rewind'
    | 'ElectricCutOff';

/**
 * An expression symbol, representing a perforation on the roll
 * that governs dynamics, pedaling, or mechanical functions of the
 * reproducing piano. Each expression has a scope (bass or treble)
 * and a specific expression type.
 * @see reo:Expression
 */
export interface Expression extends Perforation<'expression'> {
    /**
     * Whether this expression applies to the bass or treble register.
     * @see reo:scope
     */
    scope: ExpressionScope;

    /**
     * The specific type of expression (e.g. sustain pedal, forzando, etc.).
     * @see crm:P2 has type
     */
    expressionType: ExpressionType;
}

/**
 * A textual symbol, e.g. a label or annotation found on the roll.
 * @see crm:E33 Linguistic Object
 */
export interface Text extends Symbol<'text'> {
    // Restated so that Omit<Text, …> keeps the literal in the schema.
    type: 'text';

    /**
     * The text content of the symbol.
     * @see crm:P190 has symbolic content
     */
    text: string;
}

/**
 * A symbol can be either a note, an expression, or a text.
 * Notes and expressions are perforations; texts are carried by writings.
 */
export type AnySymbol =
    | Note
    | Expression
    | Text

