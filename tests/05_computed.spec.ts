import { describe, expect, it } from 'vitest';
import { observe, computed, handle } from '../src/vanilla.js';
import { proxy, subscribe } from 'valtio/vanilla';

describe('computed', () => {
  it('base test', () => {
    const obj = proxy({ x: 0, y: 0 });
    const c = computed(() => `${obj.x}:${obj.y}`, true);
    expect(c.value).toEqual('0:0');
    obj.x++;
    expect(c.value).toEqual('1:0');
    obj.y++;
    expect(c.value).toEqual('1:1');

    handle(c).stop();
    obj.x++;
    expect(c.value).toEqual('1:1');
    handle(c).restart();
    expect(c.value).toEqual('2:1');
  });

  it('is a valtio proxy and can subscribe to', () => {
    const obj = proxy({ x: 1 });
    const c = computed(() => 10 + obj.x, true);
    expect(c.value).toEqual(11);
    let triggered = false;
    subscribe(c, () => (triggered = true), true);
    expect(triggered).toEqual(false);
    obj.x++;
    expect(triggered).toEqual(true);
  });

  it('can use in observe', () => {
    const obj = proxy({ x: 1 });
    const c = computed(() => 10 + obj.x, true);
    expect(c.value).toEqual(11);
    let result = 0;
    observe(
      () => 100 + c.value,
      (v) => (result = v),
      true,
    );
    expect(result).toEqual(111);
    obj.x++;
    expect(result).toEqual(112);
  });

  it('can use in another computed', () => {
    const obj = proxy({ x: 1 });
    const c1 = computed(() => 10 + obj.x, true);
    const c2 = computed(() => 100 + c1.value, true);
    expect(c1.value).toEqual(11);
    expect(c2.value).toEqual(111);
    obj.x++;
    expect(c1.value).toEqual(12);
    expect(c2.value).toEqual(112);
  });
});
