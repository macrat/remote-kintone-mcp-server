import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ClientMetadata,
  clearStore,
  get,
  register,
  validate,
} from "./clients.js";

const validMetadata: ClientMetadata = {
  redirect_uris: ["http://localhost:3000/callback"],
  client_name: "test-client",
};

describe("OAuth client store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearStore();
  });

  describe("bounded registration (issue #6)", () => {
    it("should evict the oldest client when at max capacity", () => {
      const maxClients = 1000;
      const firstClient = register(validMetadata);

      for (let i = 1; i < maxClients; i++) {
        register(validMetadata);
      }

      // Store is now full. Registering one more should evict the oldest.
      const newClient = register(validMetadata);
      expect(newClient.client_id).toBeDefined();

      // The first client should have been evicted.
      expect(get(firstClient.client_id)).toBeUndefined();
    });

    it("should not allow more than a reasonable number of clients to exist in the store", () => {
      const registeredIds: string[] = [];
      for (let i = 0; i < 1500; i++) {
        const client = register(validMetadata);
        registeredIds.push(client.client_id);
      }

      // Oldest entries should have been evicted to keep the store bounded.
      const allPresent = registeredIds.every((id) => get(id) !== undefined);
      expect(allPresent).toBe(false);
    });

    it("should purge expired clients before evicting when at max capacity", () => {
      const baseTime = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(baseTime);

      // Fill the store to capacity with clients that will expire.
      const maxClients = 1000;
      for (let i = 0; i < maxClients; i++) {
        register(validMetadata);
      }

      // Advance time so all existing clients are expired.
      const ttl = 24 * 60 * 60 * 1000;
      vi.spyOn(Date, "now").mockReturnValue(baseTime + ttl);

      // Registration should succeed by purging expired clients, not evicting.
      const newClient = register(validMetadata);
      expect(newClient.client_id).toBeDefined();
      expect(get(newClient.client_id)).toBeDefined();
    });
  });

  describe("TTL / expiry (issue #6)", () => {
    it("should expire clients after 24 hours", () => {
      const client = register(validMetadata);

      const futureTime = Date.now() + 24 * 60 * 60 * 1000;
      vi.spyOn(Date, "now").mockReturnValue(futureTime);

      expect(get(client.client_id)).toBeUndefined();
    });

    it("should keep clients alive just before TTL expires", () => {
      const baseTime = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(baseTime);

      const client = register(validMetadata);

      const ttl = 24 * 60 * 60 * 1000;
      // At TTL - 1ms the client should still be valid.
      vi.spyOn(Date, "now").mockReturnValue(baseTime + ttl - 1);

      expect(get(client.client_id)).toBeDefined();
      expect(validate(client.client_id, client.client_secret)).toBe(true);
    });

    it("should not validate an expired client's credentials", () => {
      const client = register(validMetadata);

      const futureTime = Date.now() + 24 * 60 * 60 * 1000;
      vi.spyOn(Date, "now").mockReturnValue(futureTime);

      expect(validate(client.client_id, client.client_secret)).toBe(false);
    });
  });
});
