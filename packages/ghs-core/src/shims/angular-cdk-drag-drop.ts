export function moveItemInArray<T = any>(array: T[], fromIndex: number, toIndex: number): void {
  const clamp = (value: number) => Math.max(0, Math.min(value, array.length - 1));
  const from = clamp(fromIndex);
  const to = clamp(toIndex);
  if (from === to) {
    return;
  }
  const target = array[from]!;
  const delta = to < from ? -1 : 1;
  for (let i = from; i !== to; i += delta) {
    array[i] = array[i + delta]!;
  }
  array[to] = target;
}
