import type {InterpolationTriple} from '@theatre/core/sequences/interpolationTripleAtPosition'
import interpolationTripleAtPosition from '@theatre/core/sequences/interpolationTripleAtPosition'
import type Sheet from '@theatre/core/sheets/Sheet'
import type {
  PathToProp,
  SheetObjectAddress,
} from '@theatre/shared/utils/addresses'

import deepMergeWithCache from '@theatre/shared/utils/deepMergeWithCache'
import type {SequenceTrackId} from '@theatre/shared/utils/ids'
import pointerDeep from '@theatre/shared/utils/pointerDeep'
import SimpleCache from '@theatre/shared/utils/SimpleCache'
import type {
  $FixMe,
  $IntentionalAny,
  DeepPartialOfSerializableValue,
  SerializableMap,
  SerializablePrimitive,
  SerializableValue,
} from '@theatre/shared/utils/types'
import type {IDerivation, Pointer} from '@theatre/dataverse'

import {Atom, getPointerParts, pointer, prism, val} from '@theatre/dataverse'
import type SheetObjectTemplate from './SheetObjectTemplate'
import TheatreSheetObject from './TheatreSheetObject'
import type {
  Interpolator,
  PropTypeConfig_AllSimples,
} from '@theatre/core/propTypes'
import {getPropConfigByPath} from '@theatre/shared/propTypes/utils'
import type {ILogger, IUtilContext} from '@theatre/shared/logger'
import type {PathedDerivable} from '@theatre/dataverse/src/Atom'
import {pathedDerivation} from '@theatre/dataverse/src/Atom'
import getDeep from '@theatre/shared/utils/getDeep'
import type {IPropPathToTrackIdTree} from './SheetObjectTemplate'

type IPropPathToInterpolationTripleTree =
  | {
      [propName in string]?:
        | InterpolationTriple
        | IPropPathToInterpolationTripleTree
    }
  | InterpolationTriple

/**
 * Internally, the sheet's actual configured value is not a specific type, since we
 * can change the prop config at will, as such this is an alias of {@link SerializableMap}.
 *
 * TODO: Incorporate this knowledge into SheetObject & TemplateSheetObject
 */
type SheetObjectPropsValue = SerializableMap

/**
 * An object on a sheet consisting of zero or more properties which can
 * be overridden statically or overridden by being sequenced.
 *
 * Note that this cannot be generic over `Props`, since the user is
 * able to change prop configs for the sheet object's properties.
 */
export default class SheetObject implements PathedDerivable {
  get type(): 'Theatre_SheetObject' {
    return 'Theatre_SheetObject'
  }
  readonly address: SheetObjectAddress
  readonly publicApi: TheatreSheetObject
  private readonly _initialValue = new Atom<SheetObjectPropsValue>({})
  private readonly _cache = new SimpleCache()
  readonly _logger: ILogger
  private readonly _internalUtilCtx: IUtilContext

  constructor(
    readonly sheet: Sheet,
    readonly template: SheetObjectTemplate,
    readonly nativeObject: unknown,
  ) {
    this._logger = sheet._logger.named(
      'SheetObject',
      template.address.objectKey,
    )
    this._logger._trace('creating object')
    this._internalUtilCtx = {logger: this._logger.utilFor.internal()}
    this.address = {
      ...template.address,
      sheetInstanceId: sheet.address.sheetInstanceId,
    }

    this.publicApi = new TheatreSheetObject(this)
  }

  private initOrUpdateFinalAtom() {
    prism.ensurePrism()
    // `prism.memo` initialises these values the first time `initOrUpdateFinalAtom` is called
    const initialsCache = prism.memo('initialsCache', () => new WeakMap(), [])
    const staticsCache = prism.memo('staticsCache', () => new WeakMap(), [])
    const seqsCache = prism.memo('seqsCache', () => new WeakMap(), [])
    const finalAtom = prism.memo(
      'finalAtom',
      () => new Atom<SheetObjectPropsValue>({}),
      [],
    )

    const defaults = val(this.template.defaultValues)
    const initial = val(this._initialValue.pointer)
    const statics = val(this.template.staticValues)
    const sequenced = val(this.sequencedValues)

    finalAtom.setState(
      deepMergeWithCache(
        deepMergeWithCache(
          deepMergeWithCache(defaults, initial, initialsCache),
          statics,
          staticsCache,
        ),
        sequenced,
        seqsCache,
      ),
    )

    return finalAtom.pointer
  }
  get values(): IDerivation<Pointer<SheetObjectPropsValue>> {
    // The cache is for lazy initialization of this derivation
    return this._cache.getOrInit('values', () =>
      prism(() => this.initOrUpdateFinalAtom()),
    )
  }

  getValueByPointer<T extends SerializableValue>(pointer: Pointer<T>): T {
    const {path} = getPointerParts(pointer)
    return val(this[pathedDerivation](path)) as T
  }

  [pathedDerivation] = pathedDerivationFromPointerDerivation(this.values)

  // private processTrack(
  //   sequencedAtom: Atom<SheetObjectPropsValue>,
  //   {trackId, pathToProp}: {trackId: SequenceTrackId; pathToProp: PathToProp},
  //   config: SheetObjectPropTypeConfig,
  // ) {
  //   const propConfig = getPropConfigByPath(config, pathToProp)! as Extract<
  //     PropTypeConfig,
  //     {interpolate: $IntentionalAny}
  //   >
  //   const sequenceValueD = this._trackIdToDerivation(trackId).map((triple) =>
  //     interpolateTriple(propConfig, triple),
  //   )

  //   sequencedAtom.setIn(pathToProp, sequenceValueD.getValue())
  //   const untap = sequenceValueD
  //     .changesWithoutValues()
  //     .tap(() => sequencedAtom.setIn(pathToProp, sequenceValueD.getValue()))
  //   return untap
  // }
  /**
   * calculates values of props that are sequenced.
   */
  // private updateSequencedAtom(
  //   sequencedAtom: Atom<SheetObjectPropsValue>,
  //   tracksToProcess: {trackId: SequenceTrackId; pathToProp: PathToProp}[],
  //   config: SheetObjectPropTypeConfig,
  // ) {
  //   const untaps: Array<() => void> = tracksToProcess.map((track) =>
  //     this.processTrack(sequencedAtom, track, config),
  //   )
  //   const untapAll = () => untaps.forEach((untap) => untap())
  //   return untapAll
  // }

  /**
   * Returns an identity derivation provider of the default values (all defaults are read from the config)
   */
  // a.k.a. getSequencedValuesIdentityDerivationProvider
  // private getSequencedValuesPathedDerivable(): PathedDerivable {
  //   const sequencedAtom = new Atom<SheetObjectPropsValue>({})
  //   const allSequencedValuesD = prism(() => {
  //     const tracksToProcess = val(this.template.validSequenceTracks)
  //     const config = val(this.template.configPointer)
  //     prism.effect(
  //       'processTracks',
  //       () => this.updateSequencedAtom(sequencedAtom, tracksToProcess, config),
  //       [config, ...tracksToProcess],
  //     )
  //     return sequencedAtom.pointer
  //   })

  //   return {
  //     [pathedDerivation]: pathedDerivationFromPointerDerivation(allSequencedValuesD),
  //   }
  // }
  private sequencedValuesPathedDerivation(
    path: (string | number)[],
  ): IDerivation<IPropPathToInterpolationTripleTree | undefined> {
    // should be cached per-path
    return prism(() => {
      const tracks = val(this.template.getMapOfValidSequenceTracks_forStudio()) // `getMapOfValidSequenceTracks_forStudio` should return a pointer for this
      const trackTree = getDeep(tracks, path) as IPropPathToTrackIdTree
      const config = val(this.template.configPointer)

      return objMap(
        path,
        trackTree,
        (trackId: SequenceTrackId, p: PathToProp) =>
          interpolateTriple(
            getPropConfigByPath(config, p) as PropTypeConfig_AllSimples,
            val(this._trackIdToDerivation(trackId)),
          ),
      )
    }) // just need to cache these objects by path and perf is off the chain
  }
  get sequencedValues(): Pointer<SheetObjectPropsValue> {
    // lazy initialization with cache
    return this._cache.getOrInit('sequencedValues', () =>
      pointer({
        root: {
          [pathedDerivation]: this.sequencedValuesPathedDerivation.bind(this),
          //pathedDerivationFromPointerDerivation(allSequencedValuesD),
        },
      }),
    )
  }

  protected _trackIdToDerivation(
    trackId: SequenceTrackId,
  ): IDerivation<InterpolationTriple | undefined> {
    const trackP =
      this.template.project.pointers.historic.sheetsById[this.address.sheetId]
        .sequence.tracksByObject[this.address.objectKey].trackData[trackId]

    const timeD = this.sheet.getSequence().positionDerivation

    return interpolationTripleAtPosition(this._internalUtilCtx, trackP, timeD)
  }

  get propsP(): Pointer<SheetObjectPropsValue> {
    return this._cache.getOrInit('propsP', () =>
      pointer<{props: {}}>({root: this, path: []}),
    ) as $FixMe
  }

  validateValue(
    pointer: Pointer<SheetObjectPropsValue>,
    value: DeepPartialOfSerializableValue<SheetObjectPropsValue>,
  ) {
    // @todo
  }

  setInitialValue(val: DeepPartialOfSerializableValue<SheetObjectPropsValue>) {
    this.validateValue(this.propsP, val)
    this._initialValue.setState(val)
  }
}

const interpolateTriple = (
  propConfig: PropTypeConfig_AllSimples,
  triple: InterpolationTriple | undefined,
) => {
  const interpolate = propConfig.interpolate! as Interpolator<$IntentionalAny>

  const left = deserializeAndSanitizeOrDefault(propConfig, triple?.left)
  const right = deserializeAndSanitizeOrDefault(propConfig, triple?.right)

  return triple === undefined
    ? undefined
    : right === undefined
    ? left
    : interpolate(left, right, triple.progression)
}

const deserializeAndSanitizeOrDefault = (
  propConfig: PropTypeConfig_AllSimples,
  value: SerializableValue<SerializablePrimitive> | undefined,
) => {
  if (value === undefined) return undefined
  const deserialized = propConfig.deserializeAndSanitize(value)
  return deserialized === undefined ? propConfig.default : deserialized
}

const pathedDerivationFromPointerDerivation =
  <T>(d: IDerivation<Pointer<T>>) =>
  (path: (string | number)[]): IDerivation<unknown> =>
    prism(() => val(pointerDeep(val(d), path)))

function objMap(path: (number | string)[], value: any, valMap: any): any {
  const isObj =
    typeof value === 'object' && !Array.isArray(value) && value !== null
  if (!isObj) return valMap(value, path)
  return Object.fromEntries(
    Object.entries(value).map(([key, value]) => [
      key,
      objMap([...path, key], value, valMap),
    ]),
  )
}

/*
// dependency-freee (defaults+initial+static+sequenced)
// dependent (expression)
*/
