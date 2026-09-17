import { Concept } from "./Agent"

const PROCEDURE_IRI = 'https://w3id.org/reo/type/procedure/'

/**
 * The procedures the type vocabulary declares, for a consumer that has
 * to offer them. The names are the German labels of the concepts, which
 * is what an edition writing one of them holds; what each procedure
 * says is in the ontology, not here.
 *
 * `ontology/types.ttl` is the place a procedure is defined. A test holds
 * this list against it.
 * @see crm:E29 Design or Procedure
 */
export const procedures: readonly Concept[] = [
    {
        id: `${PROCEDURE_IRI}umstanzung`,
        name: 'Umstanzung',
        sameAs: []
    },
    {
        id: `${PROCEDURE_IRI}umstanzung/welte-t100-to-welte-licensee`,
        name: 'Umstanzung vom T-100 ins Licensee-System',
        sameAs: []
    },
    {
        id: `${PROCEDURE_IRI}umstanzung/welte-t100-to-welte-green`,
        name: 'Umstanzung vom T-100 ins grüne System',
        sameAs: []
    }
]

/** The procedure of that IRI, where the vocabulary declares one. */
export const procedureOf = (id: string | undefined): Concept | undefined =>
    procedures.find(procedure => procedure.id === id)
