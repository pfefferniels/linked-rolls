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

// The @see tags name the ontology term of a key or class; the docs read
// them from a keyword of their own. ts-json-schema-generator inserts a
// space before colons in tag values (e.g. "crm :E21").
function renameSeeToOntology(obj) {
    if (Array.isArray(obj)) {
        obj.forEach(renameSeeToOntology);
    } else if (obj && typeof obj === 'object') {
        if (obj.see) {
            obj.ontology = obj.see.replace(/ :/g, ':');
            delete obj.see;
        }
        Object.values(obj).forEach(renameSeeToOntology);
    }
}

renameSeeToOntology(transformed);

// An export states what the shape of the document only implies: which
// features a copy bears, which patches it is composed of, and what an
// act changed. The keys are derived from the tree on the way out and
// read off it again on the way in, so no type carries them and the
// generator cannot see them. They are declared here so that the format
// documentation names them and a validator knows them.
const reference = { type: 'object', properties: { '@id': { type: 'string' } }, required: ['@id'] };
const references = { type: 'array', items: reference };

const derived = {
    RollCopy: {
        bears: {
            ...references,
            description: 'The features the copy bears, whichever of its acts brought them about. Derived on export.',
            ontology: 'crm:P56 bears feature'
        },
        composedOf: {
            ...references,
            description: 'The patches glued onto the copy. A patch is an object rather than a feature, so it is stated as a part. Derived on export.',
            ontology: 'crm:P46 is composed of'
        }
    },
    GluedOn: {
        bears: {
            ...references,
            description: 'The features the patch bears. Derived on export.',
            ontology: 'crm:P56 bears feature'
        }
    },
    Attachment: {
        augmented: {
            ...reference,
            description: 'The copy the patches were glued onto. Derived on export.',
            ontology: 'crm:P110 augmented'
        }
    },
    Removal: {
        diminished: {
            ...reference,
            description: 'The copy something was taken off. Derived on export.',
            ontology: 'crm:P112 diminished'
        }
    }
};

function declareDerived(obj) {
    if (Array.isArray(obj)) {
        obj.forEach(declareDerived);
    } else if (obj && typeof obj === 'object') {
        const declarations = derived[obj.properties?.['@type']?.const];
        if (declarations) {
            for (const [key, declaration] of Object.entries(declarations)) {
                if (!obj.properties[key]) obj.properties[key] = declaration;
            }
        }
        Object.values(obj).forEach(declareDerived);
    }
}

declareDerived(transformed);

// A feature a patch bears states no place of its own. The generator
// reads neither Omit nor Partial over a union of interfaces: it leaves
// the two spans without a schema and turns the optional keys of the
// base interface into required ones. The definition is built here
// instead, from the four the union is made of.
const featureNames = ['HoleChain', 'Writing', 'Mark', 'GluedOn'];
const spans = ['horizontal', 'vertical'];

// A union member carries no description of its own in the docs; its
// type discriminator says which of the four it is.
const withoutPlace = ({ description, ontology, ...definition }) => ({
    ...definition,
    properties: Object.fromEntries(Object.entries(definition.properties)
        .map(([key, value]) => [key, spans.includes(key) ? { ...value, description: `${value.description} Left out by a feature a patch bears.` } : value])),
    required: (definition.required ?? []).filter(key => !spans.includes(key))
});

const nestedName = Object.keys(transformed.definitions).find(name => name.startsWith('PartialBy<'));

function pointNestedAt(obj, at) {
    if (Array.isArray(obj)) {
        obj.forEach(value => pointNestedAt(value, at));
    } else if (obj && typeof obj === 'object') {
        if (obj.$ref === `#/definitions/${nestedName}`) obj.$ref = at;
        Object.values(obj).forEach(value => pointNestedAt(value, at));
    }
}

if (nestedName) {
    const { $ref, ...named } = transformed.definitions.NestedFeature ?? {};
    delete transformed.definitions[nestedName];
    transformed.definitions.NestedFeature = {
        ...named,
        anyOf: featureNames.map(name => withoutPlace(transformed.definitions[name]))
    };
    pointNestedAt(transformed, '#/definitions/NestedFeature');
}

fs.writeFileSync("schema.json", JSON.stringify(transformed, null, 2)
    .replaceAll('date-time', 'date')
);
