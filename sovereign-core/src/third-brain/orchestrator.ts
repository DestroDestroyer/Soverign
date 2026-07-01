import type { MemoryOrchestrator } from "../vault/memory/orchestrator.ts";
import type { GraphPipeline } from "../vault/graph/pipeline.ts";
import { WebSearch } from "./search.ts";
import { WebScraper } from "./scraper.ts";
import type { ThirdBrainConfig, WebSearchResult, ScrapeResult } from "./types.ts";

type LogFn = (msg: string) => void;

export class ThirdBrain {
  private config: ThirdBrainConfig;
  private memoryOrchestrator: MemoryOrchestrator | null;
  private graphPipeline: GraphPipeline | null;
  private webSearch: WebSearch;
  private webScraper: WebScraper;
  private log: LogFn;
  private started = false;

  constructor(
    services?: { memoryOrchestrator?: MemoryOrchestrator; graphPipeline?: GraphPipeline },
    config?: Partial<ThirdBrainConfig>,
    logFn?: LogFn,
  ) {
    this.memoryOrchestrator = services?.memoryOrchestrator ?? null;
    this.graphPipeline = services?.graphPipeline ?? null;
    this.config = {
      searchProvider: "duckduckgo",
      searchEndpoint: "http://localhost:8888",
      searchApiKey: null,
      maxResults: 5,
      autoStore: true,
      userAgent: "SovereignAI/1.0 (knowledge-graph-assistant; +https://sovereign.ai)",
      timeout: 10000,
      ...config,
    };
    this.webSearch = new WebSearch(this.config);
    this.webScraper = new WebScraper(this.config.timeout + 5000);
    this.log = logFn ?? console.log;
  }

  setMemoryRefs(memoryOrchestrator: MemoryOrchestrator, graphPipeline: GraphPipeline) {
    this.memoryOrchestrator = memoryOrchestrator;
    this.graphPipeline = graphPipeline;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.log("[ThirdBrain] Starting web intelligence...");
    this.started = true;
    this.log("[ThirdBrain] Web search + scrape ready");
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;
    this.log("[ThirdBrain] Stopped");
  }

  health(): { status: string; provider: string } {
    return { status: this.started ? "healthy" : "unhealthy", provider: this.config.searchProvider };
  }

  // ── Web Search ────────────────────────────────────────────────

  async search(query: string, maxResults?: number): Promise<WebSearchResult[]> {
    const results = await this.webSearch.search(query, maxResults);
    if (this.config.autoStore && this.memoryOrchestrator && results.length > 0) {
      await this.storeSearchResults(query, results);
    }
    return results;
  }

  async searchAndSummarize(query: string): Promise<string> {
    const results = await this.search(query, 3);
    if (results.length === 0) return "No results found.";
    const parts = results.map(
      (r, i) => `${i + 1}. **${r.title}**\n   ${r.snippet}\n   ${r.url}`,
    );
    return `## Web Search: ${query}\n\n${parts.join("\n\n")}`;
  }

  // ── Web Scrape ────────────────────────────────────────────────

  async scrape(url: string): Promise<ScrapeResult | null> {
    const result = await this.webScraper.scrape(url);
    if (result && this.config.autoStore && this.memoryOrchestrator) {
      await this.storeScrapeResult(result);
    }
    return result;
  }

  async scrapeAndSummarize(url: string): Promise<string> {
    const result = await this.scrape(url);
    if (!result) return "Failed to scrape URL.";
    return `## ${result.title}\n\n${result.markdown.slice(0, 4000)}\n\n---\nSource: ${url}`;
  }

  // ── Batch operations ──────────────────────────────────────────

  async searchThenScrape(query: string, urlsToScrape?: number): Promise<{
    searchResults: WebSearchResult[];
    scrapedPages: ScrapeResult[];
  }> {
    const searchResults = await this.search(query, 5);
    const limit = urlsToScrape ?? Math.min(searchResults.length, 3);
    const scrapedPages: ScrapeResult[] = [];
    for (const r of searchResults.slice(0, limit)) {
      const s = await this.scrape(r.url);
      if (s) scrapedPages.push(s);
    }
    return { searchResults, scrapedPages };
  }

  // ── Config ────────────────────────────────────────────────────

  updateConfig(config: Partial<ThirdBrainConfig>) {
    this.config = { ...this.config, ...config };
    this.webSearch.updateConfig(this.config);
  }

  getConfig(): ThirdBrainConfig {
    return { ...this.config };
  }

  // ── Storage ───────────────────────────────────────────────────

  private async storeSearchResults(query: string, results: WebSearchResult[]) {
    if (!this.memoryOrchestrator) return;
    for (const r of results) {
      await this.memoryOrchestrator.store(
        `[Web Search] ${r.title}\n${r.snippet}\nSource: ${r.url}`,
        "chat",
        "normal",
        { category: "web-search", query, url: r.url, source: this.config.searchProvider },
      );
    }
  }

  private async storeScrapeResult(result: ScrapeResult) {
    if (!this.memoryOrchestrator) return;
    await this.memoryOrchestrator.store(
      `[Web Page] ${result.title}\n${result.text.slice(0, 2000)}\nSource: ${result.url}`,
      "document",
      "normal",
      { category: "web-scrape", url: result.url, title: result.title },
    );
    if (this.graphPipeline) {
      await this.graphPipeline.processText(
        `${result.title} is a web page from ${result.url}`,
        "web",
      );
    }
  }
}
