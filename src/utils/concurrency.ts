/** 受控并发执行任务池，避免同时打满浏览器连接上限 */

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!items.length) return []
  const limit = Math.max(1, concurrency)
  const results: R[] = new Array(items.length)
  let cursor = 0

  async function runNext(): Promise<void> {
    const i = cursor++
    if (i >= items.length) return
    results[i] = await worker(items[i]!)
    await runNext()
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runNext()))
  return results
}
