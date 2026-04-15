// Chrome Extension API 类型声明
declare namespace chrome {
  export namespace runtime {
    export const onInstalled: {
      addListener(callback: () => void): void;
    };
    export const onStartup: {
      addListener(callback: () => void): void;
    };
    export const onMessage: {
      addListener<T = unknown>(
        callback: (message: T, sender: unknown, sendResponse: (response?: unknown) => void) => boolean | void
      ): void;
      removeListener<T = unknown>(callback: (message: T) => void): void;
    };
    export function sendMessage(message: unknown): void;
    export function openOptionsPage(): void;
  }

  export namespace storage {
    export namespace sync {
      export function get(keys: string | string[] | null): Promise<Record<string, unknown>>;
      export function set(items: Record<string, unknown>): Promise<void>;
      export function clear(): Promise<void>;
    }
  }

  export namespace alarms {
    export function create(name: string, options: { periodInMinutes: number }): void;
    export function clear(name: string): Promise<boolean>;
    export const onAlarm: {
      addListener(callback: (alarm: { name: string }) => void): void;
    };
  }

  export namespace extension {
    export function getViews(filter?: { type?: string }): Window[];
  }
}

declare const chrome: typeof chrome;
