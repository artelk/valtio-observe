import { isValtioProxy, observe } from './vanilla.js';
import { snapshot, unstable_replaceInternalFunction } from 'valtio/vanilla';
import { useEffect, useState } from 'react';

const valtioCanProxy = (() => {
  let valtioCanProxy: (x: unknown) => boolean;
  unstable_replaceInternalFunction('canProxy', (canProxy) => {
    valtioCanProxy = canProxy;
    return canProxy;
  });
  return valtioCanProxy!;
})();

export function snapshotify<T>(target: T): T {
  const map = new Map<object, object>();

  function traversal(target: T) {
    if (isValtioProxy(target)) {
      return snapshot(target) as T; // found proxy, let's snapshot it!
    }
    if (!valtioCanProxy(target)) return target;
    if (map.has(target as object)) return map.get(target as object);
    const snap = Array.isArray(target)
      ? []
      : Object.create(Object.getPrototypeOf(target));
    map.set(target as object, snap);
    Reflect.ownKeys(target as object).forEach((key) => {
      if (Object.getOwnPropertyDescriptor(snap, key)) {
        return;
      }
      const { enumerable } = Reflect.getOwnPropertyDescriptor(
        target as object,
        key,
      ) as PropertyDescriptor;
      const value = traversal(Reflect.get(target as object, key)); // recursive
      const desc: PropertyDescriptor = {
        value,
        enumerable: enumerable as boolean,
      };
      Object.defineProperty(snap, key, desc);
    });
    return Object.preventExtensions(snap);
  }

  return traversal(target);
}

export function useObserve<T>(func: () => T, inSync?: boolean): T {
  const [snapshot, setSnapshot] = useState(() => snapshotify(func()));

  useEffect(() => {
    let isInit = true;
    const stop = observe(
      func,
      (obj) => {
        if (!isInit) {
          setSnapshot(snapshotify(obj));
        }
      },
      inSync,
    );
    isInit = false;
    return stop;
  }, []);

  return snapshot;
}
