import { describe, expect, it } from 'vitest';
import { bookPdfPage, scenarioBookPages, sectionBookPage, type BooksFile } from '../src/books';

const files = [
  { path: 'a.pdf', first: 1, last: 21 },
  { path: 'b.pdf', first: 22, last: 41 }
];
const books: BooksFile = { scenario: { files, pages: { '0': [3], '74': [90, 91], '4A': [7] } }, section: { files } };

describe('book pages', () => {
  it('finds the volume and PDF page of a book page', () => {
    expect(bookPdfPage(files, 3)).toEqual({ path: 'a.pdf', pdfPage: 3 });
    expect(bookPdfPage(files, 22)).toEqual({ path: 'b.pdf', pdfPage: 1 });
    expect(bookPdfPage(files, 42)).toBeUndefined();
  });

  it('looks up scenario pages, falling back to the unlettered scenario', () => {
    expect(scenarioBookPages(books, '0')).toEqual([3]);
    expect(scenarioBookPages(books, '4A')).toEqual([7]);
    expect(scenarioBookPages(books, '74B')).toEqual([90, 91]);
    expect(scenarioBookPages(books, '999')).toEqual([]);
  });

  it('puts sections on the page of their number', () => {
    expect(sectionBookPage('12.3')).toBe(12);
    expect(sectionBookPage('197.1')).toBe(197);
    expect(sectionBookPage('rnd')).toBeUndefined();
  });
});
