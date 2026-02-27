# Schema Description Review Checklist

Review all TSDoc descriptions added for the schema documentation.

## `src/utils.ts`

- [ ] `WithType.type` — The type discriminator for this object. Maps to rdf:type via the JSON-LD `@type` keyword.
- [ ] `WithId.id` — A unique identifier for this object. Maps to the JSON-LD `@id` keyword.
- [ ] `WithActor.actor` — The person who carried out this action. Maps to crm:P14 carried out by.
- [ ] `WithNote.note` — A free-text note providing additional context. Maps to crm:P3 has note.

## `src/Symbol.ts`

- [ ] `Symbol` (interface) — A symbol is an abstract musical or textual entity carried by one or more physical features on the roll. Symbols are the result of interpreting the physical features (holes, writings, etc.) on the roll copies.
- [ ] `Symbol.carriers` — References to the physical features (e.g. holes) on the roll copies that carry this symbol. Each carrier is a reference assumption pointing to a feature by its `@id`.
- [ ] `Perforation` (interface) — A perforation is a symbol that is encoded as a punched hole in the roll. Perforations may be aligned with a reference position in a score or other normative source.
- [ ] `Perforation.alignedWith` — An optional alignment with a reference position (e.g. a beat position in a score). This is a value assumption so that the alignment can be annotated with a belief.
- [ ] `Note` (interface) — A note symbol, representing a single pitched musical event on the roll. The pitch is encoded via the tracker bar position (track number).
- [ ] `Note.pitch` — The MIDI pitch number of the note (e.g. 60 for middle C).
- [ ] `ExpressionScope` (type) — The scope of an expression perforation, indicating whether it applies to the bass or treble register of the piano.
- [ ] `ExpressionType` (type) — The type of expression encoded by a perforation on the roll. These correspond to the control perforations on reproducing piano rolls (e.g. Welte-Mignon T100 system).
- [ ] `Expression` (interface) — An expression symbol, representing a control perforation on the roll that governs dynamics, pedaling, or mechanical functions of the reproducing piano. Each expression has a scope (bass or treble) and a specific expression type.
- [ ] `Expression.scope` — Whether this expression applies to the bass or treble register.
- [ ] `Expression.expressionType` — The specific type of expression (e.g. sustain pedal, forzando, etc.).
- [ ] `Text` (interface) — A textual symbol, e.g. a label or annotation found on the roll. Maps to crm:E33 Linguistic Object.
- [ ] `Text.text` — The text content of the symbol. Maps to crm:P3 has note.
- [ ] `AnySymbol` (type) — A symbol can be either a note, an expression, or a text. Notes and expressions are perforations; texts are carried by writings.

## `src/Feature.ts`

- [ ] `HorizontalSpan` (interface) — Describes the horizontal extent of a feature on the roll, measured in millimeters from the beginning of the roll. The `from` value is the start position and `to` is the end position.
- [ ] `HorizontalSpan.unit` — The unit of measurement for horizontal positions. Always 'mm' (millimeters).
- [ ] `HorizontalSpan.from` — The start position of the feature in millimeters from the beginning of the roll.
- [ ] `HorizontalSpan.to` — The end position of the feature in millimeters from the beginning of the roll.
- [ ] `VerticalSpan` (interface) — Describes the vertical extent of a feature on the roll, measured in track numbers. Track numbers correspond to positions on the tracker bar.
- [ ] `VerticalSpan.unit` — The unit of measurement for vertical positions. Always 'track' (tracker bar track number).
- [ ] `VerticalSpan.from` — The start track number of the feature.
- [ ] `VerticalSpan.to` — The end track number, if the feature spans multiple tracks. If omitted, the feature occupies a single track.
- [ ] `RollFeature` (interface) — A feature on the roll, e.g. a perforation, a tear, a mark, etc., defined by its horizontal and vertical position and extent.
- [ ] `RollFeature.depiction` — IIIF region pointing to a depiction of this feature in the scan.
- [ ] `RollFeature.horizontal` — Horizontal span of the feature on the roll. Usually given in millimeters.
- [ ] `RollFeature.vertical` — Vertical span of the feature on the roll. Usually given in track numbers.
- [ ] `Hole` (interface) — A hole (perforation) in the roll paper. Holes are the primary carriers of musical information on piano rolls, as they trigger notes and expression controls when passing over the tracker bar.
- [ ] `Hole.pattern` — The punching pattern of the hole. Regular holes have evenly-spaced bridges, accelerating holes have decreasing bridge widths, and staggering holes alternate between adjacent tracks (cf. Phillips).
- [ ] `Trace` (interface) — A trace is a visible mark or writing on the roll surface. Traces may fade over time.
- [ ] `WritingMethod` (type) — The method by which a writing was produced on the roll: printed, handwritten, or stamped.
- [ ] `Writing` (interface) — A piece of writing found on the roll, such as a label, catalogue number, or annotation. Writings have a method of production and a transcription of their content.
- [ ] `Writing.method` — The method by which this writing was produced (e.g. Print, Handwriting, or Stamp).
- [ ] `Writing.transcription` — A transcription of the text content of the writing. This is an object assumption so that the transcription can be annotated with a belief about its correctness.
- [ ] `Mark` (interface) — A visible mark on the roll, such as a pencil mark, ink mark, or other non-textual annotation.
- [ ] `GluedOn` (interface) — A piece of material (paper or tape) glued onto the roll surface. Glued-on features are typically used to cover perforations (for corrections) or to reinforce damaged areas. They may themselves carry other features such as writings or additional holes.
- [ ] `GluedOn.material` — The material of the glued-on feature. Maps to crm:P45 consists of.
- [ ] `GluedOn.features` — A glued-on feature itself may carry other features. Nested features do not need to be positioned explicitly. Maps to crm:P56 bears feature.
- [ ] `AnyFeature` (type) — The union of all physical feature types that can appear on a roll: holes (perforations), writings (labels, annotations), marks (pencil, ink), and glued-on patches (paper, tape).

## `src/Assumption.ts`

- [ ] `Certainty` (type) — Certainty levels for beliefs, ranging from 'true' (certain) through 'likely', 'possible', 'unlikely', to 'false' (certainly not).
- [ ] `Argumentation` (interface) — An argumentation provides reasons for a belief and may be associated with a person carrying out that argumentation.
- [ ] `MeaningComprehension` (interface) — A meaning comprehension interprets or disambiguates the meaning of symbols or features. For example, interpreting a pencil mark as an instruction to add or remove a perforation.
- [ ] `MeaningComprehension.comprehends` — References (by `@id`) to the symbols or features whose meaning is being interpreted.
- [ ] `Inference` (interface) — An inference draws a conclusion from given premises.
- [ ] `Inference.premises` — References (by `@id`) to the beliefs or facts from which the conclusion is drawn.
- [ ] `BeliefAdoption` (interface) — A belief adoption adopts someone else's belief. This type is used to indicate e.g. knowledge through private communication or from secondary literature.
- [ ] `BeliefAdoption.note` — A note describing the source of the adopted belief, e.g. a bibliographic reference or personal communication.
- [ ] `AnyArgumentation` (type) — An argumentation can be either a plain argumentation, a meaning comprehension, an inference, or a belief adoption.
- [ ] `Belief` (interface) — A belief associates a certainty with an assumption and provides reasons for it.
- [ ] `Belief.certainty` — The level of certainty associated with this belief.
- [ ] `Belief.reasons` — The argumentations providing reasons for this belief.
- [ ] `Assumption` (interface) — An assumption is the reification of a triple. This leverages the `@annotation` element from JSON-LD-star. Any property in the edition can be annotated with a belief to express uncertainty or provide justification for the stated value.
- [ ] `Assumption['@annotation']` — An optional annotation expressing a belief about this assumption. Uses the JSON-LD-star `@annotation` mechanism to attach epistemic metadata (certainty and reasons) to any triple.
- [ ] `ValueAssumption` (interface) — A value assumption wraps a literal value with an optional annotation. Used for properties where the value itself may be uncertain, e.g. dates or alignment references.
- [ ] `ValueAssumption['@value']` — The assumed value.
- [ ] `ReferenceAssumption` (type) — A reference assumption wraps a reference (by `@id`) with an optional annotation. Used when pointing to another entity whose association may be uncertain.
- [ ] `ObjectAssumption` (type) — An object assumption wraps a complex object with an optional annotation. Used for structured values (e.g. persons, conditions) whose properties may be uncertain.

## `src/Edit.ts`

- [ ] `EditType` (type) — The type of editorial change applied to a symbol or set of symbols. Classifies the nature of the edit, e.g. whether it corrects an error, adds an accent, shifts a note, or shortens/prolongs a perforation.
- [ ] `ActorAssignment` (type) — An actor assignment associates a person with an action. It is an object assumption so that the attribution can be annotated with a belief about its certainty.
- [ ] `Edit` (interface) — A set of edits transforms a version of a roll into another version. Edits insert or delete symbols, or both (= replace). Edits may be motivated by a given set of reasons. If an edit is the interpretation of a metamark, this should be made explicit using a meaning comprehension on the `@annotation` field.
- [ ] `Edit.editType` — The type of editorial change (e.g. 'correct-error', 'additional-accent').
- [ ] `Edit.motivation` — A textual description of the motivation for this edit, referencing a motivation defined in the version's motivations list.
- [ ] `Edit.insert` — The symbols to be inserted by this edit.
- [ ] `Edit.delete` — References (by `@id`) to the symbols to be deleted by this edit.

## `src/Version.ts`

- [ ] `VersionType` (type) — The type of a version. An 'edition' version may serve as the master for several roll copies; a 'unicum' version exists only on one specific copy.
- [ ] `Motivation` (type) — A motivation provides a reason or rationale for an editorial change. Motivations are defined at the version level and referenced by edits.
- [ ] `Version.edits` — The list of edits that, applied to the base version, produce this version.
- [ ] `Version.motivations` — A collection of motivations used in this version's edits.

## `src/RollCopy.ts`

- [ ] `PaperStretch.factor` — The stretch factor, e.g. 1.02 means the paper has stretched by 2% compared to its original dimensions.
- [ ] `GeneralRollCondition` (interface) — A general condition description for a roll copy, e.g. overall wear, discoloration, or other observations.
- [ ] `RollConditionAssignment` (type) — An assignment of a condition (general or paper-stretch) to a roll copy, annotatable with a belief about its certainty.
- [ ] `Shift` (interface) — A shift correction applied to a roll copy to align it with other copies. The shift is defined as horizontal (along the roll length, in mm) and vertical (across tracks).
- [ ] `Shift.horizontal` — Horizontal shift in millimeters (along the roll length).
- [ ] `Shift.vertical` — Vertical shift in track numbers (across the tracker bar).
- [ ] `DateAssignment` (type) — A date value wrapped as an assumption, so that the date can be annotated with a belief about its certainty and source.
- [ ] `ProductionEvent` (interface) — Describes the production of a roll copy, including the manufacturing company, the roll system, and the paper used.
- [ ] `ProductionEvent.company` — The company that produced the roll copy (e.g. "M. Welte & Söhne").
- [ ] `ProductionEvent.system` — The roll system used for production (e.g. "Welte-Mignon T100", "Welte-Mignon T98").
- [ ] `ProductionEvent.paper` — The paper type used for the roll copy.
- [ ] `ProductionEvent.date` — The date of production, if known.
- [ ] `RollCopy` (interface) — A physical copy of a roll, held at a specific location. Each roll copy has its own set of features, measurements, conditions, and modifications. Multiple copies of the same roll may exist across different archives or collections. This type maps to crm:E22 Human-Made Object.
- [ ] `RollCopy.ops` — A list of operations that have been applied to this copy's features (e.g. 'shifted', 'stretched') to normalize measurements for comparison with other copies.
- [ ] `RollCopy.measurements` — Physical measurements of this roll copy, including dimensions, punch diameter, hole separation, margins, shift corrections, and information about the measuring software.
- [ ] `measurements.dimensions` — The physical dimensions of the roll.
- [ ] `dimensions.width` — The width of the roll in the given unit.
- [ ] `dimensions.height` — The total height (length) of the roll in the given unit.
- [ ] `dimensions.unit` — The unit of measurement (e.g. 'mm').
- [ ] `measurements.punchDiameter` — The average diameter of punched holes.
- [ ] `punchDiameter.value` — The measured punch diameter value.
- [ ] `punchDiameter.unit` — The unit of measurement (e.g. 'mm').
- [ ] `measurements.holeSeparation` — The distance between adjacent tracker bar holes.
- [ ] `holeSeparation.value` — The measured hole separation value.
- [ ] `holeSeparation.unit` — The unit of measurement (e.g. 'px', 'mm').
- [ ] `measurements.margins` — The margins on the treble and bass sides of the roll.
- [ ] `margins.treble` — The margin on the treble side.
- [ ] `margins.bass` — The margin on the bass side.
- [ ] `margins.unit` — The unit of measurement (e.g. 'px', 'mm').
- [ ] `measurements.measuredBy` — Information about the software used to take the measurements.
- [ ] `measuredBy.software` — The name of the measurement software.
- [ ] `measuredBy.version` — The version of the measurement software.
- [ ] `measuredBy.date` — The date on which the measurements were taken.
- [ ] `RollCopy.production` — The production event that created this roll copy.
- [ ] `RollCopy.conditions` — Condition assessments of this roll copy (e.g. paper stretch, general wear). Each condition is an assumption annotatable with a belief.
- [ ] `RollCopy.location` — The current physical location or archive where this copy is held.

## `src/Edition.ts`

- [ ] `EditionCreation.publisher` — The person or institution responsible for publishing the edition.
- [ ] `EditionCreation.publicationDate` — The date on which the edition was published.
- [ ] `EditionCreation.collationTolerance` — The tolerance parameters used when collating (aligning) the different roll copies for this edition. Maps to L13 used parameters.
- [ ] `RollTempo` (interface) — The playback tempo of the roll, specified as a starting and ending speed. The tempo may change over the course of the roll due to acceleration effects.
- [ ] `RollTempo.startsWith` — The tempo at the beginning of the roll.
- [ ] `RollTempo.endsWith` — The tempo at the end of the roll.
- [ ] `RollTempo.unit` — The unit of the tempo measurement (e.g. 'ft/min', 'm/min').
- [ ] `Edition.creation` — Information about the creation of this edition, including publisher and publication date.
- [ ] `Edition.copies` — The physical roll copies on which this edition is based.
- [ ] `Edition.versions` — The different versions of the roll on which this edition is based. This property refers to lrm:R76 is derivative of.
- [ ] `Edition.tempoAdjustment` — An optional tempo adjustment for playback of the roll, annotatable with a belief about its correctness.

## `src/ConditionState.ts`

- [ ] `ConditionState.description` — A free-text description of the condition, providing details beyond the type classification.

## `src/Collation.ts`

- [ ] `CollationTolerance.toleranceStart` — Tolerance at the start position of a feature (in mm).
- [ ] `CollationTolerance.toleranceEnd` — Tolerance at the end position of a feature (in mm).

## `schema/postprocess.js` (auto-injected fallbacks)

- [ ] `@id` (wherever missing in schema) — A unique identifier for this object. Maps to the JSON-LD `@id` keyword.
- [ ] `@type` (wherever missing in schema) — The type discriminator for this object. Maps to rdf:type via the JSON-LD `@type` keyword.
