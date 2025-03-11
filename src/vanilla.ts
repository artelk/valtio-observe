import {
  snapshot,
  subscribe,
  unstable_getInternalStates,
  unstable_replaceInternalFunction,
} from 'valtio/vanilla';

const isObject = (x: unknown): x is object =>
  typeof x === 'object' && x !== null;

const { isValtioProxy, getValtioProxy } = (() => {
  const { proxyStateMap, proxyCache } = unstable_getInternalStates();
  return {
    isValtioProxy: (x: unknown): x is object =>
      isObject(x) && proxyStateMap.has(x),
    getValtioProxy: (x: object) => proxyCache.get(x)!,
  };
})();

const valtioCanProxy = (() => {
  let valtioCanProxy: (x: unknown) => boolean;
  unstable_replaceInternalFunction('canProxy', (canProxy) => {
    valtioCanProxy = canProxy;
    return canProxy;
  });
  return valtioCanProxy!;
})();

const { listenGetters, subscribeToSetters } = (() => {
  const getterListeners = new Set<
    (target: object, prop: string | symbol, value: unknown) => void
  >();
  const setterListeners = new Set<
    WeakRef<
      (
        target: object,
        prop: string | symbol,
        prevValue: unknown,
        newValue: unknown,
      ) => void
    >
  >();

  function notifySetterListeners(
    target: object,
    prop: string | symbol,
    prevValue: unknown,
    newValue: unknown,
  ) {
    for (const listenerRef of setterListeners) {
      const listener = listenerRef.deref();
      if (listener) listener(target, prop, prevValue, newValue);
      else setterListeners.delete(listenerRef);
    }
  }

  unstable_replaceInternalFunction(
    'createHandler',
    (createHandler) =>
      (...args) => {
        const handler = createHandler(...args);

        const origGet =
          handler.get ||
          ((target, prop, receiver) => Reflect.get(target, prop, receiver));
        handler.get = (target, prop: string, receiver) => {
          const value = origGet(target, prop, receiver);
          for (const listener of getterListeners)
            listener(receiver, prop, value);
          return value;
        };

        const origHas = handler.has || ((target, p) => Reflect.has(target, p));
        handler.has = (target, p) => {
          const receiver = getValtioProxy(target);
          const result = origHas(target, p);
          for (const listener of getterListeners)
            listener(receiver, p, undefined);
          return result;
        };

        const origOwnKeys =
          handler.ownKeys || ((target) => Reflect.ownKeys(target));
        handler.ownKeys = (target) => {
          const receiver = getValtioProxy(target);
          const result = origOwnKeys(target);
          for (const listener of getterListeners)
            listener(receiver, 'keys', undefined);
          return result;
        };

        const origSet = handler.set!;
        handler.set = (target, prop, value, receiver) => {
          const prevValue = Reflect.get(target, prop, receiver);
          const result = origSet(target, prop, value, receiver);
          if (result) {
            const newValue = Reflect.get(target, prop, receiver);
            if (prevValue !== newValue)
              notifySetterListeners(receiver, prop, prevValue, newValue);
          }
          return result;
        };

        const origDeleteProperty =
          handler.deleteProperty ||
          ((target, p) => Reflect.deleteProperty(target, p));
        handler.deleteProperty = (target, p) => {
          const receiver = getValtioProxy(target);
          const prevValue = Reflect.get(target, p);
          const result = origDeleteProperty(target, p);
          if (result) {
            if (prevValue !== undefined)
              notifySetterListeners(receiver, p, prevValue, undefined);
          }
          return result;
        };

        return handler;
      },
  );

  const listenGetters = <T>(
    listener: (target: object, prop: string | symbol, value: unknown) => void,
    scopeFunc: () => T,
  ) => {
    getterListeners.add(listener);
    try {
      return scopeFunc();
    } finally {
      getterListeners.delete(listener);
    }
  };

  const subscribeToSetters = (
    setterListener: (
      target: object,
      prop: string | symbol,
      prevValue: unknown,
      newValue: unknown,
    ) => void,
  ) => {
    const listenerRef = new WeakRef(setterListener);
    setterListeners.add(listenerRef);
    return () => {
      setterListeners.delete(listenerRef);
      const _keepAlive = setterListener; // prevent from GC
    };
  };

  return { listenGetters, subscribeToSetters };
})();

function collectProxies(obj: unknown, proxies: Set<object>) {
  const visited = new Set<object>();

  function traversal(obj: unknown) {
    if (!isObject(obj)) return;
    if (visited.has(obj)) return;
    if (isValtioProxy(obj)) {
      proxies.add(obj);
      return;
    }
    visited.add(obj);
    for (const child of Object.values(obj)) traversal(child);
  }

  traversal(obj);
}

function subscribeWeak<T extends object>(
  target: T,
  callbackWeakRef: WeakRef<() => void>,
  inSync?: boolean,
) {
  const unsubscribe = subscribe(
    target,
    () => {
      const callback = callbackWeakRef.deref();
      if (callback) {
        callback();
      } else {
        unsubscribe();
      }
    },
    inSync,
  );
  return unsubscribe;
}

const batchCompleteCallbacks = new Set<() => void>();
let batchDepth = 0;

export function batch(body: () => void) {
  batchDepth++;
  try {
    body();
  } finally {
    batchDepth--;
  }

  if (batchDepth > 0) return;

  for (const callback of batchCompleteCallbacks) {
    batchCompleteCallbacks.delete(callback);
    try {
      callback();
    } catch (error) {
      console.error(error);
    }
  }
}

export function observe<T>(
  func: () => T,
  consume: (value: T) => void,
  inSync?: boolean,
): { sync: () => boolean; stop: () => void } {
  const accessedProxyProperties = new Map<object, Set<string | symbol>>();
  const proxySubscriptions = new Map<object, () => void>();

  let stopped = false;
  let triggered = false;
  const trigger = inSync
    ? () => {
        if (batchDepth > 0) {
          batchCompleteCallbacks.add(update);
        } else {
          update();
        }
      }
    : () => {
        if (triggered) return;
        triggered = true;
        Promise.resolve().then(() => {
          if (triggered) {
            update();
            triggered = false;
          }
        });
      };
  const triggerRef = new WeakRef<() => void>(trigger);

  const unsubscribeSetters = subscribeToSetters(
    (receiver, prop, prevValue, newValue) => {
      const props = accessedProxyProperties.get(receiver);
      if (!props) return;
      if (props.has(prop)) {
        trigger();
        return;
      }

      if (Array.isArray(receiver) && prop === 'length') {
        const prevLength = prevValue as number;
        const newLength = newValue as number;
        if (newLength >= prevLength) return;
        for (const p of props.keys()) {
          if (typeof p !== 'string') continue;
          const i = parseInt(p as string);
          if (isNaN(i)) continue;
          if (i < prevLength && i >= newLength) {
            trigger();
            return;
          }
        }
      }
    },
  );

  function addAccessedProxyProperty(receiver: object, prop: string | symbol) {
    if (!accessedProxyProperties.has(receiver)) {
      accessedProxyProperties.set(
        receiver,
        new Set<string | symbol>().add(prop),
      );
    } else {
      accessedProxyProperties.get(receiver)!.add(prop);
    }
  }

  const update = () => {
    if (stopped) return;
    try {
      doUpdate();
    } catch (error) {
      console.error(error);
    }
  };

  function getterListener(
    proxies: Set<object>,
    proxy: object,
    prop: string | symbol,
  ) {
    if (proxies.has(proxy)) return;
    addAccessedProxyProperty(proxy, prop);
    if (!Array.isArray(proxy)) return;

    const arrayProps = accessedProxyProperties.get(proxy)!;
    const shouldSwitchToProxySubscription =
      prop === 'entries' ||
      prop === 'keys' ||
      prop === 'values' ||
      (arrayProps.size > 1 && arrayProps.has('length'));
    if (shouldSwitchToProxySubscription) {
      proxies.add(proxy);
      accessedProxyProperties.delete(proxy);
    }
  }

  function doUpdate() {
    accessedProxyProperties.clear();
    const proxies = new Set<object>();
    const value = listenGetters(
      (proxy, prop) => getterListener(proxies, proxy, prop),
      func,
    );
    collectProxies(value, proxies);
    proxySubscriptions.forEach((unsubscribe, receiver) => {
      if (!proxies.has(receiver)) {
        unsubscribe();
        proxySubscriptions.delete(receiver);
      }
    });
    proxies.forEach((receiver) => {
      if (!proxySubscriptions.has(receiver)) {
        const unsubscribe = subscribeWeak(receiver, triggerRef, true);
        proxySubscriptions.set(receiver, unsubscribe);
      }
    });
    accessedProxyProperties.forEach((receiver) => {
      if (proxies.has(receiver)) {
        accessedProxyProperties.delete(receiver);
      }
    });

    consume(value);
  }

  update();

  return {
    sync: inSync
      ? () => false
      : () => {
          if (!triggered) return false;
          update();
          triggered = false;
          return true;
        },
    stop: () => {
      stopped = true;
      batchCompleteCallbacks.delete(update);
      unsubscribeSetters();
      proxySubscriptions.forEach((unsubscribe) => unsubscribe());
    },
  };
}

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
