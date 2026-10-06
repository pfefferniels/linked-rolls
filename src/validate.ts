/**
 * Checks an edition's JSON-LD document, as `asJsonLd` writes one, against
 * the schema of the format. The same `validate` is exported from the root
 * module; this entry point offers it alone.
 *
 * @module linked-rolls/validate
 */
import Ajv, { type ErrorObject, type ValidateFunction } from "ajv"
// A default import, not a namespace one: Node's ESM gives a JSON module
// only a default export, so `import * as` hands ajv the namespace object
// and it compiles a schema that constrains nothing.
import schema from "./schema.json" with { type: 'json' }
import { Edition } from "./model/Edition.js"

/**
 * Holds a document against the edition schema. `errors` says what the
 * last call found wrong, and is empty where it found nothing.
 * @category Reading and writing
 */
export interface ValidateEdition {
    (document: unknown): document is Edition
    errors?: ErrorObject[] | null
}

const compileEditionSchema = (): ValidateFunction<Edition> =>
    new Ajv({ strict: false, formats: { "date": true } }).compile<Edition>(schema)

/**
 * Compiling costs enough that a consumer which never validates should not
 * pay for it, so the compiled form is made on first use and kept.
 */
let compiled: ValidateFunction<Edition> | undefined

/**
 * Whether the document is an edition as the schema of the format
 * describes it, such as `asJsonLd` writes. What a call found wrong is in
 * `validate.errors` until the next call. A document written by an earlier
 * release may fail where `importJsonLd` would still read it, since the
 * import migrates it first (`migrate`).
 * @category Reading and writing
 */
const validate: ValidateEdition = (document): document is Edition => {
    compiled ??= compileEditionSchema()
    const valid = compiled(document)
    validate.errors = compiled.errors
    return valid
}

export { validate }
