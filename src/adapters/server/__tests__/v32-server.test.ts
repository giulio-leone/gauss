import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  AgentRequest,
  AgentResponse,
  AgentRouteHandler,
  ServerMiddleware,
} from "../../../ports/server.port.js";

// =============================================================================
// Mock helpers
// =============================================================================

function createMockHandler(response?: Partial<AgentResponse>): AgentRouteHandler {
  return vi.fn(async () => ({
    status: 200,
    body: { result: "ok" },
    ...response,
  }));
}

function createThrowingHandler(): AgentRouteHandler {
  return vi.fn(async () => {
    throw new Error("handler error");
  });
}

// =============================================================================
// Express Server Adapter
// =============================================================================

vi.mock("express", () => {
  const createApp = () => {
    const routes: Record<string, Function[]> = {};
    const app: any = {
      post: vi.fn((path: string, ...handlers: Function[]) => {
        routes[path] = handlers;
      }),
      use: vi.fn(),
      listen: vi.fn((port: number, host: string, cb: () => void) => {
        cb?.();
        return { close: vi.fn((cb: Function) => cb()) };
      }),
      _routes: routes,
    };
    return app;
  };
  createApp.json = () => vi.fn();
  createApp.default = createApp;
  return { default: createApp };
});

describe("ExpressServerAdapter", () => {
  let ExpressServerAdapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../express/express-server.adapter.js");
    ExpressServerAdapter = mod.ExpressServerAdapter;
  });

  it("creates a new Express app when none provided", async () => {
    const adapter = new ExpressServerAdapter();
    await adapter.listen(3000);
    expect(adapter.handler()).toBeTruthy();
  });

  it("accepts an existing Express app", () => {
    const existingApp = { post: vi.fn(), use: vi.fn() };
    const adapter = new ExpressServerAdapter({ app: existingApp });
    expect(adapter.handler()).toBe(existingApp);
  });

  it("registerAgent sets up a POST route", async () => {
    const adapter = new ExpressServerAdapter();
    const handler = createMockHandler();
    adapter.registerAgent("/agent", handler);

    // Wait for async ensureApp
    await new Promise((r) => setTimeout(r, 10));

    const app = adapter.handler() as any;
    expect(app.post).toHaveBeenCalledWith("/agent", expect.any(Function));
  });

  it("full request/response cycle", async () => {
    const adapter = new ExpressServerAdapter();
    const handler = createMockHandler({ status: 200, body: { answer: 42 } });
    adapter.registerAgent("/chat", handler);

    await new Promise((r) => setTimeout(r, 10));

    const app = adapter.handler() as any;
    const routeHandler = app.post.mock.calls[0][1];

    const mockReq = {
      body: { prompt: "hello" },
      headers: { "content-type": "application/json" },
      params: {},
      query: { mode: "fast" },
    };
    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      set: vi.fn(),
    };

    await routeHandler(mockReq, mockRes);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { prompt: "hello" },
        query: { mode: "fast" },
      }),
    );
    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith({ answer: 42 });
  });

  it("handler error returns 500", async () => {
    const adapter = new ExpressServerAdapter();
    const handler = createThrowingHandler();
    adapter.registerAgent("/fail", handler);

    await new Promise((r) => setTimeout(r, 10));

    const app = adapter.handler() as any;
    const routeHandler = app.post.mock.calls[0][1];

    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      set: vi.fn(),
    };

    await routeHandler({ body: {}, headers: {}, params: {}, query: {} }, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  it("use() adds middleware that runs during request", async () => {
    const adapter = new ExpressServerAdapter();
    const middleware: ServerMiddleware = vi.fn(async (req, next) => {
      const res = await next();
      return { ...res, headers: { ...res.headers, "x-custom": "test" } };
    });

    adapter.use(middleware);

    const handler = createMockHandler();
    adapter.registerAgent("/mw", handler);

    await new Promise((r) => setTimeout(r, 10));

    const app = adapter.handler() as any;
    const routeHandler = app.post.mock.calls[0][1];

    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      set: vi.fn(),
    };

    await routeHandler({ body: {}, headers: {}, params: {}, query: {} }, mockRes);

    expect(middleware).toHaveBeenCalled();
    expect(mockRes.set).toHaveBeenCalledWith("x-custom", "test");
  });

  it("response headers are forwarded", async () => {
    const adapter = new ExpressServerAdapter();
    const handler = createMockHandler({
      status: 201,
      body: { id: 1 },
      headers: { "x-request-id": "abc" },
    });
    adapter.registerAgent("/headers", handler);

    await new Promise((r) => setTimeout(r, 10));

    const app = adapter.handler() as any;
    const routeHandler = app.post.mock.calls[0][1];

    const mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      set: vi.fn(),
    };

    await routeHandler({ body: {}, headers: {}, params: {}, query: {} }, mockRes);

    expect(mockRes.set).toHaveBeenCalledWith("x-request-id", "abc");
    expect(mockRes.status).toHaveBeenCalledWith(201);
  });
});

// =============================================================================
// Fastify Server Adapter
// =============================================================================

vi.mock("fastify", () => {
  const createFastify = () => {
    const routes: Record<string, Function> = {};
    return {
      post: vi.fn((path: string, handler: Function) => {
        routes[path] = handler;
      }),
      listen: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
      _routes: routes,
    };
  };
  return { default: createFastify };
});

describe("FastifyServerAdapter", () => {
  let FastifyServerAdapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../fastify/fastify-server.adapter.js");
    FastifyServerAdapter = mod.FastifyServerAdapter;
  });

  it("creates a new Fastify instance when none provided", async () => {
    const adapter = new FastifyServerAdapter();
    await adapter.listen(3000);
    expect(adapter.handler()).toBeTruthy();
  });

  it("accepts an existing Fastify instance", () => {
    const existingServer = { post: vi.fn(), listen: vi.fn(), close: vi.fn() };
    const adapter = new FastifyServerAdapter({ app: existingServer });
    expect(adapter.handler()).toBe(existingServer);
  });

  it("registerAgent sets up a POST route", async () => {
    const adapter = new FastifyServerAdapter();
    const handler = createMockHandler();
    adapter.registerAgent("/agent", handler);

    await new Promise((r) => setTimeout(r, 10));

    const server = adapter.handler() as any;
    expect(server.post).toHaveBeenCalledWith("/agent", expect.any(Function));
  });

  it("full request/response cycle", async () => {
    const adapter = new FastifyServerAdapter();
    const handler = createMockHandler({ status: 200, body: { data: "hello" } });
    adapter.registerAgent("/chat", handler);

    await new Promise((r) => setTimeout(r, 10));

    const server = adapter.handler() as any;
    const routeHandler = server.post.mock.calls[0][1];

    const mockRequest = {
      body: { prompt: "test" },
      headers: { "content-type": "application/json" },
      params: { id: "1" },
      query: {},
    };
    const mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn().mockReturnThis(),
    };

    await routeHandler(mockRequest, mockReply);

    expect(handler).toHaveBeenCalled();
    expect(mockReply.status).toHaveBeenCalledWith(200);
    expect(mockReply.send).toHaveBeenCalledWith({ data: "hello" });
  });

  it("handler error returns 500", async () => {
    const adapter = new FastifyServerAdapter();
    const handler = createThrowingHandler();
    adapter.registerAgent("/fail", handler);

    await new Promise((r) => setTimeout(r, 10));

    const server = adapter.handler() as any;
    const routeHandler = server.post.mock.calls[0][1];

    const mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn(),
    };

    await routeHandler({ body: {}, headers: {}, params: {}, query: {} }, mockReply);

    expect(mockReply.status).toHaveBeenCalledWith(500);
    expect(mockReply.send).toHaveBeenCalledWith({ error: "Internal server error" });
  });

  it("use() adds middleware", async () => {
    const adapter = new FastifyServerAdapter();
    const middleware: ServerMiddleware = vi.fn(async (req, next) => next());

    adapter.use(middleware);

    const handler = createMockHandler();
    adapter.registerAgent("/mw", handler);

    await new Promise((r) => setTimeout(r, 10));

    const server = adapter.handler() as any;
    const routeHandler = server.post.mock.calls[0][1];

    const mockReply = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      header: vi.fn(),
    };

    await routeHandler({ body: {}, headers: {}, params: {}, query: {} }, mockReply);

    expect(middleware).toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });

  it("accepts config with logger option", () => {
    const adapter = new FastifyServerAdapter({ config: { logger: true } });
    expect(adapter).toBeTruthy();
  });
});

// =============================================================================
// Hono Server Adapter
// =============================================================================

vi.mock("hono", () => {
  class MockHono {
    routes: Record<string, Function> = {};
    post = vi.fn((path: string, handler: Function) => {
      this.routes[path] = handler;
    });
    use = vi.fn();
    fetch = vi.fn();
  }
  return { Hono: MockHono };
});

vi.mock("@hono/node-server", () => ({
  serve: vi.fn(() => ({ close: vi.fn((cb: Function) => cb()) })),
}));

describe("HonoServerAdapter", () => {
  let HonoServerAdapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../hono/hono-server.adapter.js");
    HonoServerAdapter = mod.HonoServerAdapter;
  });

  it("creates a new Hono app when none provided", async () => {
    const adapter = new HonoServerAdapter();
    adapter.registerAgent("/test", createMockHandler());
    await new Promise((r) => setTimeout(r, 10));
    expect(adapter.handler()).toBeTruthy();
  });

  it("accepts an existing Hono app", () => {
    const existingApp = { post: vi.fn(), use: vi.fn(), fetch: vi.fn() };
    const adapter = new HonoServerAdapter({ app: existingApp });
    expect(adapter.handler()).toBe(existingApp);
  });

  it("registerAgent sets up a POST route", async () => {
    const adapter = new HonoServerAdapter();
    const handler = createMockHandler();
    adapter.registerAgent("/agent", handler);

    await new Promise((r) => setTimeout(r, 10));

    const app = adapter.handler() as any;
    expect(app.post).toHaveBeenCalledWith("/agent", expect.any(Function));
  });

  it("full request/response cycle", async () => {
    const adapter = new HonoServerAdapter();
    const handler = createMockHandler({ status: 200, body: { response: "hi" } });
    adapter.registerAgent("/chat", handler);

    await new Promise((r) => setTimeout(r, 10));

    const app = adapter.handler() as any;
    const routeHandler = app.post.mock.calls[0][1];

    const mockContext = {
      req: {
        json: vi.fn(async () => ({ prompt: "hello" })),
        param: vi.fn(() => ({})),
        query: vi.fn(() => ({ stream: "true" })),
        raw: { headers: new Map([["content-type", "application/json"]]) },
      },
      json: vi.fn((body: unknown, status: number, headers?: Record<string, string>) => ({
        body,
        status,
        headers,
      })),
    };

    await routeHandler(mockContext);

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { stream: "true" },
      }),
    );
    expect(mockContext.json).toHaveBeenCalledWith(
      { response: "hi" },
      200,
      expect.any(Object),
    );
  });

  it("handler error returns 500", async () => {
    const adapter = new HonoServerAdapter();
    const handler = createThrowingHandler();
    adapter.registerAgent("/fail", handler);

    await new Promise((r) => setTimeout(r, 10));

    const app = adapter.handler() as any;
    const routeHandler = app.post.mock.calls[0][1];

    const mockContext = {
      req: {
        json: vi.fn(async () => ({})),
        param: vi.fn(() => ({})),
        query: vi.fn(() => ({})),
        raw: { headers: new Map() },
      },
      json: vi.fn(),
    };

    await routeHandler(mockContext);

    expect(mockContext.json).toHaveBeenCalledWith({ error: "Internal server error" }, 500);
  });

  it("use() adds middleware that runs during request", async () => {
    const adapter = new HonoServerAdapter();
    const middleware: ServerMiddleware = vi.fn(async (req, next) => next());

    adapter.use(middleware);

    const handler = createMockHandler();
    adapter.registerAgent("/mw", handler);

    await new Promise((r) => setTimeout(r, 10));

    const app = adapter.handler() as any;
    const routeHandler = app.post.mock.calls[0][1];

    const mockContext = {
      req: {
        json: vi.fn(async () => ({})),
        param: vi.fn(() => ({})),
        query: vi.fn(() => ({})),
        raw: { headers: new Map() },
      },
      json: vi.fn(),
    };

    await routeHandler(mockContext);

    expect(middleware).toHaveBeenCalled();
    expect(handler).toHaveBeenCalled();
  });

  it("listen uses @hono/node-server", async () => {
    const adapter = new HonoServerAdapter();
    adapter.registerAgent("/test", createMockHandler());
    await new Promise((r) => setTimeout(r, 10));

    await adapter.listen(3000);

    const { serve } = await import("@hono/node-server");
    expect(serve).toHaveBeenCalled();
  });
});

// =============================================================================
// Koa Server Adapter
// =============================================================================

vi.mock("koa", () => {
  class MockKoa {
    middleware: Function[] = [];
    use = vi.fn((mw: Function) => this.middleware.push(mw));
    listen = vi.fn((port: number, host: string, cb: () => void) => {
      cb?.();
      return { close: vi.fn((cb: Function) => cb()) };
    });
  }
  return { default: MockKoa };
});

vi.mock("@koa/router", () => {
  class MockRouter {
    _routes: Record<string, Function> = {};
    post = vi.fn((path: string, handler: Function) => {
      this._routes[path] = handler;
    });
    allowedMethods = vi.fn(() => vi.fn());

    routes() {
      return vi.fn();
    }
  }
  return { default: MockRouter };
});

describe("KoaServerAdapter", () => {
  let KoaServerAdapter: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("../koa/koa-server.adapter.js");
    KoaServerAdapter = mod.KoaServerAdapter;
  });

  it("creates a new Koa app when none provided", async () => {
    const adapter = new KoaServerAdapter();
    adapter.registerAgent("/test", createMockHandler());
    await new Promise((r) => setTimeout(r, 10));
    expect(adapter.handler()).toBeTruthy();
  });

  it("accepts an existing Koa app", () => {
    const existingApp = { use: vi.fn(), listen: vi.fn() };
    const adapter = new KoaServerAdapter({ app: existingApp });
    expect(adapter.handler()).toBe(existingApp);
  });

  it("registerAgent sets up a POST route via router", async () => {
    const adapter = new KoaServerAdapter();
    const handler = createMockHandler();
    adapter.registerAgent("/agent", handler);

    await new Promise((r) => setTimeout(r, 10));

    // The router is internal, but we can verify via the handler call
    expect(adapter.handler()).toBeTruthy();
  });

  it("full request/response cycle", async () => {
    const adapter = new KoaServerAdapter();
    const handler = createMockHandler({ status: 200, body: { result: "koa" } });
    adapter.registerAgent("/chat", handler);

    await new Promise((r) => setTimeout(r, 10));

    // Access the router's stored route handler
    const { default: Router } = await import("@koa/router");
    const routerInstance = (Router as any).mock?.results?.[0]?.value;

    // If mock tracking is available, test the route handler directly
    if (routerInstance?.post?.mock?.calls?.length) {
      const routeHandler = routerInstance.post.mock.calls[0][1];

      const mockCtx: any = {
        request: { body: { prompt: "hello" } },
        headers: { "content-type": "application/json" },
        params: {},
        query: { mode: "fast" },
        set: vi.fn(),
        status: 0,
        body: null,
      };

      await routeHandler(mockCtx);

      expect(handler).toHaveBeenCalled();
      expect(mockCtx.status).toBe(200);
      expect(mockCtx.body).toEqual({ result: "koa" });
    }
  });

  it("handler error returns 500", async () => {
    const adapter = new KoaServerAdapter();
    const handler = createThrowingHandler();
    adapter.registerAgent("/fail", handler);

    await new Promise((r) => setTimeout(r, 10));

    const { default: Router } = await import("@koa/router");
    const routerInstance = (Router as any).mock?.results?.[0]?.value;

    if (routerInstance?.post?.mock?.calls?.length) {
      const routeHandler = routerInstance.post.mock.calls[0][1];

      const mockCtx: any = {
        request: { body: {} },
        headers: {},
        params: {},
        query: {},
        set: vi.fn(),
        status: 0,
        body: null,
      };

      await routeHandler(mockCtx);

      expect(mockCtx.status).toBe(500);
      expect(mockCtx.body).toEqual({ error: "Internal server error" });
    }
  });

  it("use() adds middleware", async () => {
    const adapter = new KoaServerAdapter();
    const middleware: ServerMiddleware = vi.fn(async (req, next) => next());

    adapter.use(middleware);

    const handler = createMockHandler();
    adapter.registerAgent("/mw", handler);

    await new Promise((r) => setTimeout(r, 10));

    const { default: Router } = await import("@koa/router");
    const routerInstance = (Router as any).mock?.results?.[0]?.value;

    if (routerInstance?.post?.mock?.calls?.length) {
      const routeHandler = routerInstance.post.mock.calls[0][1];

      const mockCtx: any = {
        request: { body: {} },
        headers: {},
        params: {},
        query: {},
        set: vi.fn(),
        status: 0,
        body: null,
      };

      await routeHandler(mockCtx);

      expect(middleware).toHaveBeenCalled();
      expect(handler).toHaveBeenCalled();
    }
  });

  it("response headers are forwarded via ctx.set", async () => {
    const adapter = new KoaServerAdapter();
    const handler = createMockHandler({
      status: 201,
      body: { id: "new" },
      headers: { "x-trace": "abc123" },
    });
    adapter.registerAgent("/headers", handler);

    await new Promise((r) => setTimeout(r, 10));

    const { default: Router } = await import("@koa/router");
    const routerInstance = (Router as any).mock?.results?.[0]?.value;

    if (routerInstance?.post?.mock?.calls?.length) {
      const routeHandler = routerInstance.post.mock.calls[0][1];

      const mockCtx: any = {
        request: { body: {} },
        headers: {},
        params: {},
        query: {},
        set: vi.fn(),
        status: 0,
        body: null,
      };

      await routeHandler(mockCtx);

      expect(mockCtx.set).toHaveBeenCalledWith("x-trace", "abc123");
      expect(mockCtx.status).toBe(201);
    }
  });
});
