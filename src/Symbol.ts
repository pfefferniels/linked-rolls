import { idOf, ReferenceAssumption } from "./Assumption.js";
import { WithId } from "./utils.js";

/**
 * A symbol is an abstract musical or textual entity carried by one or more
 * physical features on the roll. Symbols are the result of interpreting
 * the physical features (chains of holes, writings, etc.) on the roll copies.
 * @see crm:E90 Symbolic Object
 */
export interface Symbol<T extends string> extends WithId {
    type: T

    /**
     * References to the physical features (e.g. chains of holes) on the roll copies
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

export const isCommand = (symbol: object | undefined): symbol is AnyCommand =>
    symbol !== undefined && 'type' in symbol && (symbol.type === 'note' || symbol.type === 'expression')

/**
 * A command is what the tracker bar reads from a chain of holes: the
 * note it sounds, or the function it operates. It is typically carried
 * by such a chain, but it might also have different physical
 * appearances.
 * @see reo:Command
 */
export interface Command<T extends string> extends Symbol<T> {
    /**
     * In piano rolls, commands are often aligned with other commands,
     * e.g. a "crescendo off" might be logically aligned to the start of
     * a note. This points to the command by its `@id`.
     * @see reo:alignedWith
     */
    alignedWith?: ReferenceAssumption;

    /**
     * A command whose onset this one precedes when the roll is
     * performed, without saying by how much: a "crescendo off" ends
     * before the note it leads to begins, even where the copies
     * disagree on it. Where the measurement has it so, nothing moves;
     * where it does not, this one is placed before the reference as
     * far as the copies that agree put it. This points to the command
     * by its `@id`.
     * @see reo:before
     */
    before?: ReferenceAssumption;

    /**
     * A command whose onset this one follows when the roll is
     * performed, the counterpart of `before`. This points to the
     * command by its `@id`.
     * @see reo:after
     */
    after?: ReferenceAssumption;

    /**
     * The command this one forms a pair with, e.g. a "forzando on"
     * with its "forzando off". Any two commands may be paired.
     * The distance between the two is fixed: whatever displaces the
     * one displaces the other. The relation is symmetric and is stated
     * on one side only. This points to the command by its `@id`.
     * @see reo:pairedWith
     */
    pairedWith?: ReferenceAssumption;
}

export const placementRelations = ['alignedWith', 'before', 'after'] as const

/** The ways a command may be placed relative to another. */
export type PlacementRelation = typeof placementRelations[number]

type Placeable = Partial<Record<PlacementRelation, ReferenceAssumption>>

export type Placement = { relation: PlacementRelation; reference: ReferenceAssumption }

/**
 * The statements placing a command relative to others, alignment first.
 * A command is meant to make one at most; the first is the one a
 * performance applies.
 */
export const placementsOf = (command: Placeable): Placement[] =>
    placementRelations.flatMap(relation => {
        const reference = command[relation]
        return reference ? [{ relation, reference }] : []
    })

type Pairable = WithId & { pairedWith?: ReferenceAssumption }

/**
 * The pairs among the given commands, each once and in the order the
 * pairing is stated. A pair whose partner is absent is left out.
 */
export const pairsAmong = <S extends Pairable>(commands: readonly S[]): [S, S][] => {
    const byId = new Map(commands.map(p => [p.id, p]))
    return commands
        .filter((p): p is S & Required<Pairable> => p.pairedWith !== undefined)
        .map((p): [S, S | undefined] => [p, byId.get(idOf(p.pairedWith))])
        .filter((pair): pair is [S, S] => pair[1] !== undefined)
}

/**
 * A note symbol, representing a single pitched musical event on the roll.
 * The pitch is encoded via the tracker bar position (track number).
 * @see reo:Note
 */
export interface Note extends Command<'note'> {
    /**
     * The MIDI pitch number of the note (e.g. 60 for middle C).
     * @see reo:pitch
     */
    pitch: number;
}

/**
 * The scope of an expression command, indicating whether it applies to
 * the bass or treble register of the piano.
 * @see reo:scope
 */
export type ExpressionScope = 'bass' | 'treble';

/**
 * An expression symbol, representing a command that governs dynamics,
 * pedaling, or mechanical functions of the reproducing piano rather
 * than sounding a note. Each expression has a scope (bass or treble)
 * and a specific expression type.
 * @see reo:Expression
 */
export interface Expression extends Command<'expression'> {
    /**
     * Whether this expression applies to the bass or treble register.
     * @see reo:scope
     */
    scope: ExpressionScope;

    /**
     * The kind of command, named as the reproducing system of the roll
     * names it: "SustainPedalOn", "ForzandoOff" and so on for the
     * Welte-Mignon T-100. The tracker bar of the system lists the
     * values it reads.
     * @see crm:P2 has type
     */
    expressionType: string;
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
 * Notes and expressions are commands; texts are carried by writings.
 */
export type AnySymbol =
    | Note
    | Expression
    | Text

export type AnyCommand = Note | Expression

