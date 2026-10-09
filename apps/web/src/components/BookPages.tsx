import { bookPdfPage, scenarioBookPages, sectionBookPage, type BookName } from '@fh/engine';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { assetUrl, useBooks } from '../lib/board-data';
import { Modal } from './ui';

const documents = new Map<string, Promise<PDFDocumentProxy>>();

/** Opens a book volume; pdf.js fetches only the byte ranges of the pages it renders. */
function openPdf(path: string) {
  let doc = documents.get(path);
  if (!doc) {
    doc = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      return pdfjs.getDocument({ url: assetUrl(path), withCredentials: true, disableAutoFetch: true, disableStream: true, rangeChunkSize: 1 << 18 }).promise;
    });
    doc.catch(() => documents.delete(path));
    documents.set(path, doc);
  }
  return doc;
}

const ZOOMS = [1, 1.5, 2];

/** Pages of the scenario or section book, with paging to the pages around them. */
export function BookPagesModal({ book, pages, title, onClose }: { book: BookName; pages: number[]; title: ReactNode; onClose(): void }) {
  const books = useBooks();
  const [from, setFrom] = useState(pages[0] ?? 1);
  const [zoom, setZoom] = useState(1);
  const files = books?.[book].files ?? [];
  const firstPage = files[0]?.first ?? 1;
  const lastPage = files.at(-1)?.last ?? 1;
  const shown = Array.from({ length: Math.max(pages.length, 1) }, (_, i) => from + i).filter((p) => p <= lastPage);

  return (
    <Modal title={title} onClose={onClose} wide="xl">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <button className="btn" disabled={from <= firstPage} onClick={() => setFrom(from - 1)}>
          ← Previous page
        </button>
        <span className="text-frost-400">
          {book === 'scenario' ? 'Scenario' : 'Section'} book p. {shown.join('–')}
        </span>
        <button className="btn" disabled={shown.at(-1)! >= lastPage} onClick={() => setFrom(from + 1)}>
          Next page →
        </button>
        <span className="ml-auto inline-flex gap-1">
          {ZOOMS.map((z) => (
            <button key={z} className={`btn px-2 text-xs ${zoom === z ? 'btn-primary' : ''}`} onClick={() => setZoom(z)}>
              {z * 100}%
            </button>
          ))}
        </span>
      </div>
      {books === null && <p className="text-sm text-blood-400">The book page index is missing; run the data sync.</p>}
      <div className="overflow-x-auto">
        <div className="grid gap-3" style={{ width: `${zoom * 100}%` }}>
          {books &&
            shown.map((page) => {
              const location = bookPdfPage(files, page);
              return location ? (
                <PdfPage key={`${location.path}-${location.pdfPage}-${zoom}`} path={location.path} pdfPage={location.pdfPage} label={`Page ${page}`} />
              ) : null;
            })}
        </div>
      </div>
    </Modal>
  );
}

function PdfPage({ path, pdfPage, label }: { path: string; pdfPage: number; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    let live = true;
    let task: RenderTask | undefined;
    openPdf(path)
      .then((doc) => doc.getPage(pdfPage))
      .then((page) => {
        const canvas = canvasRef.current;
        if (!live || !canvas) return;
        const scale = (canvas.clientWidth / page.getViewport({ scale: 1 }).width) * Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale });
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        task = page.render({ canvas, viewport });
        return task.promise;
      })
      .then(
        () => live && setStatus('ready'),
        (error: unknown) => live && (error as { name?: string })?.name !== 'RenderingCancelledException' && setStatus('error')
      );
    return () => {
      live = false;
      task?.cancel();
    };
  }, [path, pdfPage]);

  return (
    <div className="relative">
      <canvas ref={canvasRef} role="img" aria-label={label} className="block aspect-[630/810] h-auto w-full rounded bg-ink-800" />
      {status !== 'ready' && (
        <div className="absolute inset-0 grid place-items-center text-sm text-frost-400">
          {status === 'loading' ? (
            'Loading page…'
          ) : (
            <span>
              Couldn't show this page.{' '}
              <a className="underline" href={`${assetUrl(path)}#page=${pdfPage}`} target="_blank" rel="noreferrer">
                Open the PDF
              </a>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Opens a scenario's pages of the scenario book. */
export function ScenarioBookButton({ index, title, className = 'btn' }: { index: string; title: string; className?: string }) {
  const books = useBooks();
  const [open, setOpen] = useState(false);
  const pages = books ? scenarioBookPages(books, index) : [];
  if (!pages.length) return null;
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        Scenario book
      </button>
      {open && <BookPagesModal book="scenario" pages={pages} title={`#${index} ${title}`} onClose={() => setOpen(false)} />}
    </>
  );
}

/** A section number that opens its page of the section book. */
export function SectionLink({ section, children, className = '' }: { section: string; children?: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const page = sectionBookPage(section);
  if (!page) return <span className={className}>{children ?? `§${section}`}</span>;
  return (
    <>
      <button className={`underline decoration-dotted underline-offset-4 hover:text-ice-300 ${className}`} title={`Read §${section}`} onClick={() => setOpen(true)}>
        {children ?? `§${section}`}
      </button>
      {open && <BookPagesModal book="section" pages={[page]} title={`§${section}`} onClose={() => setOpen(false)} />}
    </>
  );
}
