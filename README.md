# valtio-observe

[![CI](https://img.shields.io/github/actions/workflow/status/artelk/valtio-observe/ci.yml?branch=main)](https://github.com/artelk/valtio-observe/actions?query=workflow%3ACI)
[![npm](https://img.shields.io/npm/v/valtio-observe)](https://www.npmjs.com/package/valtio-observe)

valtio-observe allows observing updates of an expression using [Valtio](https://github.com/pmndrs/valtio) proxies and use useObserve in React applications

## Install

```bash
npm install valtio valtio-observe
```

## Vanilla js/ts usage

```ts
observe<T>(func: () => T, consume: (value: T) => void, inSync?: boolean): { sync: () => boolean; stop: () => void }
```

The `observe` excecutes the `func` and passes its result to the `consume` function.
It subscribes to all proxy properties which getters were accessed while calling the `func`.
Additianally it searches for proxies in the returned value and subscribes to them.
The `observe` returns functions 'stop' and 'sync'. The `stop` should be called to stop the process.
The `sync` can be useful with asynchronous observes and it allows to execute pending updates if any.
Note: If the references to the returned functions are lost the observing will be stoped on the next GC run.

```ts
batch(body: () => void): void
```

The `batch` is useful with synchronous observes to trigger only one update for multiple changes made in the batch.

Example

```ts
import { proxy } from 'valtio';
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
//stop = null; // don't lose the reference to the returned stop function otherwise it will be auto-stopped on the next GC run!

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

The `useObserve` converts the object returned from the `func` to a read-only copy.
It calls `snapshot` for the proxies found in the object.

```js
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
