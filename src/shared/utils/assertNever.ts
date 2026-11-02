/**
 * Exhaustiveness check for discriminated unions / const-object enums.
 *
 * Use in the `default` branch of a `switch` over a finite union so that adding
 * a new member becomes a compile-time error instead of a silent fall-through:
 *
 * ```ts
 * switch (value) {
 *   case A: ...
 *   case B: ...
 *   default: return assertNever(value);
 * }
 * ```
 *
 * If a new member `C` is added, `value` in the default branch is no longer
 * `never` and `assertNever` rejects it at compile time.
 */
export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${String(value)}`);
}
