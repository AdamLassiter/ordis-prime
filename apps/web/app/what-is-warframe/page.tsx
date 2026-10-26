import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import ReactMarkdown from "react-markdown";

export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "What is Warframe, really?",
  description:
    "A personal look at the many different games that players find inside Warframe.",
};

export default async function WhatIsWarframePage() {
  const source = await readFile(
    resolve(process.cwd(), "../../WHAT-IS.md"),
    "utf8",
  );

  return (
    <section className="editorial-page">
      <p className="eyebrow">Editorial · public perspective</p>
      <article className="editorial-article">
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h2 className="editorial-title">{children}</h2>
            ),
          }}
        >
          {source}
        </ReactMarkdown>
      </article>
    </section>
  );
}
