/** 内存 TTL 缓存 + 同 key 请求去重（inflight）+ 可选 SWR（stale-while-revalidate） */

interface CacheEntry<T> {
  value: T
  at: number
}

export class MemoryCache<T> {
  private entry: CacheEntry<T> | null = null
  private inflight: Promise<T> | null = null
  private readonly ttlMs: number

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  /** 命中未过期值；过期不删条目（保留供 SWR 取旧值），返回 null */
  get(): T | null {
    if (!this.entry) return null
    if (Date.now() - this.entry.at > this.ttlMs) return null
    return this.entry.value
  }

  /** 无论是否过期都返回当前条目值（SWR 取旧值用）；无条目返回 null */
  private peekStale(): T | null {
    return this.entry ? this.entry.value : null
  }

  set(value: T) {
    this.entry = { value, at: Date.now() }
  }

  clear() {
    this.entry = null
    this.inflight = null
  }

  /**
   * 命中缓存直接返回；否则合并并发中的同一 loader。
   * @param force 强制刷新（忽略命中）
   * @param swr 过期但有旧值时：立即返回旧值 + 后台异步刷新；无旧值时仍等首拉
   */
  async load(loader: () => Promise<T>, force = false, swr = false): Promise<T> {
    if (!force) {
      const hit = this.get()
      if (hit != null) return hit
    }
    // SWR：有过期旧值 → 立即返回旧值，后台静默刷新
    if (swr && !force) {
      const stale = this.peekStale()
      if (stale != null) {
        this.kickRefresh(loader)
        return stale
      }
    }
    if (this.inflight) return this.inflight
    this.inflight = loader()
      .then((value) => {
        this.set(value)
        return value
      })
      .finally(() => {
        this.inflight = null
      })
    return this.inflight
  }

  /** 后台刷新：复用 inflight 去重，失败静默不污染旧值 */
  private kickRefresh(loader: () => Promise<T>) {
    if (this.inflight) return
    const task = loader()
      .then((value) => {
        this.set(value)
        return value
      })
      .finally(() => {
        this.inflight = null
      })
    // 后台刷新失败保留旧值，下次再试；单独挂 catch 静默，不影响 task 的 Promise<T> 类型
    task.catch(() => {})
    this.inflight = task
  }
}

export class KeyedMemoryCache<T> {
  private entries = new Map<string | number, CacheEntry<T>>()
  private inflight = new Map<string | number, Promise<T>>()
  private readonly ttlMs: number

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  /** 命中未过期值；过期不删条目（保留供 SWR 取旧值），返回 null */
  get(key: string | number): T | null {
    const entry = this.entries.get(key)
    if (!entry) return null
    if (Date.now() - entry.at > this.ttlMs) return null
    return entry.value
  }

  /** 无论是否过期都返回当前条目值（SWR 取旧值用）；无条目返回 null */
  private peekStale(key: string | number): T | null {
    return this.entries.get(key)?.value ?? null
  }

  set(key: string | number, value: T) {
    this.entries.set(key, { value, at: Date.now() })
  }

  clear() {
    this.entries.clear()
    this.inflight.clear()
  }

  /**
   * 命中缓存直接返回；否则合并并发中的同一 loader。
   * @param force 强制刷新（忽略命中）
   * @param swr 过期但有旧值时：立即返回旧值 + 后台异步刷新；无旧值时仍等首拉
   */
  async load(
    key: string | number,
    loader: () => Promise<T>,
    force = false,
    swr = false,
  ): Promise<T> {
    if (!force) {
      const hit = this.get(key)
      if (hit != null) return hit
    }
    if (swr && !force) {
      const stale = this.peekStale(key)
      if (stale != null) {
        this.kickRefresh(key, loader)
        return stale
      }
    }
    const pending = this.inflight.get(key)
    if (pending) return pending
    const task = loader()
      .then((value) => {
        this.set(key, value)
        return value
      })
      .finally(() => {
        this.inflight.delete(key)
      })
    this.inflight.set(key, task)
    return task
  }

  private kickRefresh(key: string | number, loader: () => Promise<T>) {
    if (this.inflight.has(key)) return
    const task = loader()
      .then((value) => {
        this.set(key, value)
        return value
      })
      .finally(() => {
        this.inflight.delete(key)
      })
    // 后台刷新失败保留旧值，下次再试；单独挂 catch 静默，不影响 task 的 Promise<T> 类型
    task.catch(() => {})
    this.inflight.set(key, task)
  }
}
