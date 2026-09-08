import Ajv, { type ErrorObject, type ValidateFunction } from "ajv"
import * as schema from "./schema.json"
import { Edition } from "./Edition"

/**
 * Holds a document against the edition schema. `errors` says what the
 * last call found wrong, and is empty where it found nothing.
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

const validate: ValidateEdition = (document): document is Edition => {
    compiled ??= compileEditionSchema()
    const valid = compiled(document)
    validate.errors = compiled.errors
    return valid
}

export { validate }
