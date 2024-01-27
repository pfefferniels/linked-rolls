import { ContextDefinition } from "jsonld";

/**
 * =============================================================================
 * Typescript Typings for rollo
 * =============================================================================
 */

/**
 * EventSpan Type
 */
export interface EventSpan {
  "@id"?: string;
  "@context"?: ContextDefinition;
  /**
   * Represents a measured region on the piano roll.
   */
  type?: {
    "@id": "EventSpan";
  };
  P91HasUnit: string;
  from: number;
  to: number;
}

/**
 * Note Type
 */
export interface Note {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type?: {
    "@id": "Note";
  };
  /**
   * IIIF region in string form.
   */
  L43Annotates?: {
    "@id": string;
  };
  /**
   * Pitch information as a MIDI key.
   */
  hasPitch: number;
  P43HasDimension: EventSpan;
}

/**
 * Expression Type
 */
export interface Expression {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type?: {
    "@id": "Expression";
  };
  /**
   * IIIF region in string form.
   */
  L43Annotates?: {
    "@id": string;
  };
  hasScope?:
    | {
        "@id": "bass";
      }
    | {
        "@id": "treble";
      };
  P2HasType:
    | {
        "@id": "SustainPedalOn";
      }
    | {
        "@id": "SustainPedalOff";
      }
    | {
        "@id": "MezzoforteOff";
      }
    | {
        "@id": "MezzoforteOn";
      }
    | {
        "@id": "SlowCrescendoOn";
      }
    | {
        "@id": "SlowCrescendoOff";
      }
    | {
        "@id": "ForzandoOn";
      }
    | {
        "@id": "ForzandoOff";
      };
  P43HasDimension: EventSpan;
}

/**
 * MeasurementEvent Type
 */
export interface MeasurementEvent {
  "@id"?: string;
  "@context"?: ContextDefinition;
  /**
   * Represents a measurement event.
   */
  type: {
    "@id": "D11DigitalMeasurementEvent";
  };
  L20HasCreated?: (Note | Expression)[];
  P39Measured: PhysicalRollCopy;
}

/**
 * PhysicalRollCopy Type
 */
export interface PhysicalRollCopy {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type: {
    "@id": "F5Item";
  };
  P2HasType: string;
}

/**
 * TimeSpan Type
 */
export interface TimeSpan {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type: {
    "@id": "E52TimeSpan";
  };
  P82AtSomeTimeWithin: string;
}

/**
 * ConditionState Type
 */
export interface ConditionState {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type: {
    "@id": "E5ConditionState";
  };
  P3HasNote: string;
  P4HasTimeSpan: TimeSpan;
  P44iIsConditionOf: PhysicalRollCopy;
}

/**
 * ConditionAssessment Type
 */
export interface ConditionAssessment {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type: {
    "@id": "E14ConditionAssessment";
  };
  P14CarriedOutBy: {
    "@id": string;
  };
  P4HasTimeSpan: TimeSpan;
  P35HasIdentified: ConditionState;
}

/**
 * CollatedEvent Type
 */
export interface CollatedEvent {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type: {
    "@id": "CollatedEvent";
  };
  wasCollatedFrom?: (Note | Expression)[];
  isNonMusical?: boolean;
}

/**
 * RelativePlacement Type
 */
export interface RelativePlacement {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type?: {
    "@id": "RelativePlacement";
  };
  placed: CollatedEvent;
  relativeTo: CollatedEvent[];
  withPlacementType:
    | {
        "@id": "P176StartsBeforeTheStartOf";
      }
    | {
        "@id": "P174StartsBeforeTheEndOf";
      };
}

/**
 * TempoAdjustment Type
 */
export interface TempoAdjustment {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type?: {
    "@id": "TempoAdjustment";
  };
  adjusts: string;
  startsWith: number;
  endsWith: number;
}

/**
 * NoteOnEvent Type
 */
export interface NoteOnEvent {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type?:
    | {
        "@id": "NoteOnEvent";
      }
    | {
        "@id": "EmulationEvent";
      };
  performs: CollatedEvent;
  pitch: number;
  velocity: number;
  at: number;
}

/**
 * NoteOffEvent Type
 */
export interface NoteOffEvent {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type?:
    | {
        "@id": "NoteOffEvent";
      }
    | {
        "@id": "EmulationEvent";
      };
  performs: CollatedEvent;
  pitch: number;
  velocity: number;
  at: number;
}

/**
 * SustainPedalOnEvent Type
 */
export interface SustainPedalOnEvent {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type?:
    | {
        "@id": "SustainPedalOnEvent";
      }
    | {
        "@id": "EmulationEvent";
      };
  performs: CollatedEvent;
  at: number;
}

/**
 * SustainPedalOffEvent Type
 */
export interface SustainPedalOffEvent {
  "@id"?: string;
  "@context"?: ContextDefinition;
  type?:
    | {
        "@id": "SustainPedalOffEvent";
      }
    | {
        "@id": "EmulationEvent";
      };
  performs: CollatedEvent;
  at: number;
}
