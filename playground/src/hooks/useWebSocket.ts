import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseWebSocketOptions {
  url: string;
  autoConnect?: boolean;
  reconnectMs?: number;
  maxReconnectAttempts?: number;
}

export interface UseWebSocketReturn {
  connected: boolean;
  lastMessage: unknown | null;
  reconnectCount: number;
  send: (data: unknown) => void;
  connect: () => void;
  disconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const { url, autoConnect = true, reconnectMs = 3000, maxReconnectAttempts = 10 } = options;
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<unknown | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        attemptRef.current = 0;
        setReconnectCount(0);
      };

      ws.onmessage = (event) => {
        try {
          setLastMessage(JSON.parse(event.data));
        } catch {
          setLastMessage(event.data);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (reconnectMs > 0 && attemptRef.current < maxReconnectAttempts) {
          attemptRef.current += 1;
          setReconnectCount(attemptRef.current);
          const delay = Math.min(reconnectMs * Math.pow(1.5, attemptRef.current - 1), 30000);
          reconnectTimer.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => ws.close();
    } catch {/* ignore */}
  }, [url, reconnectMs, maxReconnectAttempts]);

  const disconnect = useCallback(() => {
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    attemptRef.current = maxReconnectAttempts; // prevent reconnect
    wsRef.current?.close();
    wsRef.current = null;
    setConnected(false);
  }, [maxReconnectAttempts]);

  const send = useCallback((data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  useEffect(() => {
    if (autoConnect) connect();
    return () => disconnect();
  }, [autoConnect, connect, disconnect]);

  return { connected, lastMessage, reconnectCount, send, connect, disconnect };
}
