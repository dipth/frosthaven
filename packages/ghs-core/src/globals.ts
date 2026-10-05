// GHS assigns its singletons onto `window` at module load; give Node one.
const g = globalThis as any;
if (typeof g.window === 'undefined') {
  g.window = g;
}
export {};
