declare namespace chrome {
  namespace storage {
    interface StorageChange {
      newValue?: unknown;
      oldValue?: unknown;
    }

    type StorageAreaSync = {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      get(callback?: (items: Record<string, unknown>) => void): void;
      get(keys: null, callback: (items: Record<string, unknown>) => void): void;
      get(keys: string | string[], callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    };

    type StorageAreaLocal = {
      get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
      get(callback?: (items: Record<string, unknown>) => void): void;
      get(keys: null, callback: (items: Record<string, unknown>) => void): void;
      get(keys: string | string[], callback: (items: Record<string, unknown>) => void): void;
      set(items: Record<string, unknown>): Promise<void>;
      remove(keys: string | string[]): Promise<void>;
      clear(): Promise<void>;
    };

    const sync: StorageAreaSync;
    const local: StorageAreaLocal;

    const onChanged: {
      addListener(
        callback: (
          changes: Record<string, StorageChange>,
          area: string
        ) => void
      ): void;
      removeListener(
        callback: (
          changes: Record<string, StorageChange>,
          area: string
        ) => void
      ): void;
    };
  }

  namespace action {
    function setBadgeText(details: { text: string }): Promise<void>;
    function setBadgeBackgroundColor(details: { color: string | [number, number, number, number] }): Promise<void>;
    function setTitle(details: { title: string }): Promise<void>;
  }

  namespace notifications {
    function create(
      notificationId: string,
      options: {
        type: 'basic' | 'list' | 'image' | 'progress';
        iconUrl?: string;
        title: string;
        message: string;
        priority?: number;
        buttons?: Array<{ title: string }>;
        requireInteraction?: boolean;
      }
    ): Promise<string>;

    const onClicked: {
      addListener(callback: (notificationId: string) => void): void;
    };
  }

  namespace alarms {
    interface Alarm {
      name: string;
      periodInMinutes?: number;
      scheduledTime?: number;
    }

    function create(name: string, alarmInfo: { when?: number; delayInMinutes?: number; periodInMinutes?: number }): Promise<void>;
    function clear(name: string): Promise<void>;
    function get(name: string): Promise<Alarm | undefined>;

    const onAlarm: {
      addListener(callback: (alarm: Alarm) => void): void;
      removeListener(callback: (alarm: Alarm) => void): void;
    };
  }

  namespace runtime {
    interface Port {
      name: string;
      postMessage(message: unknown): void;
      disconnect(): void;
      onDisconnect: {
        addListener(callback: (port: Port) => void): void;
      };
    }

    interface Manifest {
      version: string;
    }

    function getManifest(): Manifest;

    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };

    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => boolean | void
      ): void;
      removeListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => void
      ): void;
    };

    const onConnect: {
      addListener(callback: (port: Port) => void): void;
    };

    function sendMessage<T = unknown, R = unknown>(message: T): Promise<R>;

    function connect(extensionIdOrInfo?: string | { name?: string }, connectInfo?: { name?: string }): Port;

    function openOptionsPage(): void;

    function getURL(path: string): string;
  }

  namespace tabs {
    function create(createProperties: { url: string }): void;
  }
}
