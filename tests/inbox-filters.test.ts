import { describe, expect, it } from "vitest";

import {
  buildTagFilterOptions,
  expandSourceTypeFilter,
  isStaleInboxResponse,
  shouldSkipInboxLoad,
} from "../src/lib/inbox-filters";

describe("inbox filters", () => {
  it("expands canonical source filters with known legacy aliases", () => {
    expect(expandSourceTypeFilter("article")).toEqual(["article", "web"]);
    expect(expandSourceTypeFilter("report")).toEqual(["report", "report/paper"]);
    expect(expandSourceTypeFilter("social")).toEqual(["social"]);
  });

  it("merges vocabulary tags with database tags without duplicates", () => {
    const options = buildTagFilterOptions(
      ["ai-coding", "openclaw", "workflow"],
      [
        { tag: "clip", count: 169 },
        { tag: "openclaw", count: 102 },
        { tag: "use_case/部署", count: 81 },
      ],
    );

    expect(options.map((option) => option.value)).toEqual([
      "clip",
      "openclaw",
      "use_case/部署",
      "ai-coding",
      "workflow",
    ]);
    expect(options.find((option) => option.value === "clip")?.count).toBe(169);
  });

  it("only blocks pagination while a request is already in flight", () => {
    expect(shouldSkipInboxLoad({ loading: false, reset: false })).toBe(false);
    expect(shouldSkipInboxLoad({ loading: true, reset: false })).toBe(true);
    expect(shouldSkipInboxLoad({ loading: true, reset: true })).toBe(false);
  });

  it("marks older inbox responses as stale", () => {
    expect(isStaleInboxResponse({ requestId: 1, latestRequestId: 2 })).toBe(true);
    expect(isStaleInboxResponse({ requestId: 2, latestRequestId: 2 })).toBe(false);
  });
});
