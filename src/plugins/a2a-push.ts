// =============================================================================
// A2A Push Notifications — Webhook-based Push Notifications
// =============================================================================

import type { A2ATaskEvent } from "./a2a-handler.js";

export interface PushNotificationConfig {
  url: string;
  headers?: Record<string, string>;
  events?: A2ATaskEvent['type'][];
}

export class A2APushNotifier {
  private readonly subscriptions = new Map<string, PushNotificationConfig[]>();
  private readonly fetchImpl: typeof fetch;

  constructor(fetchImpl: typeof fetch = globalThis.fetch) {
    if (!fetchImpl) {
      throw new Error("A2APushNotifier requires a fetch implementation");
    }
    this.fetchImpl = fetchImpl;
  }

  subscribe(taskId: string, config: PushNotificationConfig): void {
    const existing = this.subscriptions.get(taskId) ?? [];
    existing.push(config);
    this.subscriptions.set(taskId, existing);
  }

  unsubscribe(taskId: string, url: string): void {
    const existing = this.subscriptions.get(taskId) ?? [];
    const filtered = existing.filter(config => config.url !== url);
    
    if (filtered.length === 0) {
      this.subscriptions.delete(taskId);
    } else {
      this.subscriptions.set(taskId, filtered);
    }
  }

  async notify(event: A2ATaskEvent): Promise<void> {
    const configs = this.subscriptions.get(event.taskId) ?? [];
    
    const promises = configs.map(async (config) => {
      // Skip if this event type is not in the config's event filter
      if (config.events && !config.events.includes(event.type)) {
        return;
      }

      try {
        await this.fetchImpl(config.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...config.headers
          },
          body: JSON.stringify(event)
        });
      } catch (error) {
        // Log but don't throw - failed webhooks shouldn't break the main flow
        console.warn(`Push notification failed for ${config.url}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  cleanup(taskId: string): void {
    this.subscriptions.delete(taskId);
  }
}