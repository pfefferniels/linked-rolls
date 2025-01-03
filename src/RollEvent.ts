import { RollMeasurement } from "./Measurement";
import { WithId } from "./WithId";

export interface EventSpan {
    from: number;
    to?: number;
    hasUnit: 'mm' | 'track';
}

export interface EventDimension {
    horizontal: EventSpan;
    vertical: EventSpan;
}

export interface RollEvent<T> extends WithId {
    type: T;

    /**
     * IIIF region in string form.
     */
    annotates?: string;

    hasDimension: EventDimension;

    /**
     * Describes whether the event takes place
     * on the verso or recto side of the roll.
     * Since the same perforation is present on both
     * sides, this property is left optional for now.
     */
    side?: 'verso' | 'recto';

    measurement: RollMeasurement // L20i was created by
}

export interface Note extends RollEvent<'note'> {
    hasPitch: number;
}

export type ExpressionScope = 'bass' | 'treble';

export type ExpressionType =
    'SustainPedalOn' | 'SustainPedalOff' |
    'SoftPedalOn' | 'SoftPedalOff' |
    'MezzoforteOff' | 'MezzoforteOn' |
    'SlowCrescendoOn' | 'SlowCrescendoOff' |
    'ForzandoOn' | 'ForzandoOff';

export interface Expression extends RollEvent<'expression'> {
    hasScope: ExpressionScope;
    P2HasType: ExpressionType;
}

/**
 * This denotes perforations that are covered by an editor.
 * The covered perforation is not considered to be part
 * of the original note or expression hole anymore.
 */
export interface Cover extends RollEvent<'cover'> {
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
export interface HandwrittenText extends RollEvent<'handwrittenText'> {
    text: string;
    rotation?: number;
}

/**
 * This type can be used to indicate stamps like e. g. the
 * "controlliert" stamp in the beginning of rolls or the
 * date at the end of (later) Welte rolls.
 */
export interface Stamp extends RollEvent<'stamp'> {
    text: string;
    rotation?: number;
}

export interface RollLabel extends RollEvent<'rollLabel'> {
    text: string;
    signed: boolean;
}

export type AnyRollEvent = Note | Expression | HandwrittenText | Stamp | Cover | RollLabel;

export const isRollEvent = (e: any): e is AnyRollEvent => {
    return 'hasDimension' in e
}
