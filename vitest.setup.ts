import { beforeEach, vi } from "vitest";

// Provide a default mock implementation for createKintoneClient
// that returns a successful client. Individual tests can override
// this with mockImplementation() to simulate failures.
beforeEach(async () => {
  try {
    const mod = await import("./src/kintone/client.js");
    if (vi.isMockFunction(mod.createKintoneClient)) {
      mod.createKintoneClient.mockImplementation(
        () =>
          ({
            app: {
              getApps: vi.fn().mockResolvedValue({ apps: [] }),
            },
          }) as ReturnType<typeof mod.createKintoneClient>,
      );
    }
  } catch {
    // Module not mocked in this test file — nothing to do
  }
});
