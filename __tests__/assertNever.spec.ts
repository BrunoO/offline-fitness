import { assertNever } from '@/shared';

describe('assertNever', () => {
  it('throws when called with a value', () => {
    expect(() => assertNever('unexpected' as never)).toThrow();
  });
});