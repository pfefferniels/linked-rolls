import { expect, test } from 'vitest'
import { AtonParser } from './AtonParser'

test('it import ATON files correctly', () => {
    const parser = new AtonParser()
    const result = parser.parse(`
@key1: value1
@@START: key2
@key2a: value2a
@key2b: value2b
@key2c: value2c
@@END: key2
@key3: value3`
    )

    expect(result.key1).toBe('value1')
    expect(result.key2.key2a).toBe('value2a')
    expect(result.key3).toBe('value3')
})
