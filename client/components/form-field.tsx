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
  // Forward isInvalid to a single HeroUI input child so the ring color
  // matches. We don't try to be clever about multi-child cases — those
  // call sites should pass isInvalid themselves.
  const child = Children.only(children);
  const wrapped =
    isValidElement(child) && error
      ? cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          isInvalid: true,
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
          <span className="text-accent-down" aria-label="required">
            *
          </span>
        )}
      </label>
      {hint && <div className="text-xs text-text-tertiary">{hint}</div>}
      <div>{wrapped}</div>
      {error && (
        <div className="text-xs text-accent-down" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
