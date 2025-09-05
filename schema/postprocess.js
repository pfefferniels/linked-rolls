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
fs.writeFileSync("schema.json", JSON.stringify(transformed, null, 2)
    .replaceAll('date-time', 'date')
);
