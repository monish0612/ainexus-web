import { memo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { Lightbox } from './Lightbox';

interface MarkdownProps {
  children: string;
  className?: string;
}

// Article bodies come from third-party RSS feeds (and AI), so the raw HTML that
// `rehype-raw` re-injects is UNTRUSTED. Sanitize it (after raw parsing, before
// render) to strip <script>, event handlers, javascript: URLs, etc. — without a
// sanitizer this is a stored-XSS hole that could exfiltrate the session token.
// We extend GitHub's battle-tested default schema only to keep the formatting
// the app actually renders (lazy-loaded images, code-fence language classes).
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    img: [...(defaultSchema.attributes?.img ?? []), 'loading'],
    code: [...(defaultSchema.attributes?.code ?? []), ['className']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className']],
  },
};

export const Markdown = memo(function Markdown({ children, className }: MarkdownProps) {
  // Inline article images are often screenshots of dense text — clicking one
  // opens the shared zoomable lightbox so it's actually readable.
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);

  return (
    <div className={`prose-nexus ${className ?? ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          img: ({ node, ...props }) => (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img
              loading="lazy"
              {...props}
              role="button"
              tabIndex={0}
              title="Click to zoom"
              className="nexus-zoomable-img"
              onClick={() => props.src && setZoomSrc(String(props.src))}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && props.src) {
                  e.preventDefault();
                  setZoomSrc(String(props.src));
                }
              }}
            />
          ),
        }}
      >
        {children}
      </ReactMarkdown>
      <Lightbox src={zoomSrc} onClose={() => setZoomSrc(null)} />
    </div>
  );
});
