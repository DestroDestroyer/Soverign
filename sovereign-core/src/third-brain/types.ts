export interface ThirdBrainConfig {
  /** Search provider: "duckduckgo" | "searxng" | "tavily" | "custom" */
  searchProvider: string;
  /** SearXNG instance URL or custom endpoint */
  searchEndpoint: string;
  /** Tavily API key or custom search API key */
  searchApiKey: string | null;
  /** Max results per search */
  maxResults: number;
  /** Auto-store fetched info into memory */
  autoStore: boolean;
  /** User-Agent header for HTTP requests */
  userAgent: string;
  /** Request timeout in ms */
  timeout: number;
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  content?: string;
}

export interface ScrapeResult {
  url: string;
  title: string;
  markdown: string;
  text: string;
  extractedAt: string;
}

export interface ThirdBrainServices {
  memoryOrchestrator: import("../vault/memory/orchestrator.ts").MemoryOrchestrator;
  graphPipeline: import("../vault/graph/pipeline.ts").GraphPipeline;
}
