import type {
  IProjectConfig,
  ISheetObject,
  SheetObjectActionsConfig,
  UnknownShorthandCompoundProps,
} from '@theatre/core'
import {val} from '@theatre/core'
import {getProject} from '@theatre/core'
import type {Pointer} from '@theatre/dataverse'
import {isPointer} from '@theatre/dataverse'
import type {IStudio} from '@theatre/studio'
import studio from '@theatre/studio'
import isEqual from 'lodash-es/isEqual'
import {useEffect, useMemo, useState, useRef} from 'react'

type KeysMatching<T extends object, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never
}[keyof T]

type OmitMatching<T extends object, V> = Omit<T, KeysMatching<T, V>>

// Because treeshaking studio relies on static checks like the following, we can't make including studio configurable at runtime.
// What we can do, if there arises a need to use studio in production with theatric, is to let users provide their own studio instance.
// That way we can treeshake our own, and the user can give us theirs, if they want to.

if (process.env.NODE_ENV === 'development') {
  studio.initialize()
}

// Just to be able to treeshake studio out of the bundle
const maybeTransaction =
  process.env.NODE_ENV === 'development'
    ? studio.transaction.bind(studio)
    : () => {}

let _state: IProjectConfig['state'] | undefined = undefined

export function initialize(state: IProjectConfig['state']) {
  if (_state !== undefined) {
    console.warn(
      'Theatric has already been initialized, either through another initialize call, or by calling useControls() before calling initialize().',
    )
    return
  }
  _state = state
}

const allProps: Record<string, UnknownShorthandCompoundProps[]> = {}
const allActions: Record<string, SheetObjectActionsConfig[]> = {}

type Button = {
  type: 'button'
  onClick: () => void
}
type Buttons = {
  [key: string]: Button
}

type ControlsAndButtons = {
  [key: string]: {type: 'button'} | UnknownShorthandCompoundProps[string]
}

/**
 * The type of the `$set()` function returned by `useControls()`.
 */
type Setter<Config extends UnknownShorthandCompoundProps> = <S>(
  pointer: (p: ISheetObject<Config>['props']) => Pointer<S>,
  value: S,
) => void

/**
 * The type of the `$get()` function returned by `useControls()`.
 */
type Getter<Config extends UnknownShorthandCompoundProps> = <S>(
  pointer: (p: ISheetObject<Config>['props']) => Pointer<S>,
) => S

export function useControls<Config extends ControlsAndButtons>(
  config: Config,
  options: {panel?: string; folder?: string} = {},
): ISheetObject<OmitMatching<Config, {type: 'button'}>>['value'] & {
  $set: Setter<OmitMatching<Config, {type: 'button'}>>
  $get: Getter<OmitMatching<Config, {type: 'button'}>>
} {
  // initialize state to null, if it hasn't been initialized yet
  if (_state === undefined) {
    _state = null
  }

  /*
   * This is a performance hack just to avoid a bunch of unnecessary calculations and effect runs whenever the hook is called,
   * since the config object is very likely not memoized by the user.
   * Since the config object can include functions, we can't rely for correctness on just deep comparing the config object,
   * we also have to perform a deep comparison on the theatre object values in onValuesChange before calling setState in order
   * to truly make sure we avoid infinite loops in this case, since then the config object will always be reported to be different by isEqual.
   *
   * Note: normally object.onValuesChange wouldn't be called twice with the same values, but when the object is reconfigured (which it is),
   * this doesn't seem to be the case.
   *
   * Also note: normally it'd be illegal to set refs during render (since renders might not be committed), but it is fine here
   * because we are only using it for memoization, _config is never going to be stale.
   */
  const configRef = useRef(config)
  const _config = useMemo(() => {
    if (isEqual(config, configRef.current)) {
      return configRef.current
    } else {
      configRef.current = config
      return config
    }
  }, [config])

  const {folder} = options

  const controlsWithoutButtons = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(_config).filter(
          ([key, value]) => (value as any).type !== 'button',
        ),
      ) as UnknownShorthandCompoundProps,
    [_config],
  )

  const buttons = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(_config).filter(
          ([key, value]) => (value as any).type === 'button',
        ),
      ) as unknown as Buttons,
    [_config],
  )

  const props = useMemo(
    () =>
      folder ? {[folder]: controlsWithoutButtons} : controlsWithoutButtons,
    [folder, controlsWithoutButtons],
  )

  const actions = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(buttons).map(([key, value]) => [
          `${folder ? `${folder}: ` : ''}${key}`,
          (object: ISheetObject, studio: IStudio) => {
            value
              .onClick
              // (path, value) => {
              //   // this is not ideal because it will create a separate undo level for each set call,
              //   // but this is the only thing that theatre's public API allows us to do.
              //   // Wrapping the whole thing in a transaction wouldn't work either because side effects
              //   // would be run twice.
              //   maybeTransaction((api) => {
              //     api.set(
              //       get(folder ? object.props[folder] : object.props, path),
              //       value,
              //     )
              //   })
              // },
              // (path) => get(folder ? object.value[folder] : object.value, path),
              ()
          },
        ]),
      ),
    [buttons, folder],
  )

  const sheet = useMemo(
    () => getProject('Theatric', {state: _state}).sheet('Panels'),
    [],
  )
  const panel = options.panel ?? 'Default panel'
  const allPanelProps = allProps[panel] ?? (allProps[panel] = [])
  const allPanelActions = allActions[panel] ?? (allActions[panel] = [])

  // have to do this to make sure the values are immediately available
  const object = useMemo(
    () =>
      sheet.object(panel, Object.assign({}, ...allProps[panel], props), {
        reconfigure: true,
        actions: Object.assign({}, ...allActions[panel], actions),
      }),
    [panel, props, actions],
  )

  useEffect(() => {
    allPanelProps.push(props)
    allPanelActions.push(actions)
    // cleanup runs after render, so we have to reconfigure with the new props here too, doing it during render just makes sure that
    // the very first values returned are not undefined
    sheet.object(panel, Object.assign({}, ...allPanelProps), {
      reconfigure: true,
      actions: Object.assign({}, ...allPanelActions),
    })

    return () => {
      allPanelProps.splice(allPanelProps.indexOf(props), 1)
      allActions[panel].splice(allPanelActions.indexOf(actions), 1)
      sheet.object(panel, Object.assign({}, ...allPanelProps), {
        reconfigure: true,
        actions: Object.assign({}, ...allPanelActions),
      })
    }
  }, [props, actions, allPanelActions, allPanelProps, sheet, panel])

  const [values, setValues] = useState(
    (folder ? object.value[folder] : object.value) as ISheetObject<
      OmitMatching<Config, {type: 'button'}>
    >['value'],
  )

  const valuesRef = useRef(object.value)

  useEffect(() => {
    const unsub = object.onValuesChange((newValues) => {
      if (folder) newValues = newValues[folder]

      // Normally object.onValuesChange wouldn't be called twice with the same values, but when the object is reconfigured (like we do above),
      // this doesn't seem to be the case, so we need to explicitly do this here to avoid infinite loops.
      if (isEqual(newValues, valuesRef.current)) return

      valuesRef.current = newValues
      setValues(newValues as any)
    })

    return unsub
  }, [object])

  const $setAndGet = useMemo(() => {
    const rootPointer = folder
      ? (object as ISheetObject).props[folder]
      : object.props

    const $set: Setter<OmitMatching<Config, {type: 'button'}>> = (
      getPointer,
      value,
    ) => {
      if (typeof getPointer !== 'function') {
        throw new Error(
          `The first argument to $set must be a function that returns a pointer. Instead, it was ${typeof getPointer}`,
        )
      }

      const pointer = getPointer(rootPointer as any)
      if (!isPointer(pointer)) {
        throw new Error(
          `The function passed to $set must return a pointer. Instead, it returned ${pointer}`,
        )
      }
      // this is not ideal because it will create a separate undo level for each set call,
      // but this is the only thing that theatre's public API allows us to do.
      // Wrapping the whole thing in a transaction wouldn't work either because side effects
      // would be run twice.
      maybeTransaction((api) => {
        api.set(pointer, value)
      })
    }

    const $get: Getter<OmitMatching<Config, {type: 'button'}>> = (
      getPointer,
    ) => {
      if (typeof getPointer !== 'function') {
        throw new Error(
          `The first argument to $get must be a function that returns a pointer. Instead, it was ${typeof getPointer}`,
        )
      }

      const pointer = getPointer(rootPointer as any)
      if (!isPointer(pointer)) {
        throw new Error(
          `The function passed to $get must return a pointer. Instead, it returned ${pointer}`,
        )
      }

      return val(pointer)
    }

    return {$set, $get}
  }, [folder, object])

  return {...values, ...$setAndGet}
}

export {types} from '@theatre/core'

export const button = (onClick: Button['onClick']) => {
  return {
    type: 'button' as const,
    onClick,
  }
}
