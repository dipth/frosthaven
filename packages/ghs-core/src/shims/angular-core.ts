/** Minimal stand-in for Angular signals as used by GameManager. */
export type WritableSignal<T> = (() => T) & { set(value: T): void; update(fn: (value: T) => T): void };

export function signal<T>(initial: T): WritableSignal<T> {
  let value = initial;
  const read = (() => value) as WritableSignal<T>;
  read.set = (next: T) => {
    value = next;
  };
  read.update = (fn: (value: T) => T) => {
    value = fn(value);
  };
  return read;
}
