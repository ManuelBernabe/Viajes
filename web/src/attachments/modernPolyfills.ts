/**
 * pdf.js 6 usa funciones de JavaScript de 2025 que el Safari de iOS 26 aún no trae. Se añaden si faltan,
 * tanto en la página como en el worker (que importa este mismo fichero antes que pdf.js).
 */

interface MapLike<K, V> {
  has(key: K): boolean;
  get(key: K): V | undefined;
  set(key: K, value: V): unknown;
}

function polyfill(target: object): void {
  const proto = target as Record<string, unknown>;
  if (typeof proto.getOrInsert !== 'function') {
    Object.defineProperty(proto, 'getOrInsert', {
      configurable: true,
      writable: true,
      value: function getOrInsert<K, V>(this: MapLike<K, V>, key: K, value: V): V {
        if (this.has(key)) {
          return this.get(key) as V;
        }
        this.set(key, value);
        return value;
      },
    });
  }
  if (typeof proto.getOrInsertComputed !== 'function') {
    Object.defineProperty(proto, 'getOrInsertComputed', {
      configurable: true,
      writable: true,
      value: function getOrInsertComputed<K, V>(this: MapLike<K, V>, key: K, compute: (key: K) => V): V {
        if (this.has(key)) {
          return this.get(key) as V;
        }
        const value = compute(key);
        this.set(key, value);
        return value;
      },
    });
  }
}

polyfill(Map.prototype);
polyfill(WeakMap.prototype);

// pdf.js recorre el texto con «for await (const chunk of readableStream)»: Safari aún no hace iterable un ReadableStream.
const streamProto = (typeof ReadableStream === 'undefined' ? null : ReadableStream.prototype) as
  | (Record<string | symbol, unknown> & { getReader(): { read(): Promise<{ done: boolean; value: unknown }>; cancel(): Promise<void>; releaseLock(): void } })
  | null;
if (streamProto && typeof streamProto[Symbol.asyncIterator] !== 'function') {
  const values = function values(this: typeof streamProto, options?: { preventCancel?: boolean }) {
    const reader = this.getReader();
    const preventCancel = options?.preventCancel === true;
    return {
      next: () => reader.read(),
      return: async (value?: unknown) => {
        if (preventCancel) {
          reader.releaseLock();
        } else {
          await reader.cancel();
        }
        return { done: true, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
  Object.defineProperty(streamProto, 'values', { configurable: true, writable: true, value: values });
  Object.defineProperty(streamProto, Symbol.asyncIterator, { configurable: true, writable: true, value: values });
}

const promise = Promise as unknown as Record<string, unknown>;
if (typeof promise.try !== 'function') {
  promise.try = function tryPromise<T>(fn: (...args: unknown[]) => T | Promise<T>, ...args: unknown[]): Promise<T> {
    return new Promise<T>((resolve) => resolve(fn(...args)));
  };
}

const math = Math as unknown as Record<string, unknown>;
if (typeof math.sumPrecise !== 'function') {
  math.sumPrecise = function sumPrecise(values: Iterable<number>): number {
    let sum = 0;
    for (const value of values) {
      sum += value;
    }
    return sum;
  };
}

export {};
