export abstract class PlaceTimeConversion {
    abstract get summary(): string
    abstract placeToTime(x1: number): number
    abstract timeToPlace(t1: number): number
}

export class NoAccelerationConversion implements PlaceTimeConversion {
    get summary() {
        return `no acceleration (${this.metersPerMinute} m/min)`
    }

    metersPerMinute: number = 3; // according to most sources

    /**
     * Converts physical place (in cm) to time (in seconds).
     * @param x1 - The distance in mm.
     * @returns Time in seconds.
     */
    placeToTime(cm: number): number {
        const meters = cm / 100; // convert to m
        const t = meters / this.metersPerMinute;
        return t * 60;
    }

    /**
     * Converts time (in seconds) to physical place (in cm).
     * @param t1 - The time in seconds.
     * @returns Distance in cm.
     */
    timeToPlace(t1: number): number {
        return (this.metersPerMinute * (t1 / 60)) * 100;
    }
}

enum SpeedUnit {
    MetersPerMinute,
    FeetPerMinute
}

enum AccelerationUnit {
    MillimetersPerSecondSquared,
    FeetPerMinuteSquared
}

export class KinematicConversion implements PlaceTimeConversion {
    get summary() {
        return `kinematic (acceleration: ${this.acceleration} ft/s², speed: ${this.feetPerMinute} ft/min)`
    }
    static readonly slowSpeed = 9.46
    static readonly normalSpeed = 9.85
    static readonly stanfordAcceleration = 0.3147 // cf. https://github.com/pianoroll/midi2exp/commit/6a29060
    static readonly baertschAcceleration = 0.1772 // = 0.015 mm/s^2, cf. Baertsch p. 33

    private feetPerMinute: number;
    private acceleration: number;

    constructor(
        feetPerMinute = KinematicConversion.normalSpeed,
        acceleration = KinematicConversion.baertschAcceleration
    ) {
        this.feetPerMinute = feetPerMinute;
        this.acceleration = acceleration;
    }

    setSpeed(speed: number, unit: SpeedUnit) {
        if (unit === SpeedUnit.FeetPerMinute) {
            this.feetPerMinute = speed;
        }
        else if (unit === SpeedUnit.MetersPerMinute) {
            this.feetPerMinute = speed * 3.2808399
        }
        else {
            throw new Error('Unsupported unit')
        }
    }

    setAcceleration(acceleration: number, unit: AccelerationUnit) {
        if (unit === AccelerationUnit.FeetPerMinuteSquared) {
            this.acceleration = acceleration
        }
        else if (unit === AccelerationUnit.MillimetersPerSecondSquared) {
            this.acceleration = acceleration * 0.0032808399 * 3600
        }
        else {
            throw new Error('Unsupported unit')
        }
    }

    /**
     * Converts physical place (in cm) to time (in seconds).
     * @param x1 - The distance in mm.
     * @returns Time in seconds.
     */
    placeToTime(cm: number): number {
        const x1 = cm / 30.48

        const v = this.feetPerMinute;
        const a = this.acceleration;

        const t = (Math.sqrt(2 * a * x1 + Math.pow(v, 2)) - v) / a;

        return t * 60;
    }

    /**
     * Converts time (in seconds) to physical place (in cm).
     * @param t1 - The time in seconds.
     * @returns Distance in cm.
     */
    timeToPlace(t1: number): number {
        // Convert seconds -> minutes
        const T = t1 / 60;

        const xFeet = this.feetPerMinute * T + 0.5 * this.acceleration * Math.pow(T, 2);

        // Convert feet -> millimeters
        const xMM = xFeet * 304.8;

        return xMM / 10;
    }
}

export class GottschewskiConversion implements PlaceTimeConversion {
    get summary() {
        return `Gottschewski (assuming paper thickness: ${this.paperThickness}, initial circumference: ${this.initialCircumference}, seconds per turn: ${this.secondsPerTurn})`
    }
    paperThickness = 0.0075
    initialCircumference = 22.25
    secondsPerTurn = 4.64 // is that correct? Philips says 120 RPM (p. 113)

    /**
     * @param x1 in centimeters
     */
    placeToTime(x1: number) {
        const Q0 = Math.pow(this.initialCircumference, 2) / (4 * Math.PI)
        const v0 = this.initialCircumference / this.secondsPerTurn

        const d = Q0 / this.paperThickness

        return Math.pow(d, 0.5) * (1 / v0) * 2 * (Math.pow(d + x1, 0.5) - Math.pow(d, 0.5))
    }

    timeToPlace(t1: number): number {
        const Q0 = Math.pow(this.initialCircumference, 2) / (4 * Math.PI);
        const v0 = this.initialCircumference / this.secondsPerTurn;

        const d = Q0 / this.paperThickness;

        return Math.pow((t1 * v0) / (2 * Math.pow(d, 0.5)) + Math.pow(d, 0.5), 2) - d;
    }
}

