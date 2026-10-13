import { useEffect, useRef, useState } from "react";
import DOMPurify from "dompurify";

/** Isolate untrusted mail from the application. Scripts/forms/navigation stay sandboxed. */
export function EmailHtmlView({ html, title }: { html: string; title: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [documentHtml, setDocumentHtml] = useState("");
  const [height, setHeight] = useState(240);
  useEffect(() => {
    const safe = DOMPurify.sanitize(html, { ADD_TAGS: ["style"], FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "svg", "math"], FORBID_ATTR: ["srcset", "background"] });
    setDocumentHtml(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; font-src https:; base-uri 'none'; form-action 'none'"><style>html,body{margin:0;padding:0;font:14px Arial,sans-serif;overflow-wrap:anywhere}body{padding:8px;box-sizing:border-box}img{max-width:100%;height:auto}table{max-width:100%}a{overflow-wrap:anywhere}*{box-sizing:border-box}</style></head><body>${safe}</body></html>`);
  }, [html]);
  const resize = () => {
    const body = frame.current?.contentDocument?.body;
    if (!body) return;
    setHeight(Math.min(1600, Math.max(120, body.scrollHeight + 20)));
    body.querySelectorAll("img").forEach((image) => image.addEventListener("load", () => setHeight(Math.min(1600, Math.max(120, body.scrollHeight + 20))), { once: true }));
  };
  return <iframe ref={frame} title={title} sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox" referrerPolicy="no-referrer" srcDoc={documentHtml} onLoad={resize} height={height} className="w-full border-0 bg-card" />;
}