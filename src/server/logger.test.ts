import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLogger, sanitize } from "./logger.js";

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

describe("createLogger", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.LOG_LEVEL;
  });

  it("filters out info and debug when level is warn", () => {
    const logger = createLogger("warn");

    logger.info("should-not-appear");
    logger.debug("should-not-appear");

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it("only error produces output when level is error", () => {
    const logger = createLogger("error");

    logger.warn("no-output");
    logger.info("no-output");
    logger.debug("no-output");

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();

    logger.error("should-appear");

    expect(stderrSpy).toHaveBeenCalledTimes(1);
  });

  it("defaults to info level when no override and no LOG_LEVEL env", () => {
    delete process.env.LOG_LEVEL;
    const logger = createLogger();

    logger.info("visible");
    expect(stdoutSpy).toHaveBeenCalledTimes(1);

    logger.debug("invisible");
    // debug should not add another call
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });

  it("writes error to stderr and warn to stdout", () => {
    const logger = createLogger("warn");

    logger.error("err-event");
    expect(stderrSpy).toHaveBeenCalledTimes(1);
    expect(stdoutSpy).not.toHaveBeenCalled();

    logger.warn("warn-event");
    expect(stdoutSpy).toHaveBeenCalledTimes(1);
  });

  it("outputs parseable JSON with timestamp, level, and event fields", () => {
    const logger = createLogger("info");

    logger.info("test-event", { key: "value" });

    expect(stdoutSpy).toHaveBeenCalledTimes(1);

    const raw = stdoutSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(raw);

    expect(parsed).toHaveProperty("timestamp");
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("test-event");
  });
});
