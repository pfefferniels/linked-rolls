export abstract class PlaceTimeConversion {
    abstract placeToTime(x1: number): number
    abstract timeToPlace(t1: number): number
}

export class GottschewskiConversion {
    paperThickness = 0.0075
    initialCircumference = 22.25
    secondsPerTurn = 4.64

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
