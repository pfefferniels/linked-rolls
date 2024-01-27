import { ContextDefinition } from "jsonld";

/**
 * =============================================================================
 * rolloContext: JSONLD Context for rollo
 * =============================================================================
 */
export const rolloContext: ContextDefinition = {
  type: {
    "@id": "@type",
    "@type": [
      "https://linked-rolls.org/roll-o/EventSpan",
      "https://linked-rolls.org/roll-o/Note",
      "https://linked-rolls.org/roll-o/Expression",
      "https://linked-rolls.org/roll-o/CollatedEvent",
      "https://linked-rolls.org/roll-o/RelativePlacement",
      "https://linked-rolls.org/roll-o/TempoAdjustment",
    ],
  },
  P91HasUnit: {
    "@id": "http://www.cidoc-crm.org/cidoc-crm/P91_has_unit",
    "@type": "http://www.w3.org/2001/XMLSchema#string",
  },
  from: {
    "@id": "https://linked-rolls.org/roll-o/from",
    "@type": "http://www.w3.org/2001/XMLSchema#decimal",
  },
  to: {
    "@id": "https://linked-rolls.org/roll-o/to",
    "@type": "http://www.w3.org/2001/XMLSchema#decimal",
  },
  L43Annotates: {
    "@id": "http://www.ics.forth.gr/isl/CRMdig/L43_annotates",
    "@type": "@id",
  },
  hasPitch: {
    "@id": "https://linked-rolls.org/roll-o/has_pitch",
    "@type": "http://www.w3.org/2001/XMLSchema#decimal",
  },
  P43HasDimension: {
    "@id": "http://www.cidoc-crm.org/cidoc-crm/P43_has_dimension",
    "@type": "@id",
  },
  hasScope: {
    "@id": "https://linked-rolls.org/roll-o/has_scope",
  },
  bass: "https://linked-rolls.org/roll-o/bass",
  treble: "https://linked-rolls.org/roll-o/treble",
  P2HasType: {
    "@id": "http://www.cidoc-crm.org/cidoc-crm/P2_has_type",
  },
  SustainPedalOn: "https://linked-rolls.org/roll-o/SustainPedalOn",
  SustainPedalOff: "https://linked-rolls.org/roll-o/SustainPedalOff",
  MezzoforteOff: "https://linked-rolls.org/roll-o/MezzoforteOff",
  MezzoforteOn: "https://linked-rolls.org/roll-o/MezzoforteOn",
  SlowCrescendoOn: "https://linked-rolls.org/roll-o/SlowCrescendoOn",
  SlowCrescendoOff: "https://linked-rolls.org/roll-o/SlowCrescendoOff",
  ForzandoOn: "https://linked-rolls.org/roll-o/ForzandoOn",
  ForzandoOff: "https://linked-rolls.org/roll-o/ForzandoOff",
  D11DigitalMeasurementEvent:
    "http://www.ics.forth.gr/isl/CRMdig/D11_Digital_Measurement_Event",
  L20HasCreated: {
    "@id": "http://www.ics.forth.gr/isl/CRMdig/L20_has_created",
    "@type": "@id",
    "@container": "@set",
  },
  P39Measured: {
    "@id": "http://www.cidoc-crm.org/cidoc-crm/P39_measured",
    "@type": "@id",
  },
  F5Item: "http://iflastandards.info/ns/fr/frbr/frbroo/F5_Item",
  E52TimeSpan: "http://www.cidoc-crm.org/cidoc-crm/E52_Time-Span",
  P82AtSomeTimeWithin: {
    "@id": "http://www.cidoc-crm.org/cidoc-crm/P82_at_some_time_within",
    "@type": "http://www.w3.org/2001/XMLSchema#string",
  },
  E5ConditionState: "http://www.cidoc-crm.org/cidoc-crm/E5_Condition_State",
  P3HasNote: {
    "@id": "http://www.cidoc-crm.org/cidoc-crm/P3_has_note",
    "@type": "http://www.w3.org/2001/XMLSchema#string",
  },
  P4HasTimeSpan: {
    "@id": "http://www.cidoc-crm.org/cidoc-crm/P4_has_time-span",
    "@type": "@id",
  },
  P44iIsConditionOf: {
    "@id": "http://www.cidoc-crm.org/cidoc-crm/P44i_is_condition_of",
    "@type": "@id",
  },
  E14ConditionAssessment:
    "http://www.cidoc-crm.org/cidoc-crm/E14_Condition_Assessment",
  P14CarriedOutBy: {
    "@id": "http://www.cidoc-crm.org/cidoc-crm/P14_carried_out_by",
    "@type": "@id",
  },
  P35HasIdentified: {
    "@id": "http://www.cidoc-crm.org/cidoc-crm/P35_has_identified",
    "@type": "@id",
  },
  wasCollatedFrom: {
    "@id": "https://linked-rolls.org/roll-o/was_collated_from",
    "@type": "@id",
    "@container": "@set",
  },
  isNonMusical: {
    "@id": "https://linked-rolls.org/roll-o/is_non_musical",
    "@type": "http://www.w3.org/2001/XMLSchema#boolean",
  },
  placed: {
    "@id": "https://linked-rolls.org/roll-o/placed",
    "@type": "@id",
  },
  relativeTo: {
    "@id": "https://linked-rolls.org/roll-o/relative_to",
    "@type": "@id",
    "@container": "@set",
  },
  withPlacementType: {
    "@id": "https://linked-rolls.org/roll-o/with_placement_type",
  },
  P176StartsBeforeTheStartOf:
    "http://www.cidoc-crm.org/cidoc-crm/P176_starts_before_the_start_of",
  P174StartsBeforeTheEndOf:
    "http://www.cidoc-crm.org/cidoc-crm/P174_starts_before_the_end_of",
  adjusts: {
    "@id": "https://linked-rolls.org/roll-o/adjusts",
    "@type": "http://iflastandards.info/ns/fr/frbr/frbroo/F5_Item",
  },
  startsWith: {
    "@id": "https://linked-rolls.org/roll-o/starts_with",
    "@type": "http://www.w3.org/2001/XMLSchema#decimal",
  },
  endsWith: {
    "@id": "https://linked-rolls.org/roll-o/ends_with",
    "@type": "http://www.w3.org/2001/XMLSchema#decimal",
  },
  NoteOnEvent: "http://purl.org/midi-ld/midi#NoteOnEvent",
  EmulationEvent: "https://linked-rolls.org/roll-o/EmulationEvent",
  performs: {
    "@id": "https://linked-rolls.org/roll-o/performs",
    "@type": "@id",
  },
  pitch: {
    "@id": "http://purl.org/midi-ld/midi#pitch",
    "@type": "http://www.w3.org/2001/XMLSchema#decimal",
  },
  velocity: {
    "@id": "http://purl.org/midi-ld/midi#velocity",
    "@type": "http://www.w3.org/2001/XMLSchema#decimal",
  },
  at: {
    "@id": "https://linked-rolls.org/roll-o/at",
    "@type": [
      "http://www.w3.org/2001/XMLSchema#decimal",
      "http://www.w3.org/2001/XMLSchema#short",
    ],
  },
  NoteOffEvent: "http://purl.org/midi-ld/midi#NoteOffEvent",
};
