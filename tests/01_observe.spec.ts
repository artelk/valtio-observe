import { describe, expect, it, test, vi } from 'vitest';
import { proxy } from 'valtio';
import { batch, observe, snapshotify } from 'valtio-observe';

describe('observe', () => {
  it('should run function initially', async () => {
    const fn = vi.fn(() => 1);
    let v = null;
    const consume = vi.fn((x) => (v = x));
    const { stop } = observe(fn, consume);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(v).toEqual(1);
    stop();
  });

  it('should rerun function on change - sync', async () => {
    const state = proxy({ count: 0 });
    const data: number[] = [];
    const { stop } = observe(
      () => ({ v: state.count }),
      ({ v }) => {
        data.push(v);
      },
      true, // sync
    );
    expect(data).toEqual([0]);
    ++state.count;
    expect(data).toEqual([0, 1]);
    ++state.count;
    expect(data).toEqual([0, 1, 2]);
    stop();
    ++state.count;
    expect(data).toEqual([0, 1, 2]);
  });

  it('should rerun function on change - async', async () => {
    const state = proxy({ count: 0 });
    const data: number[] = [];
    const { stop } = observe(
      () => ({ v: state.count }),
      ({ v }) => {
        data.push(v);
      },
    ); // async by default

    expect(data).toEqual([0]);

    ++state.count;
    expect(data).toEqual([0]);
    await new Promise<void>((r) => setTimeout(r));
    expect(data).toEqual([0, 1]);

    ++state.count;
    expect(data).toEqual([0, 1]);
    await new Promise<void>((r) => setTimeout(r));
    expect(data).toEqual([0, 1, 2]);

    stop();

    ++state.count;
    await new Promise<void>((r) => setTimeout(r));
    expect(data).toEqual([0, 1, 2]);
  });

  it('should work with complex object', async () => {
    const state1 = proxy({ x: 0 });
    const state2 = proxy({ a: { y: 0, ignore: 'ignore' } });
    const state3 = proxy({ b: { c: { z: 0 } } });
    const state4 = proxy({ v: 0 });

    let result = '';
    const { stop } = observe(
      () => {
        const x = state1.x;
        const {
          a: { y },
        } = state2; // implicitly calls getters for a and y
        const xy = `${x}:${y}`;
        const p = state3.b.c;
        return { xy, p, s: state4 }; // p and s are proxies returned as a whole
      },
      ({ xy, p: { z }, s }) => {
        result = `${xy}:${z}:${s.v}`;
      },
      true, // sync
    );

    expect(result).toEqual('0:0:0:0');
    state1.x++;
    expect(result).toEqual('1:0:0:0');
    state2.a.y++;
    expect(result).toEqual('1:1:0:0');
    state3.b.c.z++;
    expect(result).toEqual('1:1:1:0');
    state4.v++;
    expect(result).toEqual('1:1:1:1');

    result = '';
    state2.a.ignore = '';
    expect(result).toEqual(''); // ignored

    state2.a = { y: state2.a.y + 1, ignore: '' };
    expect(result).toEqual('1:2:1:1');
    state3.b.c = { z: state3.b.c.z + 1 };
    expect(result).toEqual('1:2:2:1');
    state3.b = { c: { z: state3.b.c.z + 1 } };
    expect(result).toEqual('1:2:3:1');

    stop();
  });

  it('should handle cycles in the returned object', async () => {
    type Obj = { v: number; parent: Obj };
    const state = proxy({ count: 0 });
    let result: Obj = null!;
    const { stop } = observe(
      () => {
        const obj: Obj = { v: state.count, parent: null! };
        obj.parent = obj;
        return obj;
      },
      (obj) => {
        result = obj;
      },
      true, // sync
    );
    ++state.count;
    expect(result.v).toEqual(state.count);
    expect(result.parent).toBe(result);
    stop();
  });

  it('sync() should force sync', async () => {
    const state = proxy({ v: 0 });
    let result = -1;
    let triggeredCount = 0;
    const { stop, sync } = observe(
      () => state.v,
      (v) => {
        result = v;
        triggeredCount++;
      },
      false, // async
    );
    expect(triggeredCount).toEqual(1);
    expect(result).toEqual(0);

    state.v++;
    state.v++;
    expect(triggeredCount).toEqual(1);
    expect(result).toEqual(0);

    expect(sync()).toEqual(true);
    expect(triggeredCount).toEqual(2);
    expect(result).toEqual(2);

    expect(sync()).toEqual(false);
    expect(triggeredCount).toEqual(2);
    expect(result).toEqual(2);

    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(triggeredCount).toEqual(2);
    expect(result).toEqual(2);

    stop();
  });

  it('array - touch individual items', async () => {
    const state = proxy({ array: ['0', '1', '2', '3', '5'] });
    let result = { foo: '', bar: '' };
    let triggeredCount = 0;
    const { stop } = observe(
      () => {
        const arr = state.array;
        triggeredCount++;
        return { foo: arr[1], bar: arr[3] } as typeof result;
      },
      (obj) => {
        result = obj;
      },
      true, // sync
    );

    expect(triggeredCount).toEqual(1);
    expect(result).toEqual({ foo: '1', bar: '3' });

    const arr = state.array;

    arr[1] = '1!';
    expect(triggeredCount).toEqual(2);
    expect(result).toEqual({ foo: '1!', bar: '3' });

    arr[3] = '3!';
    expect(triggeredCount).toEqual(3);
    expect(result).toEqual({ foo: '1!', bar: '3!' });

    arr[0] = '0!';
    expect(triggeredCount).toEqual(3);

    arr[2] = '2!';
    expect(triggeredCount).toEqual(3);

    delete arr[1];
    expect(triggeredCount).toEqual(4);
    expect(result).toEqual({ foo: undefined, bar: '3!' });

    arr[1] = '1!';
    expect(triggeredCount).toEqual(5);
    expect(result).toEqual({ foo: '1!', bar: '3!' });

    arr.length = 6;
    expect(triggeredCount).toEqual(5);

    arr.length = 4;
    expect(triggeredCount).toEqual(5);

    arr.length = 3;
    expect(triggeredCount).toEqual(6);
    expect(result).toEqual({ foo: '1!', bar: undefined });

    arr.length = 2;
    expect(triggeredCount).toEqual(6);

    arr.length = 4;
    expect(triggeredCount).toEqual(6);

    arr.length = 2;
    expect(triggeredCount).toEqual(7);
    expect(result).toEqual({ foo: '1!', bar: undefined });

    arr[3] = '3!';
    expect(triggeredCount).toEqual(8);
    expect(result).toEqual({ foo: '1!', bar: '3!' });

    stop();
  });

  type ArrayFuncCase = [boolean, (arr: unknown[]) => unknown];
  const arrayFuncCases: ArrayFuncCase[] = [
    [false, (a) => a[0]],
    [true, (a) => a[4]], // we change the 4th value in the test
    [false, (a) => a.length], // length only
    [true, (a) => [a.length, a[0]]], // length and something else
    [true, (a) => a.at(0)], // gets length under the hood
    [true, (a) => a.some((_) => true)],
    [true, (a) => a.every((_) => false)],
    [true, (a) => a.find((_) => true)],
    [true, (a) => a.findIndex((_) => true)],
    [true, (a) => a.forEach((v) => v)],
    [true, (a) => a.includes(0)],
    [true, (a) => a.indexOf(0)],
    [true, (a) => a.map((v) => v)],
    [true, (a) => a.reduce((prev, _) => prev)],
    [true, (a) => a.toString()],
    [true, (a) => a.toLocaleString()],
    [true, (a) => a.entries()],
    [true, (a) => a.keys()],
    [true, (a) => a.values()],
    [false, (a) => Reflect.get(a, 0)],
    [false, (a) => Reflect.has(a, 0)],
    [true, (a) => Reflect.get(a, 4)], // we change the 4th value in the test
    [true, (a) => Reflect.has(a, 4)], // we change the 4th value in the test
    [true, (a) => Reflect.ownKeys(a)],
    [true, (a) => Object.keys(a)],
    [true, (a) => Object.values(a)],
    [true, (a) => Object.entries(a)],
    [
      true,
      (a) => {
        for (const _ of a) {
          // noop
        }
      },
    ],
  ];

  test.each(arrayFuncCases)(
    'array - should trigger: %s, function: %s',
    (shouldTrigger, func) => {
      const state = proxy({ array: [0, 1, 2, 3, 4] });
      let triggered = false;
      const { stop } = observe(
        () => func(state.array),
        (_v) => {
          triggered = true;
        },
        true, // sync
      );
      triggered = false;
      state.array[4] = 100;
      expect(triggered).toEqual(shouldTrigger);
      stop();
    },
  );
});

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

describe('snapshotify', () => {
  it('should handle cycles in the object', async () => {
    type Obj = { v: number; parent: Obj };
    const obj: Obj = { v: 0, parent: null! };
    obj.parent = obj;
    const snap = snapshotify(obj);
    expect(snap).not.toBe(obj);
    expect(snap.parent).toBe(snap);
  });
});
