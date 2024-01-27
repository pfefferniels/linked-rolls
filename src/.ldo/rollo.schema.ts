import { Schema } from "shexj";

/**
 * =============================================================================
 * rolloSchema: ShexJ Schema for rollo
 * =============================================================================
 */
export const rolloSchema: Schema = {
  type: "Schema",
  shapes: [
    {
      id: "https://ldo.js.org/EventSpan",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "https://linked-rolls.org/roll-o/EventSpan",
              },
              annotations: [
                {
                  type: "Annotation",
                  predicate: "http://www.w3.org/2000/01/rdf-schema#comment",
                  object: {
                    value: "Represents a measured region on the piano roll.",
                  },
                },
              ],
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.cidoc-crm.org/cidoc-crm/P91_has_unit",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#string",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/from",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#decimal",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/to",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#decimal",
              },
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/Note",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "https://linked-rolls.org/roll-o/Note",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.ics.forth.gr/isl/CRMdig/L43_annotates",
              valueExpr: {
                type: "NodeConstraint",
                nodeKind: "iri",
              },
              min: 0,
              max: 1,
              annotations: [
                {
                  type: "Annotation",
                  predicate: "http://www.w3.org/2000/01/rdf-schema#comment",
                  object: {
                    value: "IIIF region in string form.",
                  },
                },
              ],
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/has_pitch",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#decimal",
              },
              annotations: [
                {
                  type: "Annotation",
                  predicate: "http://www.w3.org/2000/01/rdf-schema#comment",
                  object: {
                    value: "Pitch information as a MIDI key.",
                  },
                },
              ],
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.cidoc-crm.org/cidoc-crm/P43_has_dimension",
              valueExpr: "https://ldo.js.org/EventSpan",
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/Expression",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "https://linked-rolls.org/roll-o/Expression",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.ics.forth.gr/isl/CRMdig/L43_annotates",
              valueExpr: {
                type: "NodeConstraint",
                nodeKind: "iri",
              },
              min: 0,
              max: 1,
              annotations: [
                {
                  type: "Annotation",
                  predicate: "http://www.w3.org/2000/01/rdf-schema#comment",
                  object: {
                    value: "IIIF region in string form.",
                  },
                },
              ],
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/has_scope",
              valueExpr: {
                type: "NodeConstraint",
                values: [
                  "https://linked-rolls.org/roll-o/bass",
                  "https://linked-rolls.org/roll-o/treble",
                ],
              },
              min: 0,
              max: 1,
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.cidoc-crm.org/cidoc-crm/P2_has_type",
              valueExpr: {
                type: "NodeConstraint",
                values: [
                  "https://linked-rolls.org/roll-o/SustainPedalOn",
                  "https://linked-rolls.org/roll-o/SustainPedalOff",
                  "https://linked-rolls.org/roll-o/MezzoforteOff",
                  "https://linked-rolls.org/roll-o/MezzoforteOn",
                  "https://linked-rolls.org/roll-o/SlowCrescendoOn",
                  "https://linked-rolls.org/roll-o/SlowCrescendoOff",
                  "https://linked-rolls.org/roll-o/ForzandoOn",
                  "https://linked-rolls.org/roll-o/ForzandoOff",
                ],
              },
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.cidoc-crm.org/cidoc-crm/P43_has_dimension",
              valueExpr: "https://ldo.js.org/EventSpan",
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/MeasurementEvent",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                values: [
                  "http://www.ics.forth.gr/isl/CRMdig/D11_Digital_Measurement_Event",
                ],
              },
              annotations: [
                {
                  type: "Annotation",
                  predicate: "http://www.w3.org/2000/01/rdf-schema#comment",
                  object: {
                    value: "Represents a measurement event.",
                  },
                },
              ],
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.ics.forth.gr/isl/CRMdig/L20_has_created",
              valueExpr: "https://ldo.js.org/Note",
              min: 0,
              max: -1,
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.ics.forth.gr/isl/CRMdig/L20_has_created",
              valueExpr: "https://ldo.js.org/Expression",
              min: 0,
              max: -1,
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.cidoc-crm.org/cidoc-crm/P39_measured",
              valueExpr: "https://ldo.js.org/PhysicalRollCopy",
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/PhysicalRollCopy",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                values: ["http://iflastandards.info/ns/fr/frbr/frbroo/F5_Item"],
              },
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.cidoc-crm.org/cidoc-crm/P2_has_type",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#string",
              },
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/TimeSpan",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                values: ["http://www.cidoc-crm.org/cidoc-crm/E52_Time-Span"],
              },
            },
            {
              type: "TripleConstraint",
              predicate:
                "http://www.cidoc-crm.org/cidoc-crm/P82_at_some_time_within",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#string",
              },
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/ConditionState",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                values: [
                  "http://www.cidoc-crm.org/cidoc-crm/E5_Condition_State",
                ],
              },
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.cidoc-crm.org/cidoc-crm/P3_has_note",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#string",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.cidoc-crm.org/cidoc-crm/P4_has_time-span",
              valueExpr: "https://ldo.js.org/TimeSpan",
            },
            {
              type: "TripleConstraint",
              predicate:
                "http://www.cidoc-crm.org/cidoc-crm/P44i_is_condition_of",
              valueExpr: "https://ldo.js.org/PhysicalRollCopy",
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/ConditionAssessment",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                values: [
                  "http://www.cidoc-crm.org/cidoc-crm/E14_Condition_Assessment",
                ],
              },
            },
            {
              type: "TripleConstraint",
              predicate:
                "http://www.cidoc-crm.org/cidoc-crm/P14_carried_out_by",
              valueExpr: {
                type: "NodeConstraint",
                nodeKind: "iri",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "http://www.cidoc-crm.org/cidoc-crm/P4_has_time-span",
              valueExpr: "https://ldo.js.org/TimeSpan",
            },
            {
              type: "TripleConstraint",
              predicate:
                "http://www.cidoc-crm.org/cidoc-crm/P35_has_identified",
              valueExpr: "https://ldo.js.org/ConditionState",
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/CollatedEvent",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "https://linked-rolls.org/roll-o/CollatedEvent",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/was_collated_from",
              valueExpr: "https://ldo.js.org/Note",
              min: 0,
              max: -1,
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/was_collated_from",
              valueExpr: "https://ldo.js.org/Expression",
              min: 0,
              max: -1,
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/is_non_musical",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#boolean",
              },
              min: 0,
              max: 1,
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/RelativePlacement",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "https://linked-rolls.org/roll-o/RelativePlacement",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/placed",
              valueExpr: "https://ldo.js.org/CollatedEvent",
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/relative_to",
              valueExpr: "https://ldo.js.org/CollatedEvent",
              min: 1,
              max: -1,
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/with_placement_type",
              valueExpr: {
                type: "NodeConstraint",
                values: [
                  "http://www.cidoc-crm.org/cidoc-crm/P176_starts_before_the_start_of",
                  "http://www.cidoc-crm.org/cidoc-crm/P174_starts_before_the_end_of",
                ],
              },
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/TempoAdjustment",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "https://linked-rolls.org/roll-o/TempoAdjustment",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/adjusts",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://iflastandards.info/ns/fr/frbr/frbroo/F5_Item",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/starts_with",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#decimal",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/ends_with",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#decimal",
              },
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/NoteOnEvent",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                values: [
                  "http://purl.org/midi-ld/midi#NoteOnEvent",
                  "https://linked-rolls.org/roll-o/EmulationEvent",
                ],
              },
              min: 0,
              max: 1,
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/performs",
              valueExpr: "https://ldo.js.org/CollatedEvent",
            },
            {
              type: "TripleConstraint",
              predicate: "http://purl.org/midi-ld/midi#pitch",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#decimal",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "http://purl.org/midi-ld/midi#velocity",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#decimal",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/at",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#decimal",
              },
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/NoteOffEvent",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                values: [
                  "http://purl.org/midi-ld/midi#NoteOffEvent",
                  "https://linked-rolls.org/roll-o/EmulationEvent",
                ],
              },
              min: 0,
              max: 1,
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/performs",
              valueExpr: "https://ldo.js.org/CollatedEvent",
            },
            {
              type: "TripleConstraint",
              predicate: "http://purl.org/midi-ld/midi#pitch",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#decimal",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "http://purl.org/midi-ld/midi#velocity",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#decimal",
              },
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/at",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#short",
              },
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/PedalOnEvent",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                values: [
                  "http://purl.org/midi-ld/midi#NoteOffEvent",
                  "https://linked-rolls.org/roll-o/EmulationEvent",
                ],
              },
              min: 0,
              max: 1,
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/performs",
              valueExpr: "https://ldo.js.org/CollatedEvent",
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/at",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#short",
              },
            },
          ],
        },
      },
    },
    {
      id: "https://ldo.js.org/PedalOffEvent",
      type: "ShapeDecl",
      shapeExpr: {
        type: "Shape",
        expression: {
          type: "EachOf",
          expressions: [
            {
              type: "TripleConstraint",
              predicate: "http://www.w3.org/1999/02/22-rdf-syntax-ns#type",
              valueExpr: {
                type: "NodeConstraint",
                values: [
                  "http://purl.org/midi-ld/midi#NoteOffEvent",
                  "https://linked-rolls.org/roll-o/EmulationEvent",
                ],
              },
              min: 0,
              max: 1,
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/performs",
              valueExpr: "https://ldo.js.org/CollatedEvent",
            },
            {
              type: "TripleConstraint",
              predicate: "https://linked-rolls.org/roll-o/at",
              valueExpr: {
                type: "NodeConstraint",
                datatype: "http://www.w3.org/2001/XMLSchema#short",
              },
            },
          ],
        },
      },
    },
  ],
};
