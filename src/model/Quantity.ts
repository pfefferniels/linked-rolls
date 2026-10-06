/**
 * Numbers that carry their unit in the type. At runtime a quantity is
 * the plain number it was made from, so it compares, sorts and prints
 * as one and goes wherever a number is wanted. The other direction is
 * closed: a number becomes a quantity only through the constructors
 * here, and a quantity in one unit cannot stand in for one in another.
 * The unit names are the ones the records state in their `unit` field.
 */
declare const unit: unique symbol

/**
 * The units a record may state. A `Measure` is limited to these, since
 * they are what the `unit` field is allowed to say.
 * @category Format types
 */
export type Unit = 'mm' | 'cm' | 'px' | 'track' | 's' | 'ms' | 'ft/min' | 'm/min' | 'px/in' | 'deg' | 'percent'

// Any unit name may be branded, so that a consumer can carry its own
// units, such as a drawing's coordinates, through the same operations.
// Only a `Measure` is held to the vocabulary above. A doc comment here
// would be copied into the generated schema once per unit, so this one
// stays plain.
export type Quantity<U extends string> = number & { readonly [unit]: U }

/**
 * A place along the roll, or any length on the paper.
 * @category Units
 */
export type Millimeters = Quantity<'mm'>
/**
 * A length in centimetres.
 * @category Units
 */
export type Centimeters = Quantity<'cm'>
/**
 * A place in a scan. Comparable within one scan only, since the resolution is the scan's.
 * @category Units
 */
export type Pixels = Quantity<'px'>
/**
 * A position across the roll, numbered as the tracker bar does.
 * @category Units
 */
export type Track = Quantity<'track'>
/**
 * A time in seconds, such as the moment a performed event falls at.
 * @category Units
 */
export type Seconds = Quantity<'s'>
/**
 * A time in milliseconds.
 * @category Units
 */
export type Milliseconds = Quantity<'ms'>
/**
 * A paper speed in feet per minute.
 * @category Units
 */
export type FeetPerMinute = Quantity<'ft/min'>
/**
 * A paper speed in metres per minute.
 * @category Units
 */
export type MetersPerMinute = Quantity<'m/min'>
/**
 * How finely a scan was read: pixels of the image per inch of paper.
 * @category Units
 */
export type Resolution = Quantity<'px/in'>
/**
 * An angle on the roll, turning from the line across the paper towards the end of the roll.
 * @category Units
 */
export type Degrees = Quantity<'deg'>
/**
 * A share of a length, such as how far the paper has stretched: dimensionless, in hundredths.
 * @category Units
 */
export type Percent = Quantity<'percent'>

/**
 * Names a number in a unit. Partially apply it to make a constructor.
 * @category Units
 */
export const quantity = <U extends string>(value: number): Quantity<U> => value as Quantity<U>

/**
 * Names a number in millimetres.
 * @category Units
 */
export const mm = quantity<'mm'>
/**
 * Names a number in centimetres.
 * @category Units
 */
export const cm = quantity<'cm'>
/**
 * Names a number in pixels of a scan.
 * @category Units
 */
export const px = quantity<'px'>
/**
 * Names a number as a position across the roll, as the tracker bar
 * numbers it.
 * @category Units
 */
export const track = quantity<'track'>
/**
 * Names a number in seconds.
 * @category Units
 */
export const seconds = quantity<'s'>
/**
 * Names a number in milliseconds.
 * @category Units
 */
export const milliseconds = quantity<'ms'>
/**
 * Names a number as a paper speed in feet per minute.
 * @category Units
 */
export const feetPerMinute = quantity<'ft/min'>
/**
 * Names a number as a paper speed in metres per minute.
 * @category Units
 */
export const metersPerMinute = quantity<'m/min'>
/**
 * Names a number as the resolution of a scan, in pixels per inch.
 * @category Units
 */
export const pixelsPerInch = quantity<'px/in'>
/**
 * Names a number as an angle in degrees.
 * @category Units
 */
export const degrees = quantity<'deg'>
/**
 * Names a number as a share in per cent.
 * @category Units
 */
export const percent = quantity<'percent'>

/**
 * A value together with the unit it was measured in, as a record
 * states it.
 * @see crm:E54 Dimension
 * @category Format types
 */
export interface Measure<U extends Unit> {
    /**
     * The measured value.
     * @see crm:P90 has value
     */
    value: Quantity<U>
    /**
     * The unit of measurement.
     * @see crm:P91 has unit
     */
    unit: U
}

// The second operand takes its unit from the first. Inferred from both,
// TypeScript would unite two units rather than reject them.
/**
 * The sum of two quantities in one unit.
 * @internal
 */
export const add = <U extends string>(a: Quantity<U>, b: Quantity<NoInfer<U>>): Quantity<U> => quantity<U>(a + b)

/**
 * The first quantity less the second, in their unit.
 * @internal
 */
export const subtract = <U extends string>(a: Quantity<U>, b: Quantity<NoInfer<U>>): Quantity<U> => quantity<U>(a - b)

/**
 * How far apart two quantities in one unit lie, whichever is the
 * larger.
 * @internal
 */
export const distance = <U extends string>(a: Quantity<U>, b: Quantity<NoInfer<U>>): Quantity<U> =>
    quantity<U>(Math.abs(a - b))

/**
 * A quantity times a plain factor, such as a stretch.
 * @internal
 */
export const scale = <U extends string>(a: Quantity<U>, factor: number): Quantity<U> => quantity<U>(a * factor)

// Math.min and Math.max are declared over plain numbers, so a quantity
// passed through them comes back without its unit.
/**
 * The smaller of two quantities in one unit.
 * @internal
 */
export const min = <U extends string>(a: Quantity<U>, b: Quantity<NoInfer<U>>): Quantity<U> =>
    quantity<U>(Math.min(a, b))

/**
 * The larger of two quantities in one unit.
 * @internal
 */
export const max = <U extends string>(a: Quantity<U>, b: Quantity<NoInfer<U>>): Quantity<U> =>
    quantity<U>(Math.max(a, b))

/**
 * The value brought inside the bounds, which must not be the wrong way round.
 * @internal
 */
export const clamp = <U extends string>(
    value: Quantity<U>,
    low: Quantity<NoInfer<U>>,
    high: Quantity<NoInfer<U>>
): Quantity<U> => quantity<U>(Math.min(high, Math.max(low, value)))

// A list is taken at its element type, so one that mixes units yields a
// union unit rather than an error; only the binary operations reject a mix.
/**
 * The quantities added up, zero where there are none.
 * @internal
 */
export const sum = <U extends string>(values: readonly Quantity<U>[]): Quantity<U> =>
    quantity<U>(values.reduce<number>((total, value) => total + value, 0))

/**
 * The mean of the quantities.
 * @internal
 */
export const mean = <U extends string>(values: readonly Quantity<U>[]): Quantity<U> =>
    quantity<U>(sum(values) / values.length)

const MM_PER_INCH = 25.4

/**
 * A place in a scan taken at `dpi` dots per inch, on the paper.
 * @internal
 */
export const inMillimeters = (place: Pixels, dpi: number): Millimeters => mm(place / dpi * MM_PER_INCH)

/**
 * A place on the paper, in a scan taken at `dpi` dots per inch.
 * @internal
 */
export const inPixels = (place: Millimeters, dpi: number): Pixels => px(place / MM_PER_INCH * dpi)

/**
 * A length in millimetres, in centimetres.
 * @internal
 */
export const inCentimeters = (length: Millimeters): Centimeters => cm(length / 10)

const MS_PER_SECOND = 1000

/**
 * A time in milliseconds, in seconds.
 * @internal
 */
export const inSeconds = (time: Milliseconds): Seconds => seconds(time / MS_PER_SECOND)

/**
 * A time in seconds, in milliseconds.
 * @internal
 */
export const inMilliseconds = (time: Seconds): Milliseconds => milliseconds(time * MS_PER_SECOND)

const METERS_PER_FOOT = 0.3048

/**
 * A speed as a record states it, in feet or metres per minute.
 * @category Format types
 */
export type SpeedMeasure = Measure<'ft/min'> | Measure<'m/min'>

/**
 * A speed in metres per minute, whichever unit it was stated in.
 * @category Units
 */
export const inMetersPerMinute = (speed: SpeedMeasure): MetersPerMinute =>
    speed.unit === 'm/min' ? speed.value : metersPerMinute(speed.value * METERS_PER_FOOT)
