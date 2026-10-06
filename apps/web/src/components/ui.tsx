import { useEffect, useId, useState, type ReactNode } from 'react';

export function Panel({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel min-w-0 p-4 ${className}`}>
      {(title || actions) && (
        <header className="mb-3 flex flex-wrap items-center gap-2">
          {title && <h2 className="font-medium">{title}</h2>}
          {actions && <div className="ml-auto flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** A number with -/+ buttons and direct entry; calls onChange with the new value. */
export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9999,
  disabled = false,
  width = 'w-14'
}: {
  value: number;
  onChange(value: number): void;
  min?: number;
  max?: number;
  disabled?: boolean;
  width?: string;
}) {
  const [draft, setDraft] = useState<string>();
  const commit = (next: number) => {
    const clamped = Math.max(min, Math.min(max, next));
    if (clamped !== value) {
      onChange(clamped);
    }
  };
  return (
    <div className="inline-flex items-center gap-1">
      <button type="button" className="btn h-7 w-7 p-0" disabled={disabled || value <= min} onClick={() => commit(value - 1)} aria-label="Decrease">
        −
      </button>
      <input
        className={`input ${width} py-1 text-center font-mono`}
        inputMode="numeric"
        disabled={disabled}
        value={draft ?? String(value)}
        onChange={(e) => setDraft(e.target.value.replace(/[^\d-]/g, ''))}
        onBlur={() => {
          if (draft !== undefined && draft !== '' && !Number.isNaN(Number(draft))) {
            commit(Number(draft));
          }
          setDraft(undefined);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <button type="button" className="btn h-7 w-7 p-0" disabled={disabled || value >= max} onClick={() => commit(value + 1)} aria-label="Increase">
        +
      </button>
    </div>
  );
}

export function StatRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div>
        <div className="text-sm text-frost-300">{label}</div>
        {hint && <div className="text-xs text-frost-400">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/** Checkbox boxes like on the physical sheet: click box n to set value n (or n-1 if already n). */
export function Boxes({ count, value, onChange, disabled }: { count: number; value: number; onChange(value: number): void; disabled?: boolean }) {
  return (
    <span className="inline-flex gap-1">
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          disabled={disabled}
          onClick={() => onChange(value === i + 1 ? i : i + 1)}
          className={`h-4 w-4 rounded-sm border transition ${i < value ? 'border-ice-400 bg-ice-400' : 'border-frost-400 hover:border-ice-300'} disabled:cursor-not-allowed`}
          aria-label={`Box ${i + 1}`}
        />
      ))}
    </span>
  );
}

export function Chip({ children, onRemove }: { children: ReactNode; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-ink-600 bg-ink-850 px-2.5 py-0.5 text-xs text-frost-300">
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-frost-400 hover:text-blood-400" aria-label="Remove">
          ×
        </button>
      )}
    </span>
  );
}

/** Text input with suggestions; submits on Enter or Add. */
export function AddInput({
  placeholder,
  options,
  onAdd,
  buttonLabel = 'Add'
}: {
  placeholder: string;
  options?: { value: string; label: string }[];
  onAdd(value: string): void;
  buttonLabel?: string;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const match = options?.find((o) => o.label.toLowerCase() === trimmed.toLowerCase() || o.value === trimmed);
    onAdd(match ? match.value : trimmed);
    setValue('');
  };
  return (
    <div className="flex gap-2">
      <input
        className="input"
        placeholder={placeholder}
        list={options ? id : undefined}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      {options && (
        <datalist id={id}>
          {options.map((o) => (
            <option key={o.value} value={o.label} />
          ))}
        </datalist>
      )}
      <button type="button" className="btn" onClick={submit}>
        {buttonLabel}
      </button>
    </div>
  );
}

/** Textarea that saves on blur. */
export function NotesField({ value, onSave, rows = 4, placeholder }: { value: string; onSave(value: string): void; rows?: number; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <textarea
      className="input min-h-24 resize-y font-normal"
      rows={rows}
      placeholder={placeholder}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onSave(draft)}
    />
  );
}

export function Modal({ title, onClose, children, wide }: { title: ReactNode; onClose(): void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal className={`panel max-h-[90vh] w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} overflow-y-auto p-5`}>
        <header className="mb-4 flex items-start gap-2">
          <h2 className="text-lg font-medium">{title}</h2>
          <button className="ml-auto text-frost-400 hover:text-frost-100" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
