import { describe, expect, it } from 'vitest'
import { readFileSync } from "fs";
import { RollCopy } from './RollCopy';
import { Collator } from './Collator';
import { Emulation } from './Emulation';
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
        const collator = new Collator()
        collator.prepareFromRollCopy(copy1)

        const emulation = new Emulation()
        emulation.emulate(collator.events, [{
            'type': 'TempoAdjustment',
            'startsWith': 100,
            'endsWith': 150,
            adjusts: 'myroll'
        }])

        const velocities = emulation.midiEvents
            .filter(e => e.type?.['@id'] === 'NoteOnEvent')
            .map(e => (e as any).velocity)

        expect(velocities.every(v => v >= 35 && v <= 90)).toBeTruthy()
    })
})
