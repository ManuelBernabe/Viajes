import { useEffect, useState, type DependencyList } from 'react';
import { subscribe } from './bus';

/** Consulta IndexedDB y vuelve a consultar cada vez que los datos locales cambian. */
export function useLiveQuery<T>(query: () => Promise<T>, deps: DependencyList): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    const run = () => {
      query().then(
        (result) => {
          if (alive) {
            setValue(result);
          }
        },
        () => undefined,
      );
    };
    run();
    const unsubscribe = subscribe(run);
    return () => {
      alive = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return value;
}
