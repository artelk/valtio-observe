import { describe, expect, it, vi } from 'vitest';
import { proxy } from 'valtio';
import { observe } from 'valtio-observe';

describe('observe', () => {
  it('should run function initially', async () => {
    const fn = vi.fn(() => 1);
    let v = null;
    const consume = vi.fn((x) => (v = x));
    const stop = observe(fn, consume);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(consume).toHaveBeenCalledTimes(1);
    expect(v).toEqual(1);
    stop();
  });

  it('should rerun function on change - sync', async () => {
    const state = proxy({ count: 0 });
    const data: number[] = [];
    const stop = observe(
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
    const stop = observe(
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
    const stop = observe(
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
});
