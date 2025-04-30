# valtio-observe

[![CI](https://img.shields.io/github/actions/workflow/status/artelk/valtio-observe/ci.yml?branch=main)](https://github.com/artelk/valtio-observe/actions?query=workflow%3ACI)
[![npm](https://img.shields.io/npm/v/valtio-observe)](https://www.npmjs.com/package/valtio-observe)

Valtio-observe allows observing updates of an expression using [Valtio](https://github.com/pmndrs/valtio) proxies and use useObserve in React applications.
The expression may be any pure function depending on one or multiple states (valtio proxies).

## Install

```bash
npm install valtio valtio-observe
```

## Vanilla js/ts usage

```ts
observe<T>(func: () => T, consume: (value: T) => void, inSync?: boolean): { sync: () => boolean; stop: () => boolean, restart: () => boolean, isStopped: () => boolean }
```

The `observe` excecutes the `func` and passes its result to the `consume` function.
It subscribes to all proxy properties which getters were accessed while calling the `func`.
Additianally it searches for proxies in the returned value and subscribes to them.
The `observe` returns functions `stop`, `restart`, `isStopped` and `sync`. The `stop` and `restart` should be called to stop and restart observing.
The `sync` can be useful with asynchronous observes and it allows to immediately execute pending updates.

The `observe` deep-compares the produced value with the presously returned value and omits the `consume` execution if it is deep-equal.
For complex objects the `observe` reuses the inner objects if they are deep-equal to the ones from the previous result.
Note: it calls Object.freeze() for the returned object and all it's inner objects except valtio proxies and valtio `ref`s.

```ts
batch(body: () => void): void
```

The `batch` is useful with synchronous observes to trigger only one update for multiple changes made in the batch.

### Example

```ts
import { proxy } from 'valtio/vanilla';
import { observe } from 'valtio-observe/vanilla';

const state1 = proxy({ x: 0 });
const state2 = proxy({ a: { y: 0, ignore: '' } });
const state3 = proxy({ b: { c: { z: 0 } } });

const { stop } = observe(
  () => {
    const x = state1.x;
    const {
      a: { y },
    } = state2; // implicitly calls getters for a and y
    const xy = `${x}:${y}`;
    const p = state3.b.c;
    return { xy, p }; // p is a proxy returned as a whole
  },
  ({ xy, p }) => {
    console.log(`${new Date().toLocaleTimeString()} - ${xy}:${p.z}`);
  },
);

const interval = setInterval(() => {
  state1.x++;

  if (state1.x % 2 == 0) {
    if (state2.a.y % 2 == 0) {
      state2.a.y++;
    } else {
      state2.a = { y: state2.a.y + 1, ignore: '' };
    }
  }

  if (state1.x % 5 == 0) {
    if (state3.b.c.z % 2 == 0) {
      state3.b.c.z++;
    } else {
      state3.b.c = { z: state3.b.c.z + 1 };
    }
  }
}, 1000);

setTimeout(() => {
  clearInterval(interval);
  stop();
}, 30_000);
```

## Usage with React

Signature:

```ts
useObserve<T>(func: () => T, inSync?: boolean): T
```

The `useObserve` uses the `observe` and additionally calls `snapshot` for valtio proxies found in the object.
Main differences from `useSnapshot`:

1. `useSnapshot` returns a snapshot of a single proxy while `useObserve` supports any (pure) expression which can use multiple proxies, function calls and conditional logic; the returned value isn't required to be a proxy.
2. `useSnapshot` collects properties/paths accessed during rendering to only trigger re-render when they are modified later (internally it subscribes to the whole proxy and ignores the changes if no property/path values were modified). The `useObserve` uses property-level subscriptions and only subscribes to the proxy properties accessed during the `func` calls; additionally it checks if the returned value wasn't changed and omits render if that is deep-equal; if some inner object is deep-equal to the one from the previous result it substitutes that with the instance from the previous result.

### Example

```js
import { proxy } from 'valtio';
import { useObserve } from 'valtio-observe';

const state1 = proxy({ x: 0 });
const state2 = proxy({ a: { y: 0 } });
const state3 = proxy({ b: { c: { z: 0 }, ignore: 0 } });

const Test = () => {
  const {
    xy,
    p: { z },
  } = useObserve(() => {
    const x = state1.x;
    const {
      a: { y },
    } = state2;
    const xy = `${x}:${y}`;
    const p = state3.b.c;
    return { xy, p }; // p is a proxy returned as a whole
  });

  console.log('render');

  return (
    <div>
      <button onClick={() => state1.x++}>state1.x++</button>
      <button onClick={() => state2.a.y++}>state2.a.y++</button>
      <button onClick={() => state3.b.c.z++}>state3.b.c.z++</button>
      <button onClick={() => (state2.a = { y: state1.x })}>
        state2.a = {'{'}y: state1.x{'}'}
      </button>
      <button onClick={() => state3.b.ignore++}>state3.b.ignore++</button>
      <div>{`${xy}:${z}`}</div>
    </div>
  );
};
```
