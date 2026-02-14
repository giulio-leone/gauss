import { describe, expect, it, vi, beforeEach } from "vitest";
import { OneCrawlPlugin } from "../onecrawl.plugin.js";

// Mock crawler with all required methods
const mockCrawler = {
  crawl: vi.fn(),
  search: vi.fn(),
  batchCrawl: vi.fn(),
  close: vi.fn(),
};

describe("OneCrawlPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("tools", () => {
    it("should have scrape, search, and batch tools", () => {
      const plugin = new OneCrawlPlugin({ crawler: mockCrawler });
      const tools = plugin.tools;
      
      expect(tools).toHaveProperty("scrape");
      expect(tools).toHaveProperty("search");
      expect(tools).toHaveProperty("batch");
    });
  });

  describe("scrape tool", () => {
    it("should call crawl and return content", async () => {
      mockCrawler.crawl.mockResolvedValue({ content: "Hello World", text: "" });
      const plugin = new OneCrawlPlugin({ crawler: mockCrawler });
      
      const result = await (plugin.tools.scrape as any).execute({ url: "https://test.com" });
      
      expect(mockCrawler.crawl).toHaveBeenCalledWith("https://test.com");
      expect(result).toBe("Hello World");
    });

    it("should handle string responses", async () => {
      mockCrawler.crawl.mockResolvedValue("Direct string content");
      const plugin = new OneCrawlPlugin({ crawler: mockCrawler });
      
      const result = await (plugin.tools.scrape as any).execute({ url: "https://test.com" });
      
      expect(result).toBe("Direct string content");
    });

    it("should truncate content when maxContentLength is set", async () => {
      mockCrawler.crawl.mockResolvedValue({ content: "This is a very long content that should be truncated" });
      const plugin = new OneCrawlPlugin({ 
        crawler: mockCrawler,
        maxContentLength: 20 
      });
      
      const result = await (plugin.tools.scrape as any).execute({ url: "https://test.com" });
      
      expect(result).toBe("This is a very long \n...[truncated]");
    });

    it("should use text field as fallback", async () => {
      mockCrawler.crawl.mockResolvedValue({ text: "Text content" });
      const plugin = new OneCrawlPlugin({ crawler: mockCrawler });
      
      const result = await (plugin.tools.scrape as any).execute({ url: "https://test.com" });
      
      expect(result).toBe("Text content");
    });
  });

  describe("search tool", () => {
    it("should return formatted search results", async () => {
      mockCrawler.search.mockResolvedValue([
        { title: "Result 1", url: "https://example.com", snippet: "snip" },
        { title: "Result 2", link: "https://example2.com", description: "desc" },
      ]);
      const plugin = new OneCrawlPlugin({ crawler: mockCrawler });
      
      const result = await (plugin.tools.search as any).execute({ 
        query: "test query", 
        limit: 5 
      });
      
      expect(mockCrawler.search).toHaveBeenCalledWith("test query", { limit: 5 });
      expect(result).toEqual([
        { title: "Result 1", url: "https://example.com", snippet: "snip" },
        { title: "Result 2", url: "https://example2.com", snippet: "desc" },
      ]);
    });

    it("should return results as-is if not an array", async () => {
      mockCrawler.search.mockResolvedValue("Search error");
      const plugin = new OneCrawlPlugin({ crawler: mockCrawler });
      
      const result = await (plugin.tools.search as any).execute({ query: "test" });
      
      expect(result).toBe("Search error");
    });
  });

  describe("batch tool", () => {
    it("should call batchCrawl when available", async () => {
      mockCrawler.batchCrawl.mockResolvedValue([
        { content: "Page 1" },
        { content: "Page 2" },
      ]);
      const plugin = new OneCrawlPlugin({ crawler: mockCrawler });
      
      const result = await (plugin.tools.batch as any).execute({ 
        urls: ["https://test1.com", "https://test2.com"] 
      });
      
      expect(mockCrawler.batchCrawl).toHaveBeenCalledWith([
        "https://test1.com", 
        "https://test2.com"
      ]);
      expect(result).toEqual([
        { url: "https://test1.com", content: "Page 1" },
        { url: "https://test2.com", content: "Page 2" },
      ]);
    });

    it("should handle text field in batch results", async () => {
      mockCrawler.batchCrawl.mockResolvedValue([
        { text: "Page 1 text" },
        "Direct string",
      ]);
      const plugin = new OneCrawlPlugin({ crawler: mockCrawler });
      
      const result = await (plugin.tools.batch as any).execute({ 
        urls: ["https://test1.com", "https://test2.com"] 
      });
      
      expect(result).toEqual([
        { url: "https://test1.com", content: "Page 1 text" },
        { url: "https://test2.com", content: "Direct string" },
      ]);
    });

    it("should fallback to parallel crawl when batchCrawl not available", async () => {
      const crawlerWithoutBatch = {
        ...mockCrawler,
        batchCrawl: undefined,
      };
      mockCrawler.crawl
        .mockResolvedValueOnce({ content: "Page 1" })
        .mockResolvedValueOnce({ content: "Page 2" });
      
      const plugin = new OneCrawlPlugin({ crawler: crawlerWithoutBatch });
      
      const result = await (plugin.tools.batch as any).execute({ 
        urls: ["https://test1.com", "https://test2.com"] 
      });
      
      expect(mockCrawler.crawl).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        { url: "https://test1.com", content: "Page 1" },
        { url: "https://test2.com", content: "Page 2" },
      ]);
    });

    it("should handle crawl errors in parallel mode", async () => {
      const crawlerWithoutBatch = {
        ...mockCrawler,
        batchCrawl: undefined,
      };
      mockCrawler.crawl
        .mockResolvedValueOnce({ content: "Page 1" })
        .mockRejectedValueOnce(new Error("Network error"));
      
      const plugin = new OneCrawlPlugin({ crawler: crawlerWithoutBatch });
      
      const result = await (plugin.tools.batch as any).execute({ 
        urls: ["https://test1.com", "https://test2.com"] 
      });
      
      expect(result).toEqual([
        { url: "https://test1.com", content: "Page 1" },
        { url: "https://test2.com", error: "Error: Network error" },
      ]);
    });
  });

  describe("dispose", () => {
    it("should call close on crawler", async () => {
      const plugin = new OneCrawlPlugin({ crawler: mockCrawler });
      
      // Need to initialize crawler first by using it
      await (plugin.tools.scrape as any).execute({ url: "https://test.com" });
      
      await plugin.dispose();
      
      expect(mockCrawler.close).toHaveBeenCalled();
    });

    it("should handle missing close method gracefully", async () => {
      const crawlerWithoutClose = {
        ...mockCrawler,
        close: undefined,
      };
      const plugin = new OneCrawlPlugin({ crawler: crawlerWithoutClose });
      
      await expect(plugin.dispose()).resolves.not.toThrow();
    });
  });
});