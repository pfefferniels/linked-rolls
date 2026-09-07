/**
 * Numbers that carry their unit in the type. At runtime a quantity is
 * the plain number it was made from, so it compares, sorts and prints
 * as one and goes wherever a number is wanted. The other direction is
 * closed: a number becomes a quantity only through the constructors
 * here, and a quantity in one unit cannot stand in for one in another.
 * The unit names are the ones the records state in their `unit` field.
 */
declare const unit: unique symbol

export type Unit = 'mm' | 'cm' | 'px' | 'track' | 's' | 'ms' | 'ft/min' | 'm/min'

export type Quantity<U extends Unit> = number & { readonly [unit]: U }

/** A place along the roll, or any length on the paper. */
export type Millimeters = Quantity<'mm'>
export type Centimeters = Quantity<'cm'>
/** A place in a scan. Comparable within one scan only, since the resolution is the scan's. */
export type Pixels = Quantity<'px'>
/** A position across the roll, numbered as the tracker bar does. */
export type Track = Quantity<'track'>
export type Seconds = Quantity<'s'>
export type Milliseconds = Quantity<'ms'>
export type FeetPerMinute = Quantity<'ft/min'>
export type MetersPerMinute = Quantity<'m/min'>

const quantity = <U extends Unit>(value: number): Quantity<U> => value as Quantity<U>

export const mm = quantity<'mm'>
export const cm = quantity<'cm'>
export const px = quantity<'px'>
export const track = quantity<'track'>
export const seconds = quantity<'s'>
export const milliseconds = quantity<'ms'>
export const feetPerMinute = quantity<'ft/min'>
export const metersPerMinute = quantity<'m/min'>

/**
 * A value together with the unit it was measured in, as a record
 * states it.
 * @see crm:E54 Dimension
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
export const add = <U extends Unit>(a: Quantity<U>, b: Quantity<NoInfer<U>>): Quantity<U> => quantity<U>(a + b)

export const subtract = <U extends Unit>(a: Quantity<U>, b: Quantity<NoInfer<U>>): Quantity<U> => quantity<U>(a - b)

export const distance = <U extends Unit>(a: Quantity<U>, b: Quantity<NoInfer<U>>): Quantity<U> =>
    quantity<U>(Math.abs(a - b))

/** A quantity times a plain factor, such as a stretch. */
export const scale = <U extends Unit>(a: Quantity<U>, factor: number): Quantity<U> => quantity<U>(a * factor)

// A list is taken at its element type, so one that mixes units yields a
// union unit rather than an error; only the binary operations reject a mix.
export const sum = <U extends Unit>(values: readonly Quantity<U>[]): Quantity<U> =>
    quantity<U>(values.reduce<number>((total, value) => total + value, 0))

export const mean = <U extends Unit>(values: readonly Quantity<U>[]): Quantity<U> =>
    quantity<U>(sum(values) / values.length)

const MM_PER_INCH = 25.4

/** A place in a scan taken at `dpi` dots per inch, on the paper. */
export const inMillimeters = (place: Pixels, dpi: number): Millimeters => mm(place / dpi * MM_PER_INCH)

export const inCentimeters = (length: Millimeters): Centimeters => cm(length / 10)

export const inSeconds = (time: Milliseconds): Seconds => seconds(time / 1000)

const METERS_PER_FOOT = 0.3048

/** A speed as a record states it, in feet or metres per minute. */
export type SpeedMeasure = Measure<'ft/min'> | Measure<'m/min'>

/** A speed in metres per minute, whichever unit it was stated in. */
export const inMetersPerMinute = (speed: SpeedMeasure): MetersPerMinute =>
    speed.unit === 'm/min' ? speed.value : metersPerMinute(speed.value * METERS_PER_FOOT)
