// Tiny markdown renderer used by brief views — handles ##/# headings,
// paragraphs, and **bold**. Keeps the dep footprint zero.

import React from "react";

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const lines = source.split("\n");
  const out: React.ReactNode[] = [];
  let para: string[] = [];
  function flushPara() {
    if (para.length) {
      out.push(<p key={out.length} className="my-3 leading-relaxed">{renderInline(para.join(" "))}</p>);
      para = [];
    }
  }
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      flushPara();
      out.push(<h2 key={out.length} className="mt-6 font-serif text-xl font-bold text-navy">{line.replace(/^##\s/, "")}</h2>);
    } else if (/^#\s/.test(line)) {
      flushPara();
      out.push(<h1 key={out.length} className="mt-6 font-serif text-2xl font-bold text-navy">{line.replace(/^#\s/, "")}</h1>);
    } else if (line.trim() === "") {
      flushPara();
    } else {
      para.push(line);
    }
  }
  flushPara();
  return <div className={className}>{out}</div>;
}

function renderInline(text: string) {
  // Bold: **x**
  const parts: (string | React.ReactNode)[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<strong key={i++}>{m[1]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
