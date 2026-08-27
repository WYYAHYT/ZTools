import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("Host accessibility policy", () => {
  it("keeps search announcements atomic and outside the result listbox", async () => {
    const source = await readFile(
      new URL("../src/renderer/App.vue", import.meta.url),
      "utf8",
    );

    expect(source).toContain('id="search-feedback"');
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-atomic="true"');
    expect(source).toContain(
      'aria-describedby="search-instructions search-feedback"',
    );
    expect(source).toContain(':aria-busy="searchPending"');
    expect(source).toContain('role="alert"');
    expect(source).not.toMatch(/<ul[^>]*role="listbox"[^>]*aria-live=/su);
  });

  it("provides explicit forced-color focus and selection boundaries", async () => {
    const source = await readFile(
      new URL("../src/renderer/App.vue", import.meta.url),
      "utf8",
    );

    expect(source).toContain("@media (forced-colors: active)");
    expect(source).toContain("outline: 3px solid Highlight");
    expect(source).toContain("background: Highlight");
    expect(source).toContain("color: HighlightText");
    expect(source).toContain("forced-color-adjust: none");
  });
});
