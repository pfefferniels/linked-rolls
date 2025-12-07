import { describe, expect, it } from 'vitest'
import { importJsonLd } from '../src/importJsonLd';
import * as path from 'path'
import { readFileSync } from 'fs';
import { asJsonLd } from '../src/asJsonLd';

describe('Import', () => {
    it('imports a roll edition', async () => {
        const file = readFileSync(path.join(__dirname, 'fixtures', 'roll.json'), 'utf8')

        const edition = importJsonLd(JSON.parse(file));
        const serialized = asJsonLd(edition);

        // console.log('serialized', serialized)
    })
})
