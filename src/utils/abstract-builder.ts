export abstract class AbstractBuilder<T> {
  protected abstract validate(): void;
  protected abstract construct(): T;

  build(): T {
    this.validate();
    return this.construct();
  }
}
