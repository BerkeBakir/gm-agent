import { describe, expect, it } from "vitest";
import { activeTab } from "../src/ui";

describe("activeTab", () => {
  it("highlights Today only for today's puzzle", () => {
    expect(activeTab("today", "gm-20", "gm-20")).toBe("today");
  });
  it("highlights Archive while an archive puzzle is open", () => {
    expect(activeTab("today", "gm-19", "gm-20")).toBe("archive");
  });
  it("highlights Archive on the archive list", () => {
    expect(activeTab("archive", "gm-20", "gm-20")).toBe("archive");
  });
  it("highlights the GM's log tab", () => {
    expect(activeTab("gm", "gm-19", "gm-20")).toBe("gm");
  });
});
