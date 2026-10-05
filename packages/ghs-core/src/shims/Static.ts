/** Subset of GHS ui/helper/Static used by the game logic. */
export function ghsShuffleArray(array: any[]): any[] {
  let i = array.length,
    r;
  while (i !== 0) {
    r = Math.floor(Math.random() * i);
    i--;
    [array[i], array[r]] = [array[r], array[i]];
  }
  return array;
}

export function ghsClamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export function downloadJson(_object: any, _filename: string) {}
