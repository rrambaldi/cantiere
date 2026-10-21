// React, ReactDOM, markdown-it ed EasyMDE arrivano come script UMD da /ui/vendor/ (design D16), non come import.
import type EasyMDEType from "easymde";
import type MarkdownIt from "markdown-it";
import type { createPortal } from "react-dom";
import type * as ReactDOMClient from "react-dom/client";

declare global {
  const markdownit: typeof MarkdownIt;
  const ReactDOM: typeof ReactDOMClient & { createPortal: typeof createPortal };
  const EasyMDE: typeof EasyMDEType;
  type EasyMDE = EasyMDEType;
}
