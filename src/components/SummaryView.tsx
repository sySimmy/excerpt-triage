"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface SummaryViewProps {
  content: {
    text: string;
    keywords: string[];
  };
}

export default function SummaryView({ content }: SummaryViewProps) {
  return (
    <div className="h-full overflow-y-auto px-5 py-4">
      {content.keywords.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {content.keywords.map((kw) => (
            <span
              key={kw}
              className="px-2.5 py-1 text-xs font-medium bg-teal-500/20 border border-teal-500/30 text-teal-300 rounded-full"
            >
              {kw}
            </span>
          ))}
        </div>
      )}
      <div className="markdown-content max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content.text}
        </ReactMarkdown>
      </div>
    </div>
  );
}
