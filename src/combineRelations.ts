import { sourcesOf } from "./Collator"
import { RollCopy } from "./RollCopy"
import { Relation, Reading, AnyEditorialAction } from "./EditorialActions"

export const combineRelations = (
    sources: RollCopy[],
    selected: Relation[],
    assumptions: AnyEditorialAction[]
) => {
    if (selected.length <= 1) return 

    const bySources = (relation: Relation) => new Map<string, Reading>(
        relation.relates.map(r => [
            // key: sources as string ("sourceA sourceB ...")
            Array.from(sourcesOf(sources, r.contains)).join(''),
            // value: the reading itself
            r
        ])
    )

    const firstRelation = selected[0]
    let readings = bySources(firstRelation)

    for (let i=1; i<selected.length; i++) {
        const current = selected[i]

        for (const reading of current.relates) {
            const sourcesOfReading = Array.from(sourcesOf(sources, reading.contains)).join(' ')

            // find a reading which has the same sources
            const partner = readings.get(sourcesOfReading)
            if (partner) {
                partner.contains.push(...reading.contains)
            }
            else {
                firstRelation.relates.push(reading)
                readings = bySources(firstRelation)
            }
        }
        
        const index = assumptions.findIndex(assumption => assumption.id === current.id)
        if (index === -1) {
            throw new Error(`Assumption ${current.id} (${current.relates.length} entries) found which is not part of the assumption list.`)
        }

        assumptions.splice(index, 1)
    }
}

