import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

import { loadPrompt, promptsDir } from "./promptLoader";

describe("loadPrompt", () => {
  const FIXTURE_NAME = "__test_fixture_loader";
  const fixturePath = join(promptsDir(), `${FIXTURE_NAME}.md`);

  afterEach(() => {
    try {
      unlinkSync(fixturePath);
    } catch {
      // ignore — test may have failed before writing
    }
  });

  it("reads a prompt file from lib/agent/prompts/", () => {
    writeFileSync(fixturePath, "# Fixture\n\nHello world.\n");
    expect(loadPrompt(FIXTURE_NAME)).toBe("# Fixture\n\nHello world.\n");
  });

  it("throws when the prompt file is missing", () => {
    expect(() => loadPrompt("__definitely_not_a_real_prompt__")).toThrow();
  });

  it("anchors promptsDir at lib/agent/prompts under the project root", () => {
    expect(promptsDir()).toMatch(/lib[\\/]+agent[\\/]+prompts$/);
  });
});
