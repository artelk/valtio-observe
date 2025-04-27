import { describe, expect, it } from 'vitest';
import { observe, snapshotify } from '../src/vanilla.js';
import { proxy } from 'valtio/vanilla';

describe('snapshotify', () => {
  it('should handle cycles in the object', async () => {
    type Obj = { v: number; parent: Obj };
    const obj: Obj = { v: 0, parent: null! };
    obj.parent = obj;
    const snap = snapshotify(obj);
    expect(snap).not.toBe(obj);
    expect(snap.parent).toBe(snap);
  });

  it('should reuse parts of the returned object if deep equal', async () => {
    const state = proxy({ x: 0, other: { y: 0 } });
    let count = 0;
    let result = {
      mod2: { v: -1 },
      mod3: { v: -1 },
      mod5: { v: -1 },
      other: { v: state.other },
    };
    const { stop } = observe(
      () => {
        const x = state.x;
        return {
          mod2: { v: x % 2 },
          mod3: { v: x % 3 },
          mod5: { v: x % 5 },
          other: { v: state.other },
        };
      },
      (v) => {
        result = snapshotify(v);
        count++;
      },
      true,
    );
    expect(count).toEqual(1);

    let prevResult = result;
    state.x++;
    expect(count).toEqual(2);
    expect(result).not.toBe(prevResult);
    expect(result.mod2).not.toBe(prevResult.mod2);
    expect(result.mod3).not.toBe(prevResult.mod3);
    expect(result.mod5).not.toBe(prevResult.mod5);
    expect(result.other).toBe(prevResult.other);
    expect(result.other.v).toBe(prevResult.other.v);

    prevResult = result;
    state.x += 2;
    expect(count).toEqual(3);
    expect(result).not.toBe(prevResult);
    expect(result.mod2).toBe(prevResult.mod2);
    expect(result.mod3).not.toBe(prevResult.mod3);
    expect(result.mod5).not.toBe(prevResult.mod5);
    expect(result.other).toBe(prevResult.other);
    expect(result.other.v).toBe(prevResult.other.v);

    prevResult = result;
    state.x += 3;
    expect(count).toEqual(4);
    expect(result).not.toBe(prevResult);
    expect(result.mod2).not.toBe(prevResult.mod2);
    expect(result.mod3).toBe(prevResult.mod3);
    expect(result.mod5).not.toBe(prevResult.mod5);
    expect(result.other).toBe(prevResult.other);
    expect(result.other.v).toBe(prevResult.other.v);

    prevResult = result;
    state.x += 5;
    expect(count).toEqual(5);
    expect(result).not.toBe(prevResult);
    expect(result.mod2).not.toBe(prevResult.mod2);
    expect(result.mod3).not.toBe(prevResult.mod3);
    expect(result.mod5).toBe(prevResult.mod5);
    expect(result.other).toBe(prevResult.other);
    expect(result.other.v).toBe(prevResult.other.v);

    prevResult = result;
    state.x += 6;
    expect(count).toEqual(6);
    expect(result).not.toBe(prevResult);
    expect(result.mod2).toBe(prevResult.mod2);
    expect(result.mod3).toBe(prevResult.mod3);
    expect(result.mod5).not.toBe(prevResult.mod5);
    expect(result.other).toBe(prevResult.other);
    expect(result.other.v).toBe(prevResult.other.v);

    prevResult = result;
    state.x += 10;
    expect(count).toEqual(7);
    expect(result).not.toBe(prevResult);
    expect(result.mod2).toBe(prevResult.mod2);
    expect(result.mod3).not.toBe(prevResult.mod3);
    expect(result.mod5).toBe(prevResult.mod5);
    expect(result.other).toBe(prevResult.other);
    expect(result.other.v).toBe(prevResult.other.v);

    prevResult = result;
    state.x += 15;
    expect(count).toEqual(8);
    expect(result).not.toBe(prevResult);
    expect(result.mod2).not.toBe(prevResult.mod2);
    expect(result.mod3).toBe(prevResult.mod3);
    expect(result.mod5).toBe(prevResult.mod5);
    expect(result.other).toBe(prevResult.other);
    expect(result.other.v).toBe(prevResult.other.v);

    prevResult = result;
    state.x += 30;
    expect(count).toEqual(8);

    prevResult = result;
    state.other.y++;
    expect(count).toEqual(9);
    expect(result).not.toBe(prevResult);
    expect(result.mod2).toBe(prevResult.mod2);
    expect(result.mod3).toBe(prevResult.mod3);
    expect(result.mod5).toBe(prevResult.mod5);
    expect(result.other).not.toBe(prevResult.other);
    expect(result.other.v).not.toBe(prevResult.other.v);

    stop();
  });
});
