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
observe<T>(func: () => T, consume: (value: T) => void, inSync?: boolean): () => void
```

The observe exceutes the func and passes its result to the consume function.
It subscribes to all proxy properties which getters were accessed while calling the func.
Additianally it searches for proxies in the returned value and subscribes to them.
The observe returns a function that should be called to stop the process.
Note: If the reference to the stop function is lost the obrerving will be stoped on the next GC run.

Example

```js
import { proxy } from 'valtio';
import { observe } from 'valtio-observe/vanilla';

let stop = observe(
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

setInterval(() => {
  state1.x++;

  if (state1.x % 2 == 0) {
    if (state2.a.y % 2 == 0) {
      state2.a.y++;
    } else {
      state2.a = { y: state2.a.y + 1 };
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

setTimeout(stop, 60_000);
```

## Usage with React

```ts
useObserve<T>(func: () => T, inSync?: boolean): T
```

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
