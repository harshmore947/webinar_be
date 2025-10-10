import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

/**
 * Sanitizes HTML content to prevent XSS attacks
 * @param html The HTML content to sanitize
 * @returns The sanitized HTML
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";

  // We need to create a window object for DOMPurify to use in Node.js
  const window = new JSDOM("").window;
  const purify = DOMPurify(window);

  // Configure DOMPurify to allow common rich text editor tags
  const cleanHtml = purify.sanitize(html, {
    ALLOWED_TAGS: [
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "p",
      "br",
      "hr",
      "ul",
      "ol",
      "li",
      "b",
      "i",
      "strong",
      "em",
      "u",
      "strike",
      "code",
      "pre",
      "a",
      "span",
      "div",
    ],
    ALLOWED_ATTR: ["href", "target", "rel", "style", "class", "data-*"],
  });

  return cleanHtml;
}
