// =============================================================================
// A2A Handler — JSON-RPC request router for tasks + discovery
// =============================================================================

export interface A2AJsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
}

export interface A2AJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface A2AJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: A2AJsonRpcError;
}

export type A2ATaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface A2ATask {
  id: string;
  status: A2ATaskStatus;
  prompt: string;
  output?: string;
  error?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface A2ATasksSendParams {
  prompt: string;
  taskId?: string;
  metadata?: Record<string, unknown>;
}

export interface A2ARequestHandlers {
  sendTask(params: A2ATasksSendParams): Promise<A2ATask>;
  getTask(taskId: string): Promise<A2ATask | null>;
  listTasks?(): Promise<A2ATask[]>;
  cancelTask?(taskId: string): Promise<A2ATask | null>;
  getAgentCard?(): Promise<unknown>;
}

function createError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown,
): A2AJsonRpcResponse {
  const error: A2AJsonRpcError = data === undefined
    ? { code, message }
    : { code, message, data };

  return {
    jsonrpc: "2.0",
    id,
    error,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function createA2AJsonRpcHandler(
  handlers: A2ARequestHandlers,
): (request: A2AJsonRpcRequest) => Promise<A2AJsonRpcResponse> {
  return async (request: A2AJsonRpcRequest): Promise<A2AJsonRpcResponse> => {
    const id = request.id ?? null;

    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      return createError(id, -32600, "Invalid Request");
    }

    try {
      switch (request.method) {
        case "tasks/send": {
          const params = asRecord(request.params);
          if (!params) {
            return createError(id, -32602, "Invalid params: expected object");
          }

          const prompt = asString(params.prompt);
          if (!prompt) {
            return createError(id, -32602, "Invalid params: prompt is required");
          }

          const parsedTaskId = params.taskId === undefined ? undefined : asString(params.taskId);
          if (params.taskId !== undefined && !parsedTaskId) {
            return createError(id, -32602, "Invalid params: taskId must be a non-empty string");
          }
          const taskId = parsedTaskId ?? undefined;

          const metadata = params.metadata === undefined ? undefined : asRecord(params.metadata);
          if (params.metadata !== undefined && !metadata) {
            return createError(id, -32602, "Invalid params: metadata must be an object");
          }

          const task = await handlers.sendTask({ prompt, taskId, metadata: metadata ?? undefined });
          return {
            jsonrpc: "2.0",
            id,
            result: task,
          };
        }

        case "tasks/get": {
          const params = asRecord(request.params);
          if (!params) {
            return createError(id, -32602, "Invalid params: expected object");
          }

          const taskId = asString(params.taskId);
          if (!taskId) {
            return createError(id, -32602, "Invalid params: taskId is required");
          }

          const task = await handlers.getTask(taskId);
          if (!task) {
            return createError(id, -32004, "Task not found", { taskId });
          }

          return {
            jsonrpc: "2.0",
            id,
            result: task,
          };
        }

        case "tasks/list": {
          if (!handlers.listTasks) {
            return createError(id, -32601, "Method not found: tasks/list");
          }

          const tasks = await handlers.listTasks();
          return {
            jsonrpc: "2.0",
            id,
            result: { tasks },
          };
        }

        case "tasks/cancel": {
          if (!handlers.cancelTask) {
            return createError(id, -32601, "Method not found: tasks/cancel");
          }

          const params = asRecord(request.params);
          if (!params) {
            return createError(id, -32602, "Invalid params: expected object");
          }

          const taskId = asString(params.taskId);
          if (!taskId) {
            return createError(id, -32602, "Invalid params: taskId is required");
          }

          const task = await handlers.cancelTask(taskId);
          if (!task) {
            return createError(id, -32004, "Task not found", { taskId });
          }

          return {
            jsonrpc: "2.0",
            id,
            result: task,
          };
        }

        case "agent/card": {
          if (!handlers.getAgentCard) {
            return createError(id, -32601, "Method not found: agent/card");
          }

          const card = await handlers.getAgentCard();
          return {
            jsonrpc: "2.0",
            id,
            result: card,
          };
        }

        case "health": {
          return {
            jsonrpc: "2.0",
            id,
            result: { ok: true },
          };
        }

        default:
          return createError(id, -32601, `Method not found: ${request.method}`);
      }
    } catch (error) {
      return createError(
        id,
        -32603,
        error instanceof Error ? error.message : "Internal error",
      );
    }
  };
}

export function createA2AHttpHandler(
  jsonRpcHandler: (request: A2AJsonRpcRequest) => Promise<A2AJsonRpcResponse>,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return new Response(null, { status: 405 });
    }

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      return new Response(
        JSON.stringify(createError(null, -32700, "Parse error")),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (Array.isArray(parsed)) {
      return new Response(
        JSON.stringify(createError(null, -32600, "Batch requests are not supported")),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const requestObject = asRecord(parsed);
    if (!requestObject) {
      return new Response(
        JSON.stringify(createError(null, -32600, "Invalid Request")),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const normalizedRequest: A2AJsonRpcRequest = {
      jsonrpc: requestObject.jsonrpc as "2.0",
      id: (requestObject.id as string | number | null | undefined),
      method: requestObject.method as string,
      params: requestObject.params,
    };

    if (normalizedRequest.id === undefined) {
      await jsonRpcHandler({ ...normalizedRequest, id: null });
      return new Response(null, { status: 202 });
    }

    const response = await jsonRpcHandler(normalizedRequest);
    return new Response(
      JSON.stringify(response),
      {
        status: response.error ? 400 : 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
}
