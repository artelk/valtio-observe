/* eslint-disable react-compiler/react-compiler */
import { observe, snapshotify } from './vanilla.js';
import { useEffect, useRef, useState } from 'react';

export function useObserve<T>(func: () => T, inSync?: boolean): T {
  const snapshot = useRef<T>(null);
  const handle = useRef<{ stop: () => void; restart: () => void }>(null);
  const [, rerender] = useState<object>(null!);

  if (handle.current === null) {
    let isInit = true;
    handle.current = observe(
      func,
      (obj) => {
        snapshot.current = snapshotify(obj);
        if (!isInit) rerender({});
      },
      inSync,
    );
    isInit = false;
  }

  useEffect(() => {
    handle.current!.restart();
    return () => {
      handle.current!.stop();
    };
  }, [handle]);

  return snapshot.current!;
}
