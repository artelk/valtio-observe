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

const App = () => (
  <>
    <Test />
  </>
);

export default App;
