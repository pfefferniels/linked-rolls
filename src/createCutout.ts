import { v4 } from "uuid";
import { CollatedEvent, Cutout, Expression, Note } from "./.ldo/rollo.typings";

export const createCutout = (from: (Note | Expression | CollatedEvent)[], baseUrl: string) => {
    const cutout: Cutout = {
        'type': { '@id': 'Selection' },
        '@id': `${baseUrl}#${v4()}`,
        'P106IsComposedOf': from.map(event => ({
            '@id': event["@id"] || 'unknown'
        }))
    }
    return cutout
}
