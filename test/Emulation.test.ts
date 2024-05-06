import { describe, expect, it } from 'vitest'
import { readFileSync } from "fs";
import { RollCopy } from '../src/RollCopy';
import { Emulation } from '../src/Emulation';
const path = require("path");

const fileToRollCopy = (filename: string) => {
    const file = readFileSync(path.resolve(__dirname, filename));
    const contents = file.toString()
    const lr = new RollCopy()
    lr.readFromStanfordAton(contents)
    return lr
}

describe('Emulation', () => {
    const copy1 = fileToRollCopy("./fixtures/traeumerei2_analysis.txt")

    it('emulates roll playback', async () => {
        const emulation = new Emulation()
        emulation.emulateFromRoll(copy1.events)

        const velocities = emulation.midiEvents
            .filter(e => e.type?.['@id'] === 'NoteOnEvent')
            .map(e => (e as any).velocity)
        
        console.log(velocities)

        expect(velocities.every(v => v >= 35 && v <= 90)).toBeTruthy()
    })
})
