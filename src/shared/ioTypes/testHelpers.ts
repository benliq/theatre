import * as assert from 'assert'
import * as t from '$shared/ioTypes'
import {PathReporter} from 'io-ts/lib/PathReporter'

export function assertSuccess<T>(validation: t.Validation<T>): void {
  assert.ok(validation.isRight())
}

export function assertFailure<T>(
  validation: t.Validation<T>,
  descriptions: Array<string>,
): void {
  assert.ok(validation.isLeft())
  assert.deepEqual(PathReporter.report(validation), descriptions)
}

export function assertStrictEqual<T>(
  validation: t.Validation<T>,
  value: any,
): void {
  assert.strictEqual(validation.fold<any>(t.identity, t.identity), value)
}

export function assertDeepEqual<T>(
  validation: t.Validation<T>,
  value: any,
): void {
  assert.deepEqual(validation.fold<any>(t.identity, t.identity), value)
}

export const string2 = new t.Type<string, string>(
  'string2',
  (v): v is string => t.string.is(v) && v[1] === '-',
  (s, c) =>
    t.string.validate(s, c).chain(s => {
      if (s.length === 2) {
        return t.success(s[0] + '-' + s[1])
      } else {
        return t.failure(s, c)
      }
    }),
  a => a[0] + a[2],
)

export const DateFromNumber = new t.Type<Date, number>(
  'DateFromNumber',
  (v): v is Date => v instanceof Date,
  (s, c) =>
    t.number.validate(s, c).chain(n => {
      const d = new Date(n)
      return isNaN(d.getTime()) ? t.failure(n, c) : t.success(d)
    }),
  a => a.getTime(),
)

export const NumberFromString = new t.Type<number, string, string>(
  'NumberFromString',
  t.number.is,
  (s, c) => {
    const n = parseFloat(s)
    return isNaN(n) ? t.failure(s, c) : t.success(n)
  },
  String,
)

export const IntegerFromString = t.refinement(
  NumberFromString,
  t.Integer.is,
  'IntegerFromString',
)

export function withDefault<T extends t.Mixed>(
  type: T,
  defaultValue: t.TypeOf<T>,
): t.Type<t.InputOf<T>, t.TypeOf<T>> {
  return new t.Type(
    `withDefault(${type.name}, ${JSON.stringify(defaultValue)})`,
    type.is,
    (v, c) => type.validate(v != null ? v : defaultValue, c),
    type.encode,
  )
}
