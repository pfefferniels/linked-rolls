import { ShapeType } from "@ldo/ldo";
import { rolloSchema } from "./rollo.schema";
import { rolloContext } from "./rollo.context";
import {
  EventSpan,
  Note,
  Expression,
  MeasurementEvent,
  PhysicalRollCopy,
  TimeSpan,
  ConditionState,
  ConditionAssessment,
  CollatedEvent,
  RelativePlacement,
  TempoAdjustment,
  NoteOnEvent,
  NoteOffEvent,
  SustainPedalOnEvent,
  SustainPedalOffEvent,
} from "./rollo.typings";

/**
 * =============================================================================
 * LDO ShapeTypes rollo
 * =============================================================================
 */

/**
 * EventSpan ShapeType
 */
export const EventSpanShapeType: ShapeType<EventSpan> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/EventSpan",
  context: rolloContext,
};

/**
 * Note ShapeType
 */
export const NoteShapeType: ShapeType<Note> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/Note",
  context: rolloContext,
};

/**
 * Expression ShapeType
 */
export const ExpressionShapeType: ShapeType<Expression> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/Expression",
  context: rolloContext,
};

/**
 * MeasurementEvent ShapeType
 */
export const MeasurementEventShapeType: ShapeType<MeasurementEvent> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/MeasurementEvent",
  context: rolloContext,
};

/**
 * PhysicalRollCopy ShapeType
 */
export const PhysicalRollCopyShapeType: ShapeType<PhysicalRollCopy> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/PhysicalRollCopy",
  context: rolloContext,
};

/**
 * TimeSpan ShapeType
 */
export const TimeSpanShapeType: ShapeType<TimeSpan> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/TimeSpan",
  context: rolloContext,
};

/**
 * ConditionState ShapeType
 */
export const ConditionStateShapeType: ShapeType<ConditionState> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/ConditionState",
  context: rolloContext,
};

/**
 * ConditionAssessment ShapeType
 */
export const ConditionAssessmentShapeType: ShapeType<ConditionAssessment> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/ConditionAssessment",
  context: rolloContext,
};

/**
 * CollatedEvent ShapeType
 */
export const CollatedEventShapeType: ShapeType<CollatedEvent> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/CollatedEvent",
  context: rolloContext,
};

/**
 * RelativePlacement ShapeType
 */
export const RelativePlacementShapeType: ShapeType<RelativePlacement> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/RelativePlacement",
  context: rolloContext,
};

/**
 * TempoAdjustment ShapeType
 */
export const TempoAdjustmentShapeType: ShapeType<TempoAdjustment> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/TempoAdjustment",
  context: rolloContext,
};

/**
 * NoteOnEvent ShapeType
 */
export const NoteOnEventShapeType: ShapeType<NoteOnEvent> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/NoteOnEvent",
  context: rolloContext,
};

/**
 * NoteOffEvent ShapeType
 */
export const NoteOffEventShapeType: ShapeType<NoteOffEvent> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/NoteOffEvent",
  context: rolloContext,
};

/**
 * SustainPedalOnEvent ShapeType
 */
export const SustainPedalOnEventShapeType: ShapeType<SustainPedalOnEvent> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/SustainPedalOnEvent",
  context: rolloContext,
};

/**
 * SustainPedalOffEvent ShapeType
 */
export const SustainPedalOffEventShapeType: ShapeType<SustainPedalOffEvent> = {
  schema: rolloSchema,
  shape: "https://ldo.js.org/SustainPedalOffEvent",
  context: rolloContext,
};
