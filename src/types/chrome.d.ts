declare namespace chrome {
  namespace storage {
    namespace sync {
      function get(keys: string[]): Promise<Record<string, unknown>>;
      function set(items: Record<string, unknown>): Promise<void>;
    }
  }

  namespace runtime {
    const onInstalled: {
      addListener(callback: () => void): void;
    };

    const onMessage: {
      addListener(
        callback: (
          message: unknown,
          sender: unknown,
          sendResponse: (response?: unknown) => void
        ) => boolean | void
      ): void;
    };

    function sendMessage<T = unknown, R = unknown>(message: T): Promise<R>;
  }
}
