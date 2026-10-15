// React, ReactDOM e markdown-it arrivano come script UMD da /ui/vendor/ (design D16), non come import.
import type MarkdownIt from "markdown-it";
import type * as ReactDOMClient from "react-dom/client";

declare global {
  const markdownit: typeof MarkdownIt;
  const ReactDOM: typeof ReactDOMClient;
}
