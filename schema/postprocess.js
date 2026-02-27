import fs from "fs";

const schema = JSON.parse(fs.readFileSync("schema_.json", "utf8"));

const renames = {
    'id': '@id',
    'type': '@type',
}

const ignores = ['base']

const replace = {
}

function renameKeys(obj) {
    if (Array.isArray(obj)) {
        return obj.map(renameKeys);
    }
    else if (obj && typeof obj === "object") {
        return Object.fromEntries(
            Object
                .entries(obj)
                .map(([key, value]) => {
                    if (key === 'properties') {
                        for (const rename of Object.keys(renames)) {
                            if (value[rename]) {
                                value[renames[rename]] = value[rename];
                                delete value[rename];
                            }
                        }
                    }

                    if (ignores.includes(key)) {
                        return null
                    }

                    if (replace[key]) {
                        value = replace[key];
                    }

                    if (key === 'required' && Array.isArray(value)) {
                        value = value
                            .filter(v => !ignores.includes(v))
                            .map(v => renames[v] || v);
                    }

                    return [key, renameKeys(value)];
                })
                .filter(entry => entry !== null)
        );
    }
    return obj;
}

const transformed = renameKeys(schema);

// Ensure all @id and @type properties have descriptions and ontology
// mappings, even when ts-json-schema-generator doesn't propagate them
// from generic base types like WithId and WithType.
const defaultProperties = {
    '@id': { description: 'A unique identifier for this object.' },
    '@type': { description: 'The type discriminator for this object.', ontology: 'rdf:type' },
};

function ensureDefaults(obj) {
    if (Array.isArray(obj)) {
        obj.forEach(ensureDefaults);
    } else if (obj && typeof obj === 'object') {
        if (obj.properties) {
            for (const [field, defaults] of Object.entries(defaultProperties)) {
                if (obj.properties[field]) {
                    for (const [key, value] of Object.entries(defaults)) {
                        if (!obj.properties[field][key]) {
                            obj.properties[field][key] = value;
                        }
                    }
                }
            }
        }
        for (const value of Object.values(obj)) {
            ensureDefaults(value);
        }
    }
}

ensureDefaults(transformed);

// Merge "see" fields (from @see JSDoc tags) into descriptions using a
// structured marker that the HTML post-processor can detect reliably.
// ts-json-schema-generator inserts a space before colons in tag values
// (e.g. "crm :E21"), so we normalise that first.
function mergeSeeIntoDescription(obj) {
    if (Array.isArray(obj)) {
        obj.forEach(mergeSeeIntoDescription);
    } else if (obj && typeof obj === 'object') {
        if (obj.see) {
            const normalised = obj.see.replace(/ :/g, ':');
            const marker = `[ontology: ${normalised}]`;
            obj.description = obj.description
                ? `${obj.description} ${marker}`
                : marker;
            delete obj.see;
        }
        for (const value of Object.values(obj)) {
            mergeSeeIntoDescription(value);
        }
    }
}

mergeSeeIntoDescription(transformed);

fs.writeFileSync("schema.json", JSON.stringify(transformed, null, 2)
    .replaceAll('date-time', 'date')
);
