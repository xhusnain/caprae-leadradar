/** Run `fn` over `items` with at most `limit` in flight, yielding results as they finish. */
export async function* mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): AsyncGenerator<R> {
  const queue = items.map((item, i) => ({ item, i }));
  const running = new Map<number, Promise<{ i: number; r: R }>>();
  let next = 0;
  const launch = () => {
    const { item, i } = queue[next++];
    running.set(i, fn(item).then((r) => ({ i, r })));
  };
  while (next < queue.length && running.size < limit) launch();
  while (running.size) {
    const { i, r } = await Promise.race(running.values());
    running.delete(i);
    if (next < queue.length) launch();
    yield r;
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e)),
    );
  });
}

/** First promise to fulfil wins; rejects only when every candidate failed. */
export function firstSuccess<T>(tasks: Promise<T>[]): Promise<T> {
  return new Promise((resolve, reject) => {
    let failed = 0;
    const errors: unknown[] = [];
    tasks.forEach((t) =>
      t.then(resolve, (e) => {
        errors.push(e);
        if (++failed === tasks.length) reject(new AggregateError(errors, "all candidates failed"));
      }),
    );
  });
}
