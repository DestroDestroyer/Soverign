import type { ScrapeResult } from "./types.ts";

const DEFAULT_TIMEOUT = 15000;
const USER_AGENT = "SovereignAI/1.0 (knowledge-graph-assistant; +https://sovereign.ai)";

export class WebScraper {
  private timeout: number;
  private userAgent: string;

  constructor(timeout?: number, userAgent?: string) {
    this.timeout = timeout ?? DEFAULT_TIMEOUT;
    this.userAgent = userAgent ?? USER_AGENT;
  }

  async scrape(url: string): Promise<ScrapeResult | null> {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(this.timeout),
      });
      if (!resp.ok) return null;
      const html = await resp.text();
      const title = this.extractTitle(html);
      const markdown = this.htmlToMarkdown(html);
      return {
        url,
        title,
        markdown,
        text: this.stripHtml(html).replace(/\s+/g, " ").trim().slice(0, 5000),
        extractedAt: new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  private extractTitle(html: string): string {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    return m ? this.stripHtml(m[1]) : "Untitled";
  }

  private htmlToMarkdown(html: string): string {
    let md = html;
    const main = md.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
    const article = md.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    const body = md.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (main) md = main[1];
    else if (article) md = article[1];
    else if (body) md = body[1];

    md = md.replace(/<script[\s\S]*?<\/script>/gi, "");
    md = md.replace(/<style[\s\S]*?<\/style>/gi, "");
    md = md.replace(/<nav[\s\S]*?<\/nav>/gi, "");
    md = md.replace(/<header[\s\S]*?<\/header>/gi, "");
    md = md.replace(/<footer[\s\S]*?<\/footer>/gi, "");
    md = md.replace(/<aside[\s\S]*?<\/aside>/gi, "");

    md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n");
    md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n");
    md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n\n");
    md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "#### $1\n\n");
    md = md.replace(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
    md = md.replace(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi, "![$2]($1)");
    md = md.replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, "![]($1)");
    md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
    md = md.replace(/<ul[^>]*>([\s\S]*?)<\/ul>/gi, "$1\n");
    md = md.replace(/<ol[^>]*>([\s\S]*?)<\/ol>/gi, "$1\n");
    md = md.replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, "```\n$1\n```\n");
    md = md.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
    md = md.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");
    md = md.replace(/<br\s*\/?>/gi, "\n");
    md = md.replace(/<hr\s*\/?>/gi, "---\n");
    md = md.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
    md = md.replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**");
    md = md.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");
    md = md.replace(/<i[^>]*>([\s\S]*?)<\/i>/gi, "*$1*");
    md = this.stripHtml(md);
    md = md.replace(/\n{4,}/g, "\n\n\n");
    return md.trim();
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, "/")
      .replace(/\s+/g, " ")
      .trim();
  }
}
