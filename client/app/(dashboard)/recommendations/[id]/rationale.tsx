"use client";

// Rationale renderer. The Claude-authored rationale arrives with light
// markdown (**bold headings**, "- " bullets, → arrows). We run it through
// react-markdown — `<pre className="whitespace-pre-wrap">` previously
// leaked the raw asterisks. We deliberately avoid pulling in
// `@tailwindcss/typography` (which would add a heavy theme just for three
// elements) and style the three tags inline with the project's design
// tokens.
//
// Marked "use client" because react-markdown internally calls
// React.createContext during evaluation — Next 16's RSC bundle won't
// accept that in a server component.

import ReactMarkdown from "react-markdown";

export function Rationale({ text }: { text: string }) {
  if (!text) {
    return (
      <div className="text-sm text-text-tertiary">（未生成理由）</div>
    );
  }
  return (
    <div className="text-sm leading-relaxed text-text-primary">
      <ReactMarkdown
        components={{
          // Default <p> margin would crowd the inline bullets; tighten it.
          p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-text-primary">
              {children}
            </strong>
          ),
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-text-secondary">{children}</li>
          ),
          code: ({ children }) => (
            <code className="rounded bg-bg-surface-2 px-1 py-0.5 font-mono text-xs">
              {children}
            </code>
          ),
          // Strip link rendering down to a plain styled anchor — the
          // rationale is operator-internal so we don't need rel="noopener"
          // safety pageantry, but we still want underline + primary tone.
          a: ({ children, href }) => (
            <a href={href} className="text-brand-primary underline">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
