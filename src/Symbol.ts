import { ReferenceAssumption } from "./Assumption";
import { WithId } from "./utils";

export interface Symbol<T extends string> extends WithId {
    type: T
    carriers: ReferenceAssumption[]
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

export type AnySymbol =
    | Note
    | Expression

