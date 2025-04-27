import { describe, expect, it } from 'vitest';
import { proxy } from 'valtio/vanilla';
import { observe } from 'valtio-observe';
import { O, S, F } from 'ts-toolbelt';

describe('observe with circular references', () => {
  it('deep equal with cycle', () => {
    test(
      unpath({ a: { b: path('_') } }),
      unpath({ a: { b: path('_') } }),
      (prevResult, actualResult) => {
        expect(actualResult).toBe(prevResult);
        expect(actualResult.a.b).toBe(actualResult);
      },
    );
  });

  it('not equal with cycle #1', () => {
    test(
      unpath({ a: { b: path('_') }, c: 1 }),
      unpath({ a: { b: path('_') }, c: 2 }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.c).toBe(2);
        expect(actualResult.a.b).toBe(actualResult);
      },
    );
  });

  it('not equal with cycle #2', () => {
    test(
      unpath({ a: { b: path('_'), c: 1 } }),
      unpath({ a: { b: path('_'), c: 2 } }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.a.c).toBe(2);
        expect(actualResult.a.b).toBe(actualResult);
      },
    );
  });

  it('inner cycle unchanged', () => {
    test(
      unpath({ o: { a: { b: path('_.o') } }, c: 1 }),
      unpath({ o: { a: { b: path('_.o') } }, c: 2 }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.c).toBe(2);
        expect(actualResult.o).toBe(prevResult.o);
        expect(actualResult.o.a.b).toBe(actualResult.o);
      },
    );
  });

  it('inner cycle changed', () => {
    test(
      unpath({ o: { a: { b: path('_.o') }, c: 1 } }),
      unpath({ o: { a: { b: path('_.o') }, c: 2 } }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.o.c).toBe(2);
        expect(actualResult.o).not.toBe(prevResult.o);
        expect(actualResult.o.a.b).toBe(actualResult.o);
      },
    );
  });

  it('the same object referenced twice - unchanged', () => {
    test(
      unpath({ a: { b: { c: path('_.a') } }, d: path('_.a.b') }),
      unpath({ a: { b: { c: path('_.a') } }, d: path('_.a.b') }),
      (prevResult, actualResult) => {
        expect(actualResult).toBe(prevResult);
        expect(actualResult.a.b.c).toBe(actualResult.a);
        expect(actualResult.d).toBe(actualResult.a.b);
      },
    );
  });

  it('the same object referenced twice - changed #1', () => {
    test(
      unpath({ a: { b: { c: path('_.a') } }, d: path('_.a.b'), x: 1 }),
      unpath({ a: { b: { c: path('_.a') } }, d: path('_.a.b'), x: 2 }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.x).toBe(2);
        expect(actualResult.a).toBe(prevResult.a);
        expect(actualResult.a.b.c).toBe(actualResult.a);
        expect(actualResult.d).toBe(actualResult.a.b);
      },
    );
  });

  it('the same object referenced twice - changed #2', () => {
    test(
      unpath({ a: { b: { c: path('_.a') }, x: 1 }, d: path('_.a.b') }),
      unpath({ a: { b: { c: path('_.a') }, x: 2 }, d: path('_.a.b') }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.a.x).toBe(2);
        expect(actualResult.a).not.toBe(prevResult.a);
        expect(actualResult.a.b.c).toBe(actualResult.a);
        expect(actualResult.d).toBe(actualResult.a.b);
      },
    );
  });

  it('the same object referenced twice - changed #3', () => {
    test(
      unpath({ a: { b: { c: path('_.a'), x: 1 } }, d: path('_.a.b') }),
      unpath({ a: { b: { c: path('_.a'), x: 2 } }, d: path('_.a.b') }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.a.b.x).toBe(2);
        expect(actualResult.a).not.toBe(prevResult.a);
        expect(actualResult.a.b.c).toBe(actualResult.a);
        expect(actualResult.d).toBe(actualResult.a.b);
      },
    );
  });

  it('double cycle - unchanged #1', () => {
    test(
      unpath({
        a: { b: { c: { d: path('_.a.b'), e: path('_.a.b'), f: { x: 1 } } } },
      }),
      unpath({
        a: { b: { c: { d: path('_.a.b'), e: path('_.a.b'), f: { x: 1 } } } },
      }),
      (prevResult, actualResult) => {
        expect(actualResult).toBe(prevResult);
        expect(actualResult.a.b.c.d).toBe(actualResult.a.b);
        expect(actualResult.a.b.c.e).toBe(actualResult.a.b);
      },
    );
  });

  it('double cycle - unchanged #2', () => {
    test(
      unpath({
        a: { b: { c: { d: path('_.a.b'), e: path('_.a'), f: { x: 1 } } } },
      }),
      unpath({
        a: { b: { c: { d: path('_.a.b'), e: path('_.a'), f: { x: 1 } } } },
      }),
      (prevResult, actualResult) => {
        expect(actualResult).toBe(prevResult);
        expect(actualResult.a.b.c.d).toBe(actualResult.a.b);
        expect(actualResult.a.b.c.e).toBe(actualResult.a);
      },
    );
  });

  it('double cycle - unchanged #3', () => {
    test(
      unpath({
        a: { b: { c: { d: path('_.a.b'), e: path('_'), f: { x: 1 } } } },
      }),
      unpath({
        a: { b: { c: { d: path('_.a.b'), e: path('_'), f: { x: 1 } } } },
      }),
      (prevResult, actualResult) => {
        expect(actualResult).toBe(prevResult);
        expect(actualResult.a.b.c.d).toBe(actualResult.a.b);
        expect(actualResult.a.b.c.e).toBe(actualResult);
      },
    );
  });

  it('double cycle - changed #1', () => {
    test(
      unpath({
        a: {
          b: {
            c: { d: path('_.a.b'), e: path('_.a.b'), f: { x: 1 }, g: { y: 0 } },
          },
        },
      }),
      unpath({
        a: {
          b: {
            c: { d: path('_.a.b'), e: path('_.a'), f: { x: 2 }, g: { y: 0 } },
          },
        },
      }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.a.b.c.f.x).toBe(2);
        expect(actualResult.a.b.c.g).toBe(prevResult.a.b.c.g);
        expect(actualResult.a.b.c.d).toBe(actualResult.a.b);
        expect(actualResult.a.b.c.e).toBe(actualResult.a);
      },
    );
  });

  it('double cycle - changed #2', () => {
    test(
      unpath({
        a: {
          b: {
            c: { d: path('_.a.b'), e: path('_.a.b') },
            f: { x: 1 },
            g: { y: 0 },
          },
        },
      }),
      unpath({
        a: {
          b: {
            c: { d: path('_.a.b'), e: path('_.a') },
            f: { x: 2 },
            g: { y: 0 },
          },
        },
      }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.a.b.f.x).toBe(2);
        expect(actualResult.a.b.g).toBe(prevResult.a.b.g);
        expect(actualResult.a.b.c.d).toBe(actualResult.a.b);
        expect(actualResult.a.b.c.e).toBe(actualResult.a);
      },
    );
  });

  it('double cycle - changed #3', () => {
    test(
      unpath({
        a: {
          b: { c: { d: path('_.a.b'), e: path('_.a.b') } },
          f: { x: 1 },
          g: { y: 0 },
        },
      }),
      unpath({
        a: {
          b: { c: { d: path('_.a.b'), e: path('_.a') } },
          f: { x: 2 },
          g: { y: 0 },
        },
      }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.a.f.x).toBe(2);
        expect(actualResult.a.g).toBe(prevResult.a.g);
        expect(actualResult.a.b.c.d).toBe(actualResult.a.b);
        expect(actualResult.a.b.c.e).toBe(actualResult.a);
      },
    );
  });

  it('double cycle - changed #4', () => {
    test(
      unpath({
        a: { b: { c: { d: path('_.a.b'), e: path('_.a.b') } } },
        f: { x: 1 },
        g: { y: 0 },
      }),
      unpath({
        a: { b: { c: { d: path('_.a.b'), e: path('_.a') } } },
        f: { x: 2 },
        g: { y: 0 },
      }),
      (prevResult, actualResult) => {
        expect(actualResult).not.toBe(prevResult);
        expect(actualResult.f.x).toBe(2);
        expect(actualResult.g).toBe(prevResult.g);
        expect(actualResult.a.b.c.d).toBe(actualResult.a.b);
        expect(actualResult.a.b.c.e).toBe(actualResult.a);
      },
    );
  });
});

function test<TPrev, T>(
  prevResult: TPrev,
  result: T,
  check: (prevResult: TPrev, actualResult: T) => void,
) {
  const state = proxy({ count: 0 });
  let actualResult = undefined as T,
    resultToReturn = prevResult;
  const { stop } = observe(
    () => {
      const _count = state.count;
      return resultToReturn;
    },
    (v) => {
      actualResult = v as unknown as T;
    },
    true,
  );

  expect(actualResult).toBe(prevResult);
  resultToReturn = result as unknown as TPrev;
  state.count++;
  check(prevResult, actualResult);
  stop();
}

class Path<P extends string> {
  path: P;
  constructor(p: P) {
    this.path = p;
  }
}

function path<P extends string>(p: P): Path<P> {
  return new Path<P>(p);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function doGetByPath(o: any, path: string[], i: number = 0) {
  if (i === path.length) return o;
  return doGetByPath(o[path[i]!], path, i + 1);
}

function getByPath<O extends object, P extends string>(
  object: O,
  path: F.AutoPath<O, P>,
): O.Path<O, S.Split<P, '.'>> {
  return doGetByPath(object, path.split('.'));
}

type ReplacePath<RootType extends object, Type> =
  Type extends Path<infer P>
    ? O.Path<RootType, S.Split<P, '.'>>
    : Type extends object
      ? ReplacePaths<RootType, Type>
      : Type;

type ReplacePaths<RootType extends object, ObjType extends object> = {
  [KeyType in keyof ObjType]: ReplacePath<RootType, ObjType[KeyType]>;
};

type Wrap<T> = { _: T };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolvePaths(root: any, object: any): any {
  if (object instanceof Path) return getByPath(root, object.path);
  if (typeof object === 'object') {
    Reflect.ownKeys(object).forEach((key) => {
      Reflect.set(object, key, resolvePaths(root, Reflect.get(object, key)));
    });
  }
  return object;
}

function unpath<T>(object: T): ReplacePaths<Wrap<T>, Wrap<T>>['_'] {
  const wrapped: Wrap<T> = { _: object };
  return resolvePaths(wrapped, wrapped)._;
}
