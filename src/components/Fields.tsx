import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

const formatNumber = (n: number | null, maxDigits = 2) =>
  n == null ? '' : n.toLocaleString('en-CA', { maximumFractionDigits: maxDigits });

const parseNumber = (text: string): number | null | undefined => {
  const cleaned = text.replace(/[,$\s%]/g, '');
  if (cleaned === '' || cleaned === '-') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined; // undefined = invalid, ignore
};

interface NumberFieldProps {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
  /** Visually hide the label (it stays available to screen readers). */
  hideLabel?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  placeholder?: string;
  min?: number;
  className?: string;
  maxDigits?: number;
}

/**
 * A blank-able numeric input. Shows thousands separators when not focused and
 * raw digits while typing. Empty means "not entered" (null), not zero.
 */
export function NumberField({
  value,
  onChange,
  label,
  hideLabel = true,
  prefix,
  suffix,
  placeholder = '0',
  min,
  className = '',
  maxDigits = 2,
}: NumberFieldProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatNumber(value, maxDigits));
  const lastValue = useRef(value);

  // Pick up external changes (import, reset) while not editing.
  useEffect(() => {
    if (!focused && value !== lastValue.current) setText(formatNumber(value, maxDigits));
    lastValue.current = value;
  }, [value, focused, maxDigits]);

  return (
    <div className={`field num ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </label>
      <div className="input-shell">
        {prefix && <span className="affix">{prefix}</span>}
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          placeholder={placeholder}
          onFocus={(e) => {
            setFocused(true);
            setText(value == null ? '' : String(value));
            requestAnimationFrame(() => e.target.select());
          }}
          onBlur={() => {
            setFocused(false);
            setText(formatNumber(value, maxDigits));
          }}
          onChange={(e) => {
            setText(e.target.value);
            let n = parseNumber(e.target.value);
            if (n === undefined) return;
            if (n != null && min != null && n < min) n = min;
            lastValue.current = n;
            onChange(n);
          }}
        />
        {suffix && <span className="affix">{suffix}</span>}
      </div>
    </div>
  );
}

interface SelectFieldProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[] | readonly T[];
  label: string;
  hideLabel?: boolean;
  className?: string;
  title?: string;
}

export function SelectField<T extends string>({
  value,
  onChange,
  options,
  label,
  hideLabel = true,
  className = '',
  title,
}: SelectFieldProps<T>) {
  const id = useId();
  const opts = (options as readonly (T | { value: T; label: string })[]).map((o) =>
    typeof o === 'string' ? { value: o, label: o } : o,
  );
  return (
    <div className={`field select ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </label>
      <div className="input-shell">
        <select id={id} value={value} title={title} onChange={(e) => onChange(e.target.value as T)}>
          {opts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function TextField({
  value,
  onChange,
  label,
  hideLabel = true,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  hideLabel?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`field text ${className}`}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'field-label'}>
        {label}
      </label>
      <div className="input-shell">
        <input
          id={id}
          type="text"
          value={value}
          placeholder={placeholder}
          maxLength={120}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

/**
 * A label with an info icon that reveals an explanation on hover or keyboard focus.
 */
export function HintLabel({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <span className="hint-tip">
      <span>{label}</span>
      <button type="button" className="hint-btn" aria-label={`About ${label}`} aria-describedby={id}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" />
          <path d="M8 7.2v4M8 4.6v.1" />
        </svg>
      </button>
      <span role="tooltip" id={id} className="hint-pop">
        {children}
      </span>
    </span>
  );
}
