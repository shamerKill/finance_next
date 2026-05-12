import { Children, ReactNode, cloneElement, isValidElement } from "react";

// Node 2.C.2 — FormField.
//
// Three-slot form row: label (top) / hint (below label) / children (input)
// / error (below input). Mobile-friendly per spec §G5: label is always
// above the input (never to the left), 44px+ touch targets via children.
//
// HeroUI inputs (`<Input>`, `<NumberInput>`, `<Select>`, `<Textarea>`) all
// accept an `isInvalid` prop. When `error` is set we forward that prop to
// a *single* child if it's a React element. Multi-child cases (`<input>`
// + helper button) should pass `isInvalid` themselves.
//
// Node 5.D.1 — input slot is `min-h-[44px]` (iOS HIG touch target). HeroUI
// inputs already render to ≥44 in `md` size; the wrapper enforces this as
// a floor for raw `<input>` / `<select>` / `<textarea>` children. For
// numeric inputs, set `inputMode="decimal"` directly on the child <Input>
// (or `inputMode="numeric"` for integer-only) to hint the mobile keyboard.

export interface FormFieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Set `htmlFor` on the label. The child input should carry the same id. */
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function FormField({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: FormFieldProps) {
  // Forward isInvalid + aria-describedby to a single HeroUI input child so
  // screen readers announce the hint/error and the ring color matches.
  // Multi-child call sites should set both props themselves.
  const hintId = hint && htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  const child = Children.only(children);
  const wrapped = isValidElement(child)
    ? cloneElement(child as React.ReactElement<Record<string, unknown>>, {
        ...(error ? { isInvalid: true } : {}),
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
      })
    : child;

  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label
        htmlFor={htmlFor}
        className="text-sm font-semibold text-text-primary flex items-center gap-1"
      >
        {label}
        {required && (
          <span className="text-accent-down" aria-label="必填">
            *
          </span>
        )}
      </label>
      {hint && (
        <div id={hintId} className="text-xs text-text-tertiary">
          {hint}
        </div>
      )}
      <div className="[&>*]:min-h-[44px]">{wrapped}</div>
      {error && (
        <div id={errorId} className="text-xs text-accent-down" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
