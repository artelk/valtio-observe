import { proxy } from 'valtio/vanilla';
import { observe } from '../../src/vanilla';

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
