import { observe, snapshotify } from './vanilla.js';
import { useEffect, useState } from 'react';

export function useObserve<T>(func: () => T, inSync?: boolean): T {
  const [snapshot, setSnapshot] = useState(() => snapshotify(func()));

  useEffect(() => {
    let isInit = true;
    const { stop } = observe(
      func,
      (obj) => {
        if (!isInit) {
          setSnapshot(snapshotify(obj));
        }
      },
      inSync,
    );
    isInit = false;
    return stop;
  }, []);

  return snapshot;
}
