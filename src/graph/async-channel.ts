// =============================================================================
// AsyncChannel<T> — Push-to-pull bridge implementing AsyncIterable
// =============================================================================

export class AsyncChannel<T> implements AsyncIterable<T> {
  private buffer: T[] = [];
  private waiters: Array<{
    resolve: (value: IteratorResult<T>) => void;
  }> = [];
  private closed = false;

  push(value: T): void {
    if (this.closed) return;

    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.resolve({ value, done: false });
    } else {
      this.buffer.push(value);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters) {
      waiter.resolve({ value: undefined as unknown as T, done: true });
    }
    this.waiters = [];
  }

  get isClosed(): boolean {
    return this.closed;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift()!, done: false });
        }
        if (this.closed) {
          return Promise.resolve({
            value: undefined as unknown as T,
            done: true,
          });
        }
        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiters.push({ resolve });
        });
      },
    };
  }
}
