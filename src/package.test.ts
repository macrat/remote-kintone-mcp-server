import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("package.json dependencies", () => {
  const packageJson = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf-8"),
  );

  it("should include @kintone/rest-api-client in dependencies", () => {
    expect(packageJson.dependencies).toHaveProperty(
      "@kintone/rest-api-client",
    );
  });
});
