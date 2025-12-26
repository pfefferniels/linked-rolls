import { ReferenceAssumption } from "./Assumption";
import { WithId } from "./utils";

export interface Symbol<T extends string> extends WithId {
    type: T
    carriers: ReferenceAssumption[]
}

export const isSymbol = (object: any): object is AnySymbol => {
    return (
        'type' in object
        && (object.type === 'note' || object.type === 'expression' || object.type === 'text')
    );
}

export interface Perforation<T extends string> extends Symbol<T> {}

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
 * Maps to crm:E33 Linguistic Object.
 */
export interface Text extends Symbol<'text'> {
    /**
     * The text content of the symbol. 
     * Maps to crm:P3 has note.
     */
    text: string;
}

export type AnySymbol =
    | Note
    | Expression
    | Text

