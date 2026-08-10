import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

const AGENT_URL = process.env.SCRAPLING_AGENT_URL || 'http://127.0.0.1:8001';

/** Block SSRF targets: localhost, link-local and private IPv4 ranges. */
function assertPublicUrl(raw: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Only http(s) URLs are supported');
  }
  const hostname = u.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]') {
    throw new Error('Local addresses are not allowed');
  }
  const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = ipv4.slice(1).map(Number);
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      throw new Error('Private IP ranges are not allowed');
    }
  }
  return u;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url || typeof url !== 'string') {
      return NextResponse.json({ error: 'Valid URL is required' }, { status: 400 });
    }

    try {
      assertPublicUrl(url);
    } catch (err) {
      return NextResponse.json({ error: (err as Error).message }, { status: 400 });
    }

    // Strategy 1: Scrapling agent (uv-managed) — adaptive, anti-bot aware
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 60_000);
      const res = await fetch(`${AGENT_URL}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const data = await res.json();
        if (data?.title || data?.description) {
          return NextResponse.json(data);
        }
      }
    } catch {
      // Agent offline — fall through to the built-in extractor
    }

    // Strategy 2: built-in adaptive extractor (cheerio)
    const result = await scrapeWithCheerio(url);
    return NextResponse.json(result);
  } catch (err: unknown) {
    console.error('Error in scrape API route:', err);
    return NextResponse.json({
      error: 'Failed to scrape job offer: ' + (err instanceof Error ? err.message : typeof err === 'object' && err ? JSON.stringify(err) : String(err))
    }, { status: 500 });
  }
}

async function scrapeWithCheerio(url: string) {
  // Scrapling-style adaptive fetch with browser-like headers
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9'
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch page: HTTP ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  let title = '';
  let company = '';
  let location = '';
  let salary = '';
  let description = '';

  // Strategy 1: Check Schema.org JobPosting JSON-LD
  $('script[type="application/ld+json"]').each((_, elem) => {
    try {
      const json = JSON.parse($(elem).html() || '{}');
      const jobData = Array.isArray(json) ? json.find((item) => item['@type'] === 'JobPosting') : (json['@type'] === 'JobPosting' ? json : null);

      if (jobData) {
        title = jobData.title || title;
        company = jobData.hiringOrganization?.name || company;
        if (jobData.jobLocation) {
          location = jobData.jobLocation.address?.addressLocality || jobData.jobLocation.address?.addressRegion || 'Remote / Hybrid';
        }
        if (jobData.baseSalary) {
          salary = `${jobData.baseSalary.value?.minValue || ''} - ${jobData.baseSalary.value?.maxValue || ''} ${jobData.baseSalary.currency || ''}`.trim();
        }
        if (jobData.description) {
          description = cheerio.load(jobData.description).text().trim();
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  });

  // Strategy 2: Meta tags & OpenGraph
  if (!title) {
    title = $('meta[property="og:title"]').attr('content') || $('title').text() || '';
    title = title.split('|')[0].split('-')[0].trim();
  }

  if (!company) {
    company = $('meta[property="og:site_name"]').attr('content') ||
              $('meta[name="author"]').attr('content') || '';
    if (!company) {
      const boardTitle = ($('meta[property="og:title"]').attr('content') || $('title').text() || '').trim();
      const atMatch = boardTitle.match(/\bat\s+([A-Z][A-Za-z0-9\s&.'-]{1,40})\.?$/);
      if (atMatch) company = atMatch[1].trim();
    }
    if (!company) {
      const logoAlt = $('a[class*="logo"] img').attr('alt') || $('img[class*="logo"]').attr('alt') || '';
      if (logoAlt) company = logoAlt.replace(/\s*logo\s*$/i, '').trim();
    }
    if (!company) {
      const host = new URL(url).hostname.replace('www.', '');
      company = host.split('.')[0].toUpperCase();
    }
  }

  if (!description) {
    const mainSelectors = [
      '[class*="job-description"]',
      '[class*="description"]',
      '#job-description',
      'main',
      'article',
      '[role="main"]',
      'section'
    ];

    for (const selector of mainSelectors) {
      const text = $(selector).text().trim();
      if (text && text.length > 200) {
        description = text.replace(/\s+/g, ' ');
        break;
      }
    }

    if (!description) {
      description = $('body').text().replace(/\s+/g, ' ').substring(0, 3000);
    }
  }

  title = title.replace(/(apply|hiring|job|careers)/gi, '').trim() || 'Software Engineer';

  return {
    title: title || 'Software Engineer',
    company: company || 'Tech Company',
    location: location || 'Remote / Flexible',
    salary: salary || 'Competitive Salary',
    description: description.substring(0, 4000) || 'Job description extracted from link.'
  };
}
