import { EditorialAssumption, flat } from "./EditorialAssumption";
import { HorizontalSpan, RollFeature, VerticalSpan } from "./Feature";
import { WithId } from "./WithId";

/**
 * @todo Should this be called Transcription?
 */
export type CarrierAssignment = EditorialAssumption<'carrierAssignment', RollFeature>;

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

export const dimensionOf = (symbol: AnySymbol): { horizontal: HorizontalSpan, vertical: VerticalSpan } => {
    if (symbol.carriers.length === 0) {
        return {
            horizontal: { unit: 'mm', from: 0, to: 0 },
            vertical: { unit: 'track', from: 0, to: 0 }
        };
    }

    const horizontalFrom = flat<'carrierAssignment', RollFeature>(symbol.carriers)
        .reduce((hAcc, h) => hAcc + h.horizontal.from, 0) / symbol.carriers.length;
    const horizontalTo = flat(symbol.carriers)
        .reduce((hAcc, h) => hAcc + h.horizontal.to, 0) / symbol.carriers.length;
    const verticalFrom = flat(symbol.carriers)
        .reduce((vAcc, v) => vAcc + v.vertical.from, 0) / symbol.carriers.length;

    const definedVerticalTo = flat(symbol.carriers)
        .filter(v => v.vertical.to !== undefined)
    let verticalTo: number | undefined = undefined
    if (definedVerticalTo.length > 0) {
        verticalTo = definedVerticalTo
            .reduce((vAcc, v) => vAcc + v.vertical.to!, 0) / definedVerticalTo.length;
    }

    return {
        horizontal: { unit: 'mm', from: horizontalFrom, to: horizontalTo },
        vertical: { unit: 'track', from: verticalFrom, to: verticalTo }
    };
}
