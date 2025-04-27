import { describe, expect, it } from 'vitest';
import { proxy } from 'valtio/vanilla';
import { batch, observe } from 'valtio-observe';

describe('batch', () => {
  it('should work', async () => {
    const state = proxy({ v: 0 });
    let triggeredCount = 0;
    const { stop } = observe(
      () => state.v,
      (_v) => {
        triggeredCount++;
      },
      true, // sync
    );
    expect(triggeredCount).toEqual(1);

    batch(() => {
      state.v++;
      state.v++;
      expect(triggeredCount).toEqual(1);
    });
    expect(triggeredCount).toEqual(2);

    batch(() => {
      state.v++;
      state.v++;
      batch(() => {
        state.v++;
        state.v++;
        expect(triggeredCount).toEqual(2);
      });
      expect(triggeredCount).toEqual(2);
    });
    expect(triggeredCount).toEqual(3);

    stop();
  });
});
