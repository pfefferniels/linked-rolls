import { Assumption } from "doubtful";
import { RollFeature } from "./Feature";
import { WithId } from "./WithId";

/**
 * @todo Should this be called Transcription?
 */
export type CarrierAssignment = Assumption<'carrierAssignment', string>;

export type RetrieveCarriers = (symbol: AnySymbol) => RollFeature[];

export interface Symbol<T extends string> extends WithId {
    type: T
    carriers: CarrierAssignment[]
}

export const isSymbol = (object: any): object is AnySymbol => {
    return 'carriers' in object
}

export interface Perforation<T extends string> extends Symbol<T> {
    accelerating?: boolean;
}

export interface Note extends Perforation<'note'> {
    pitch: number;
}

export type ExpressionScope = 'bass' | 'treble';

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

export interface Expression extends Perforation<'expression'> {
    scope: ExpressionScope;
    expressionType: ExpressionType;
}

/**
 * This denotes perforations that are covered by an editor.
 * The covered perforation is not considered to be part
 * of the original note or expression hole anymore.
 */
export interface Cover extends Symbol<'cover'> {
    /**
     * This property can be used to indicate e.g. the
     * color or material of the cover.
     */
    note?: string;
}

export interface Text<T extends string> extends Symbol<T> {
    text: string;
    rotation?: number;
}

/**
 * For handwritten insertions like e. g. the
 * perforation date in the end of a roll.
 */
export interface HandwrittenText extends Text<'handwrittenText'> {
    pen?: 'ink' | 'pencil' | 'crayon';
}

/**
 * This type can be used to indicate stamps like e. g. the
 * "controlliert" stamp in the beginning of rolls or the
 * date at the end of (later) Welte rolls.
 */
export interface Stamp extends Text<'stamp'> { }

export interface RollLabel extends Text<'rollLabel'> {
    signed: boolean;
}

export type AnySymbol =
    | Note
    | Expression
    | HandwrittenText
    | Stamp
    | Cover
    | RollLabel;

