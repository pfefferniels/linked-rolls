import Ajv from "ajv"
import * as schema from "./schema.json"
import { Edition } from "./Edition"

const ajv = new Ajv(
    {
        formats: {
            "date": true
        }
    }
)

const validate = ajv.compile<Edition>(schema)
export { validate }