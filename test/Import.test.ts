import { describe, expect, it } from 'vitest'
import { importJsonLd } from '../src/importJsonLd';
import * as path from 'path'
import { readFileSync } from 'fs';

describe('Import', () => {
    it('imports a roll edition', async () => {
        const file = readFileSync(path.join(__dirname, 'fixtures', 'roll-0.1.json'), 'utf8')

        const edition = importJsonLd(JSON.parse(file));

        console.log(JSON.stringify(edition, null, 2));
        expect(edition.copies.length).toEqual(3);
    })
})
