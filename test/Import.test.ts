import { describe, expect, it } from 'vitest'
import { importJsonLd } from '../src/importJsonLd';
import * as path from 'path'
import { readFileSync } from 'fs';

describe('Import', () => {
    it('imports a roll edition', async () => {
        const file = readFileSync(path.join(__dirname, 'fixtures', 'roll.json'), 'utf8')

        const edition = importJsonLd(JSON.parse(file));

        expect(edition.copies.length).toEqual(3);
        expect(edition.copies.map(c => c.siglum)).toEqual(['S1', 'S2', 'W1']);
        expect(edition.copies.every(c => c.getConstitutedEvents().length > 0)).toEqual(true);
        expect(edition.stages.length).toEqual(3);
        expect(edition.stages.find(s => s.created.siglum === 'a')?.edits).toHaveLength(0);
        expect(edition.stages.find(s => s.created.siglum === 'b')?.edits).toHaveLength(233);
    })
})
