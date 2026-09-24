// Holds the built package to what a consumer without a bundler gets.
//
// The test suite runs the sources through Vite, which resolves modules
// more forgivingly than Node does, so it cannot see this class of fault
// at all: an extensionless import, a JSON module read as a namespace
// rather than a default. Both have shipped before, the second leaving
// `validate` accepting every document for several releases while the
// suite stayed green.
import { strict as assert } from 'node:assert'

const failures = []
const check = async (what, run) => {
    try {
        await run()
    } catch (error) {
        failures.push(`${what}: ${error.message}`)
    }
}

const lib = await import('../lib/index.js')

await check('the package exports what it is for', () => {
    ;['validate', 'migrate', 'importJsonLd', 'asJsonLd', 'EditionView', 'scatterOf', 'sidesOf']
        .forEach(name => assert.equal(typeof lib[name], 'function', `${name} is missing`))
})

await check('the schema constrains something', () => {
    assert.equal(lib.validate({}), false, 'an empty object passed validation')
    assert.ok((lib.validate.errors ?? []).length > 0, 'validation failed without saying why')
})

await check('the subpath exports resolve', async () => {
    await Promise.all([
        import('../lib/systems/welteT100/system.js'),
        import('../lib/systems/welteT98/system.js'),
        import('../lib/systems/welteLicensee/system.js'),
        import('../lib/validate.js')
    ])
})

if (failures.length > 0) {
    console.error('The built package does not hold:')
    failures.forEach(failure => console.error(`  ${failure}`))
    process.exit(1)
}
console.log('Built package holds.')
