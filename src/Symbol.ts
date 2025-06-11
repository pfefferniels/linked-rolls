import { HorizontalSpan, RollFeature, VerticalSpan } from "./Feature";
import { WithId } from "./WithId";

export interface Symbol<T extends string> extends WithId {
    type: T
    isCarriedBy: RollFeature[]
}

export function isSymbol<T extends string>(e: any): e is Symbol<T> {
    return 'isCarriedBy' in e
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

/**
 * For handwritten insertions like e. g. the
 * perforation date in the end of a roll.
 */
export interface HandwrittenText extends Symbol<'handwrittenText'> {
    text: string;
    rotation?: number;
}

/**
 * This type can be used to indicate stamps like e. g. the
 * "controlliert" stamp in the beginning of rolls or the
 * date at the end of (later) Welte rolls.
 */
export interface Stamp extends Symbol<'stamp'> {
    text: string;
    rotation?: number;
}

export interface RollLabel extends Symbol<'rollLabel'> {
    text: string;
    signed: boolean;
}

export type AnySymbol =
    | Note
    | Expression
    | HandwrittenText
    | Stamp
    | Cover
    | RollLabel;


export const dimensionOf = (symbol: AnySymbol): { horizontal: HorizontalSpan, vertical: VerticalSpan } => {
    if (symbol.isCarriedBy.length === 0) {
        return {
            horizontal: { unit: 'mm', from: 0, to: 0 },
            vertical: { unit: 'track', from: 0, to: 0 }
        };
    }

    const horizontalFrom = symbol.isCarriedBy.reduce((hAcc, h) => hAcc + h.horizontal.from, 0) / symbol.isCarriedBy.length;
    const horizontalTo = symbol.isCarriedBy.reduce((hAcc, h) => hAcc + h.horizontal.to, 0) / symbol.isCarriedBy.length;
    const verticalFrom = symbol.isCarriedBy.reduce((vAcc, v) => vAcc + v.vertical.from, 0) / symbol.isCarriedBy.length;
    const verticalTo = symbol.isCarriedBy.reduce((vAcc, v) => vAcc + (v.vertical.to ?? v.vertical.from), 0) / symbol.isCarriedBy.length;

    return {
        horizontal: { unit: 'mm', from: horizontalFrom, to: horizontalTo },
        vertical: { unit: 'track', from: verticalFrom, to: verticalTo }
    };
}
