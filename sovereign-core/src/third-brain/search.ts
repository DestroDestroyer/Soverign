import type { ThirdBrainConfig, WebSearchResult } from "./types.ts";

const DEFAULT_CONFIG: ThirdBrainConfig = {
  searchProvider: "duckduckgo",
  searchEndpoint: "http://localhost:8888",
  searchApiKey: null,
  maxResults: 5,
  autoStore: true,
  userAgent: "SovereignAI/1.0 (knowledge-graph-assistant; +https://sovereign.ai)",
  timeout: 10000,
};

export class WebSearch {
  private config: ThirdBrainConfig;

  constructor(config?: Partial<ThirdBrainConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  updateConfig(config: Partial<ThirdBrainConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): ThirdBrainConfig {
    return { ...this.config };
  }

  async search(query: string, maxResults?: number): Promise<WebSearchResult[]> {
    const limit = maxResults ?? this.config.maxResults;
    switch (this.config.searchProvider) {
      case "searxng":
        return this.searchSearXNG(query, limit);
      case "tavily":
        return this.searchTavily(query, limit);
      case "duckduckgo":
      default:
        return this.searchDuckDuckGo(query, limit);
    }
  }

  private async searchDuckDuckGo(query: string, max: number): Promise<WebSearchResult[]> {
    try {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const resp = await fetch(url, {
        headers: { "User-Agent": this.config.userAgent },
        signal: AbortSignal.timeout(this.config.timeout),
      });
      const html = await resp.text();
      const results: WebSearchResult[] = [];
      const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null && results.length < max) {
        results.push({
          title: this.stripHtml(m[2] ?? ""),
          url: m[1] ?? "",
          snippet: this.stripHtml(m[3] ?? ""),
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  private async searchSearXNG(query: string, max: number): Promise<WebSearchResult[]> {
    try {
      const url = `${this.config.searchEndpoint}/search?q=${encodeURIComponent(query)}&format=json`;
      const resp = await fetch(url, {
        headers: { "User-Agent": this.config.userAgent },
        signal: AbortSignal.timeout(this.config.timeout),
      });
      if (!resp.ok) return [];
      const data = await resp.json() as { results?: Array<{ title: string; url: string; content: string }> };
      return (data.results ?? []).slice(0, max).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.content ?? "",
      }));
    } catch {
      return [];
    }
  }

  private async searchTavily(query: string, max: number): Promise<WebSearchResult[]> {
    if (!this.config.searchApiKey) return [];
    try {
      const resp = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.config.searchApiKey}` },
        body: JSON.stringify({ query, max_results: max, include_answer: false }),
        signal: AbortSignal.timeout(this.config.timeout),
      });
      if (!resp.ok) return [];
      const data = await resp.json() as { results?: Array<{ title: string; url: string; content: string }> };
      return (data.results ?? []).slice(0, max).map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        snippet: r.content ?? "",
      }));
    } catch {
      return [];
    }
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
