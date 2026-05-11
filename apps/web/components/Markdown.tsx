"use client";
// Renders chat assistant text as markdown. GFM for tables/strikethrough,
// `remark-breaks` so a bare \n becomes <br> (matches the prior pre-wrap UX).
//
// `light` is for the desktop chat panel and the mobile half-sheet (sand bg).
// `dark` is for the mobile full-sheet bottom panel (deep navy bg).

import ReactMarkdown, { type Components } from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

type Variant = "light" | "dark";

const PALETTE: Record<Variant, {
  link: string;
  codeBg: string;
  codeFg: string;
  blockBg: string;
  rule: string;
}> = {
  light: {
    link:    "#147184",
    codeBg:  "rgba(20,113,132,0.08)",
    codeFg:  "#147184",
    blockBg: "rgba(20,113,132,0.06)",
    rule:    "rgba(20,113,132,0.2)",
  },
  dark: {
    link:    "#7adcd2",
    codeBg:  "rgba(255,255,255,0.12)",
    codeFg:  "#cde9e3",
    blockBg: "rgba(255,255,255,0.08)",
    rule:    "rgba(255,255,255,0.2)",
  },
};

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function buildComponents(variant: Variant): Components {
  const p = PALETTE[variant];
  return {
    p: ({ children }) => (
      <p style={{ margin: "0 0 6px", lineHeight: "inherit" }}>{children}</p>
    ),
    a: ({ children, href }) => (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{ color: p.link, textDecoration: "underline" }}
      >
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul style={{ margin: "4px 0 6px", paddingLeft: 18 }}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol style={{ margin: "4px 0 6px", paddingLeft: 18 }}>{children}</ol>
    ),
    li: ({ children }) => <li style={{ margin: "1px 0" }}>{children}</li>,
    code: ({ children, className }) => {
      // Inline code has no className; fenced blocks get language-* from GFM.
      if (!className) {
        return (
          <code
            style={{
              background: p.codeBg,
              color: p.codeFg,
              padding: "1px 5px",
              borderRadius: 4,
              fontSize: "0.92em",
              fontFamily: MONO,
            }}
          >
            {children}
          </code>
        );
      }
      return <code className={className}>{children}</code>;
    },
    pre: ({ children }) => (
      <pre
        style={{
          margin: "6px 0",
          padding: 10,
          background: p.blockBg,
          borderRadius: 8,
          fontSize: "0.92em",
          overflow: "auto",
          fontFamily: MONO,
        }}
      >
        {children}
      </pre>
    ),
    h1: ({ children }) => <Heading>{children}</Heading>,
    h2: ({ children }) => <Heading>{children}</Heading>,
    h3: ({ children }) => <Heading>{children}</Heading>,
    h4: ({ children }) => <Heading>{children}</Heading>,
    h5: ({ children }) => <Heading>{children}</Heading>,
    h6: ({ children }) => <Heading>{children}</Heading>,
    hr: () => (
      <hr
        style={{
          margin: "8px 0",
          border: "none",
          borderTop: `1px solid ${p.rule}`,
        }}
      />
    ),
    blockquote: ({ children }) => (
      <blockquote
        style={{
          margin: "4px 0",
          paddingLeft: 10,
          borderLeft: `3px solid ${p.rule}`,
          opacity: 0.85,
        }}
      >
        {children}
      </blockquote>
    ),
  };
}

function Heading({ children }: { children?: React.ReactNode }) {
  return (
    <strong style={{ display: "block", margin: "4px 0 2px" }}>{children}</strong>
  );
}

const COMPONENTS: Record<Variant, Components> = {
  light: buildComponents("light"),
  dark: buildComponents("dark"),
};

export function Markdown({
  children,
  variant = "light",
}: {
  children: string;
  variant?: Variant;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={COMPONENTS[variant]}
    >
      {children}
    </ReactMarkdown>
  );
}
