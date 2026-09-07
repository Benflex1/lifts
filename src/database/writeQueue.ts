export type WriteQueue = <T>(work: () => Promise<T>) => Promise<T>;

export function createWriteQueue(): WriteQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = tail.then(work);
    tail = result.catch(() => undefined);
    return result;
  };
}
