/** A PDF of the book pages first..last (see packages/data/scripts/books.ts). */
export interface BookFile {
  /** Path under the Worldhaven assets. */
  path: string;
  first: number;
  last: number;
}

/** generated/books.json */
export interface BooksFile {
  /** `pages`: scenario index -> the scenario book pages it's printed on. */
  scenario: { files: BookFile[]; pages: Record<string, number[]> };
  section: { files: BookFile[] };
}

export type BookName = keyof BooksFile;

/** The PDF holding a book page, and the page's number within it. */
export function bookPdfPage(files: BookFile[], page: number): { path: string; pdfPage: number } | undefined {
  const file = files.find((f) => page >= f.first && page <= f.last);
  return file && { path: file.path, pdfPage: page - file.first + 1 };
}

/** Scenario book pages of a scenario; 74A and 74B share the pages of 74. */
export function scenarioBookPages(books: BooksFile, index: string): number[] {
  return books.scenario.pages[index] ?? books.scenario.pages[index.replace(/[A-Z]$/, '')] ?? [];
}

/** Sections are numbered by their page in the section book: §12.3 is on page 12. */
export function sectionBookPage(section: string): number | undefined {
  const page = Number(section.split('.')[0]);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}
