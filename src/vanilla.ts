import {
  subscribe,
  unstable_getInternalStates,
  unstable_replaceInternalFunction,
} from 'valtio/vanilla';

const isObject = (x: unknown): x is object =>
  typeof x === 'object' && x !== null;

export const isValtioProxy = (() => {
  const { proxyStateMap } = unstable_getInternalStates();
  return (x: unknown): x is object => isObject(x) && proxyStateMap.has(x);
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

        //TODO: defineProperty/deleteProperty ?

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

function collectProxies(obj: unknown) {
  const proxies = new Set<object>();
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

  return proxies;
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

export function observe<T>(
  func: () => T,
  consume: (value: T) => void,
  inSync?: boolean,
): () => void {
  const accessedProxyProperties = new Map<object, Set<string | symbol>>();
  const proxySubscriptions = new Map<object, () => void>();

  let stopped = false;
  let version = 0;
  let processedVersion = 0;
  const trigger = inSync
    ? update
    : () => {
        version++;
        Promise.resolve().then(() => {
          if (processedVersion < version) {
            processedVersion = version;
            update();
          }
        });
      };
  const triggerRef = new WeakRef<() => void>(trigger);

  const unsubSetters = subscribeToSetters((receiver, prop) => {
    if (accessedProxyProperties.get(receiver)?.has(prop)) {
      trigger();
    }
  });

  function addAccessedProxyProperty(
    receiver: object,
    prop: string | symbol,
    _value: unknown,
  ) {
    if (!accessedProxyProperties.has(receiver)) {
      accessedProxyProperties.set(
        receiver,
        new Set<string | symbol>().add(prop),
      );
    } else {
      accessedProxyProperties.get(receiver)!.add(prop);
    }
  }

  function update() {
    if (stopped) return;

    accessedProxyProperties.clear();
    const value = listenGetters(addAccessedProxyProperty, func);

    const proxies = collectProxies(value);
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

    consume(value);
  }

  update();

  return () => {
    stopped = true;
    unsubSetters();
    proxySubscriptions.forEach((unsubscribe) => unsubscribe());
  };
}
