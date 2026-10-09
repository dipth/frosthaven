/**
 * The Frosthaven scenario and section books, as the PDFs in Worldhaven's
 * images/books/frosthaven (synced by sync-assets.ts like the other images).
 *
 *   generated/books.json  for each book its PDF files (book page ranges) and,
 *                         for the scenario book, the pages of each scenario
 *
 * Each PDF holds book pages first..last in order, so book page p is PDF page
 * p - first + 1. The first volume also holds the cover as page 1. Sections are
 * numbered by their page in the section book (§12.3 is on page 12).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BookFile, BooksFile } from '@fh/engine';

const dir = 'books/frosthaven';
const volumes = (book: string, ranges: [number, number][]): BookFile[] =>
  ranges.map(([first, last]) => ({ path: `${dir}/fh-${book}-book-${first}-${last}.pdf`, first: first === 2 ? 1 : first, last }));

export const BOOKS = {
  scenario: volumes('scenario', [
    [2, 21],
    [22, 41],
    [42, 61],
    [62, 81],
    [82, 101],
    [102, 121],
    [122, 141],
    [142, 166]
  ]),
  section: volumes('section', [
    [2, 21],
    [22, 41],
    [42, 61],
    [62, 81],
    [82, 101],
    [102, 121],
    [122, 141],
    [142, 161],
    [162, 181],
    [182, 197]
  ])
};

/** fhtts places each scenario's maps on the scenario book pages they're printed on. */
export function buildBooks(outDir: string) {
  const scenarios = JSON.parse(readFileSync(join(outDir, 'fhtts/processedScenarios.human.json'), 'utf8')) as Record<
    string,
    { maps: { type: string; name: string | number }[] }
  >;
  const last = BOOKS.scenario.at(-1)!.last;
  const pages: Record<string, number[]> = {};
  for (const [id, scenario] of Object.entries(scenarios)) {
    const printed = scenario.maps.filter((m) => m.type === 'scenario').map((m) => Number(m.name));
    // 138+ are the solo scenarios, printed in their own book.
    if (!printed.length || printed.some((p) => !(p <= last))) continue;
    const from = Math.min(...printed);
    const to = Math.max(...printed);
    pages[id] = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  const books: BooksFile = { scenario: { files: BOOKS.scenario, pages }, section: { files: BOOKS.section } };
  writeFileSync(join(outDir, 'books.json'), JSON.stringify(books));
  console.log(`  ${Object.keys(pages).length} scenarios in the scenario book`);
}
