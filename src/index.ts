/**
 * Digital editions of piano rolls: reading an edition and writing it out
 * as JSON-LD, finding what it holds, changing it through operations on
 * an immer draft, reading copies from scans and analysis files,
 * collating them into versions, and working out what the edition can
 * and cannot vouch for. The reproducing systems that play a version are
 * entry points of their own, so that the emulator they need is loaded
 * only where it is wanted.
 *
 * The public interface of the library. Everything else under lib/ is its
 * implementation and may change in any release: the in-place helpers the
 * operations are built from, the date conversions of the serialisation,
 * and the general utilities. So may the exports tagged `@internal`,
 * which the API reference leaves out.
 *
 * @module linked-rolls
 */
export type { WithId, WithNote, WithType } from './shared/utils.js'
export * from './model/Quantity.js'
// Named here so that the reference can describe it: a doc comment on the
// declaration would be copied into the generated schema once per unit.
/**
 * A number in a unit, the unit carried in the type alone: at runtime it
 * is the plain number it was made from. A number becomes a quantity only
 * through a constructor such as `mm` or `track`, and a quantity in one
 * unit cannot stand in for one in another.
 * @category Model
 */
export type { Quantity } from './model/Quantity.js'
export * from './model/Agent.js'
export * from './model/Assumption.js'
export * from './model/ConditionState.js'
export * from './model/Symbol.js'
export * from './model/Feature.js'
export * from './model/Edit.js'
export * from './model/Version.js'
export * from './collation/Collation.js'
export * from './model/TrackCalibration.js'
export * from './systems/TrackerBar.js'
export * from './systems/welteT100/bar.js'
export * from './systems/welteLicensee/bar.js'
export * from './systems/welteT98/bar.js'
export * from './systems/index.js'
export * from './systems/ReproducingSystem.js'
export * from './model/FeatureSource.js'
export * from './model/Perforator.js'
export * from './model/RollCopy.js'
export * from './model/procedures.js'
export * from './model/vocabulary.js'
export * from './analysis/reservations.js'
export * from './analysis/witnesses.js'
export { alignFeatures, ALIGNMENT_METHOD, fromAxis, ownFeaturesOf, toAxis, tooShortToShorten, type AlignmentResult } from './collation/alignment.js'
export * from './collation/statistics.js'
export * from './model/Edition.js'
export * from './lookup/lookup.js'
export * from './lookup/paths.js'
export * from './analysis/stemma.js'
export * from './analysis/text.js'
export * from './analysis/ownPaper.js'
export * from './analysis/paper.js'
export * from './emulation/negotiation.js'
export * from './collation/scatter.js'
export * from './ops/index.js'
export * from './emulation/Emulation.js'
/** @category Reading and writing */
export { validate, type ValidateEdition } from './validate.js'
export * from './analysis/constraints.js'
export * from './collation/substitution.js'
export * from './io/context.js'
export * from './analysis/sigla.js'
export * from './model/notes.js'
export { asJsonLd } from './io/asJsonLd.js'
export { importJsonLd } from './io/importJsonLd.js'
export { migrate } from './io/migrate.js'
export { readFromStanfordAton, type StanfordAtonOptions } from './readers/stanfordAton.js'
export { readFromPhillipsEroll, CONTROL_OFFSET, phillipsSystems, type PhillipsErollOptions } from './readers/phillipsEroll.js'
export { readFromSpencerBar, readSpencerAnn, paperSpeedOfSpencerAnn, SPENCER_ROWS_PER_INCH, type SpencerBarOptions } from './readers/spencerBar.js'
