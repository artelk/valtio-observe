import {
  snapshot,
  subscribe,
  getVersion,
  unstable_getInternalStates,
  unstable_replaceInternalFunction,
  proxy,
} from 'valtio/vanilla';

const isObject = (x: unknown): x is object =>
  typeof x === 'object' && x !== null;

const { isValtioProxy, getValtioProxy, isRef } = (() => {
  const { proxyStateMap, proxyCache, refSet } = unstable_getInternalStates();
  return {
    isValtioProxy: (x: unknown): x is object =>
      isObject(x) && proxyStateMap.has(x),
    getValtioProxy: (x: object) => proxyCache.get(x)!,
    isRef: (x: object) => refSet.has(x),
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
    (
      target: object,
      prop: string | symbol,
      prevValue: unknown,
      newValue: unknown,
    ) => void
  >();

  function notifySetterListeners(
    target: object,
    prop: string | symbol,
    prevValue: unknown,
    newValue: unknown,
  ) {
    for (const listener of setterListeners) {
      listener(target, prop, prevValue, newValue);
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
    setterListeners.add(setterListener);
    return () => {
      setterListeners.delete(setterListener);
    };
  };

  return { listenGetters, subscribeToSetters };
})();

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

type ObserveHandle = {
  readonly sync: () => boolean;
  readonly stop: () => boolean;
  readonly restart: () => boolean;
  readonly isStopped: () => boolean;
};

export function observe<T>(
  func: () => T,
  consume: (value: T) => void,
  inSync?: boolean,
): ObserveHandle {
  const accessedProxyProperties = new Map<object, Set<string | symbol>>();
  const proxySubscriptions = new Map<object, () => void>();
  let prevResult: T = null!;
  let prevResultProxyVersions = new Map<object, number>();

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

  let unsubscribeSetters = subscribeToSetters(setterListener);

  function setterListener(
    receiver: object,
    prop: string | symbol,
    prevValue: unknown,
    newValue: unknown,
  ) {
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
  }

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
    const result = listenGetters(
      (proxy, prop) => getterListener(proxies, proxy, prop),
      func,
    );
    const resultProxyVersions = collectProxies(result);
    for (const p of resultProxyVersions.keys()) proxies.add(p);

    proxySubscriptions.forEach((unsubscribe, proxy) => {
      if (!proxies.has(proxy)) {
        unsubscribe();
        proxySubscriptions.delete(proxy);
      }
    });
    proxies.forEach((proxy) => {
      if (!proxySubscriptions.has(proxy)) {
        const unsubscribe = subscribe(proxy, trigger, true);
        proxySubscriptions.set(proxy, unsubscribe);
      }
    });
    accessedProxyProperties.forEach((proxy) => {
      if (proxies.has(proxy)) {
        accessedProxyProperties.delete(proxy);
      }
    });

    const compareResult = process(result, prevResult, prevResultProxyVersions);
    prevResultProxyVersions = resultProxyVersions;
    prevResult = result;
    if (compareResult === CompareResult.Different) {
      consume(result);
    }
  }

  update();

  const handle: ObserveHandle = {
    sync: inSync
      ? () => false
      : () => {
          if (!triggered) return false;
          update();
          triggered = false;
          return true;
        },
    stop: () => {
      if (stopped) return false;
      stopped = true;
      triggered = false;
      batchCompleteCallbacks.delete(update);
      unsubscribeSetters();
      proxySubscriptions.forEach((unsubscribe) => unsubscribe());
      proxySubscriptions.clear();
      accessedProxyProperties.clear();
      return true;
    },
    restart: () => {
      if (!stopped) return false;
      unsubscribeSetters = subscribeToSetters(setterListener);
      stopped = false;
      update();
      return true;
    },
    isStopped: () => stopped,
  };

  return Object.freeze(handle);
}

function collectProxies(obj: unknown) {
  const visited = new Set<object>();
  const proxyVersions = new Map<object, number>();

  function traversal(obj: unknown) {
    if (!isObject(obj) || isRef(obj)) return;
    if (visited.has(obj)) return;
    visited.add(obj);
    if (isValtioProxy(obj)) {
      proxyVersions.set(obj, getVersion(obj)!);
      return;
    }
    for (const key of Reflect.ownKeys(obj)) traversal(Reflect.get(obj, key));
  }

  traversal(obj);
  return proxyVersions;
}

enum CompareResult {
  Cycle,
  Same,
  DeepEqual,
  Different,
}

function process<T>(
  result: T,
  prevResult: T,
  prevResultProxyVersions: Map<object, number>,
): CompareResult {
  type Matching = [object, CompareResult];
  const currToPrevMap = new Map<object, Matching>();
  const cycleRoots = new Set<object>();
  const circulars = new Set<object>();

  function traversal(obj: unknown, prevObj: unknown): CompareResult {
    if (obj === prevObj) {
      return isValtioProxy(obj) &&
        prevResultProxyVersions.get(obj) !== getVersion(obj)
        ? CompareResult.Different
        : CompareResult.Same;
    }
    if (!isObject(obj) || !isObject(prevObj)) return CompareResult.Different;
    if (
      isValtioProxy(obj) ||
      isValtioProxy(prevObj) ||
      isRef(obj) ||
      isRef(prevObj)
    ) {
      return CompareResult.Different;
    }
    {
      const matching = currToPrevMap.get(obj);
      if (matching) {
        if (matching[0] !== prevObj) return CompareResult.Different;
        const compareResult = matching[1];
        if (compareResult === CompareResult.Cycle) cycleRoots.add(obj);
        return compareResult;
      }
    }

    let compareResult = CompareResult.Cycle;
    const matching: Matching = [prevObj, compareResult];
    currToPrevMap.set(obj, matching);

    const objKeys = Reflect.ownKeys(obj);
    let hasDiffs = objKeys.length != Reflect.ownKeys(prevObj).length;
    let hasCycles = false;
    for (const key of objKeys) {
      if (!Object.getOwnPropertyDescriptor(prevObj, key)) {
        hasDiffs = true;
        continue;
      }
      const prevVal = Reflect.get(prevObj, key);
      const valCompareResult = traversal(Reflect.get(obj, key), prevVal);
      if (valCompareResult === CompareResult.DeepEqual)
        Reflect.set(obj, key, prevVal);
      hasDiffs ||= valCompareResult === CompareResult.Different;
      hasCycles ||= valCompareResult === CompareResult.Cycle;
    }

    Object.freeze(obj); // note

    if (hasDiffs) {
      setAllCirculars(CompareResult.Different);
      cycleRoots.clear();
      compareResult = CompareResult.Different;
    } else if (hasCycles) {
      if (cycleRoots.delete(obj) && cycleRoots.size === 0) {
        setAllCirculars(CompareResult.DeepEqual);
        compareResult = CompareResult.DeepEqual;
      } else {
        circulars.add(obj);
        compareResult = CompareResult.Cycle;
      }
    } else {
      compareResult = CompareResult.DeepEqual;
    }
    matching[1] = compareResult;
    return compareResult;
  }

  function setAllCirculars(compareResult: CompareResult) {
    circulars.forEach((c) => (currToPrevMap.get(c)![1] = compareResult));
    circulars.clear();
  }

  return traversal(result, prevResult);
}

const snapMap = new WeakMap<object, object>();

export function snapshotify<T>(target: T): T {
  function traversal(target: T) {
    if (isValtioProxy(target)) {
      return snapshot(target) as T; // found proxy, let's snapshot it!
    }
    if (!valtioCanProxy(target)) return target;
    if (snapMap.has(target as object)) return snapMap.get(target as object);
    const snap = Array.isArray(target)
      ? []
      : Object.create(Object.getPrototypeOf(target));
    snapMap.set(target as object, snap);
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

const COMPUTED_VALUE = Symbol();
const HANDLE = Symbol();

export function computed<T>(
  func: () => T,
  inSync?: boolean,
): { readonly value: T } {
  const obj = proxy({
    [COMPUTED_VALUE]: undefined as T,
    get value() {
      return this[COMPUTED_VALUE];
    },
    get [HANDLE]() {
      return handle;
    },
  });
  const handle = observe(func, (v) => (obj[COMPUTED_VALUE] = v), inSync);
  return obj;
}

export function handle<T>(computed: { readonly value: T }): ObserveHandle {
  return (computed as unknown as { [HANDLE]: ObserveHandle })[HANDLE];
}
