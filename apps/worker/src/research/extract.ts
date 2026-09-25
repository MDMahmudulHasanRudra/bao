import { createHash } from 'node:crypto';

const BLOCK_TAGS = 'address|article|aside|blockquote|div|footer|header|main|nav|section';
const NOISE_TAGS = 'script|style|noscript|template|svg|iframe|form|button';
const HEADING_TAGS = 'h1|h2|h3|h4|h5|h6';
const SKIP_LINK_TAGS = 'nav|footer|header|aside|form|button';
const SOCIAL_HOSTS = [
  'linkedin.com',
  'twitter.com',
  'x.com',
  'facebook.com',
  'instagram.com',
  'youtube.com',
  'github.com',
  'gitlab.com',
  'crunchbase.com',
  'xing.com',
  'medium.com',
];

function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&middot;/gi, '·')
    .replace(/&ndash;/gi, '–')
    .replace(/&mdash;/gi, '—')
    .replace(/&rsquo;/gi, '’');
}

function collapse(s: string): string {
  return decodeEntities(s.replace(/\s+/g, ' ')).trim();
}

function collect(html: string, pattern: RegExp, group = 1): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(pattern)) {
    const value = m[group]?.trim();
    if (value) out.push(value);
  }
  return out;
}

/** Section 19: pages that actually carry company information, in priority order. */
export const PRIORITY_PATHS = [
  'about',
  'company',
  'products',
  'services',
  'solutions',
  'pricing',
  'careers',
  'jobs',
  'contact',
  'security',
  'customers',
  'case-studies',
];

export function normalizeUrl(raw: string, base?: string): string {
  const url = new URL(raw, base);
  url.hash = '';
  url.protocol = 'https:';
  if (url.port === '80' || url.port === '443') url.port = '';
  const params = [...url.searchParams.entries()].filter(([k]) => !/^utm_|^ref$|^fbclid$/i.test(k));
  url.search = '';
  for (const [k, v] of params) url.searchParams.append(k, v);
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }
  return url.toString();
}

export function normalizedDomain(raw: string): string | null {
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname
      .toLowerCase()
      .replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Section 17: strip noise, keep main text + structured fields. Raw HTML never reaches an LLM. */
export function extractDocument(html: string, url: string): {
  title?: string;
  description?: string;
  headings: string[];
  content: string;
  language?: string;
  links: string[];
  emails: string[];
  phones: string[];
  socialLinks: string[];
  contentHash: string;
  canonicalUrl?: string;
} {
  const title = collapse(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '');
  const description = collapse(
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ??
      html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1] ??
      '',
  );
  const language = collapse(
    html.match(/<html[^>]+lang=["']([a-zA-Z-]{2,10})["']/i)?.[1] ?? '',
  ).toLowerCase() || undefined;
  const canonicalUrl = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1];

  const headings = [...new Set(collect(html, new RegExp(`<(${HEADING_TAGS})[^>]*>([\\s\\S]*?)</\\1>`, 'gi'), 2))]
    .map(collapse)
    .filter(Boolean)
    .slice(0, 50);

  const body = html
    .replace(new RegExp(`<(${NOISE_TAGS})[^>]*>[\\s\\S]*?</\\1>`, 'gi'), ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(new RegExp(`<(${SKIP_LINK_TAGS})\\b[^>]*>[\\s\\S]*?</\\1>`, 'gi'), ' ')
    .replace(new RegExp(`<(${BLOCK_TAGS})[^>]*>`, 'gi'), '\n')
    .replace(new RegExp(`</(${BLOCK_TAGS})>`, 'gi'), '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  // main text is the longest run between blank lines, which beats <main> on broken markup
  const blocks = body
    .split(/\n+/)
    .map(collapse)
    .filter((b) => b.length > 1);
  const main = blocks.sort((a, b) => b.length - a.length)[0] ?? '';
  const content = collapse(main);

  const links = [
    ...new Set(
      collect(html, /<a[^>]+href=["']([^"'#]+)["']/gi).flatMap((href) => {
        try {
          return [new URL(href, url).toString()];
        } catch {
          return [];
        }
      }),
    ),
  ].slice(0, 200);

  const text = collapse(body);
  // wrapped in a group so collect() can read match[1]
  const emails = [...new Set(collect(text, /([\w.+-]+@[\w-]+\.[\w.-]{2,})/g))].filter(
    (e) => !/\.(png|jpe?g|gif|svg|webp)$/i.test(e),
  );
  const phones = [
    ...new Set(
      collect(text, /(\+?\d[\d\s().-]{7,}\d)/g).map((p) => p.trim()).filter((p) => p.replace(/\D/g, '').length >= 9),
    ),
  ].slice(0, 20);
  const socialLinks = links.filter((l) =>
    SOCIAL_HOSTS.some((h) => l.toLowerCase().includes(h)),
  );

  return {
    title: title || undefined,
    description: description || undefined,
    headings,
    content,
    language,
    links,
    emails: emails.slice(0, 20),
    phones,
    socialLinks: socialLinks.slice(0, 20),
    contentHash: contentHash(content),
    canonicalUrl,
  };
}
