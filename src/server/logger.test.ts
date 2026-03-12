import { describe, expect, it } from "vitest";
import { sanitize } from "./logger.js";

describe("sanitize", () => {
  it("redacts sensitive keys", () => {
    const data = {
      password: "secret123",
      token: "abc",
      secret: "xyz",
      apitoken: "tok",
      username: "visible",
    };

    const result = sanitize(data);

    expect(result.password).toBe("[REDACTED]");
    expect(result.token).toBe("[REDACTED]");
    expect(result.secret).toBe("[REDACTED]");
    expect(result.apitoken).toBe("[REDACTED]");
    expect(result.username).toBe("visible");
  });

  it("redacts keys case-insensitively", () => {
    const data = {
      Password: "secret",
      TOKEN: "abc",
      Secret: "xyz",
      ApiToken: "tok",
    };

    const result = sanitize(data);

    expect(result.Password).toBe("[REDACTED]");
    expect(result.TOKEN).toBe("[REDACTED]");
    expect(result.Secret).toBe("[REDACTED]");
    expect(result.ApiToken).toBe("[REDACTED]");
  });

  it("sanitizes nested objects", () => {
    const data = {
      config: {
        password: "secret",
        host: "example.com",
      },
    };

    const result = sanitize(data) as Record<string, Record<string, unknown>>;

    expect(result.config.password).toBe("[REDACTED]");
    expect(result.config.host).toBe("example.com");
  });

  it("sanitizes objects inside arrays", () => {
    const data = {
      users: [
        { name: "Alice", token: "abc" },
        { name: "Bob", token: "def" },
      ],
    };

    const result = sanitize(data) as {
      users: Array<Record<string, unknown>>;
    };

    expect(result.users[0].name).toBe("Alice");
    expect(result.users[0].token).toBe("[REDACTED]");
    expect(result.users[1].name).toBe("Bob");
    expect(result.users[1].token).toBe("[REDACTED]");
  });

  it("preserves non-sensitive primitive values in arrays", () => {
    const data = { tags: ["a", "b", "c"] };
    const result = sanitize(data);
    expect(result.tags).toEqual(["a", "b", "c"]);
  });
});
