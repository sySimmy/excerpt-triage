import test from "node:test";
import assert from "node:assert/strict";

const helperModuleUrl = new URL("../src/lib/inbox-filters.ts", import.meta.url).href;
const {
  buildTagFilterOptions,
  expandSourceTypeFilter,
  isStaleInboxResponse,
  shouldSkipInboxLoad,
}: typeof import("../src/lib/inbox-filters") = await import(helperModuleUrl);

test("expandSourceTypeFilter includes known legacy aliases under the canonical source filter", () => {
  assert.deepEqual(expandSourceTypeFilter("article"), ["article", "web"]);
  assert.deepEqual(expandSourceTypeFilter("report"), ["report", "report/paper"]);
  assert.deepEqual(expandSourceTypeFilter("social"), ["social"]);
});

test("buildTagFilterOptions merges vocabulary tags with real database tags without duplicates", () => {
  const options = buildTagFilterOptions(
    ["ai-coding", "openclaw", "workflow"],
    [
      { tag: "clip", count: 169 },
      { tag: "openclaw", count: 102 },
      { tag: "use_case/部署", count: 81 },
    ]
  );

  assert.deepEqual(
    options.map((option) => option.value),
    ["clip", "openclaw", "use_case/部署", "ai-coding", "workflow"]
  );
  assert.equal(options.find((option) => option.value === "clip")?.count, 169);
});

test("shouldSkipInboxLoad only blocks pagination while a request is already in flight", () => {
  assert.equal(shouldSkipInboxLoad({ loading: false, reset: false }), false);
  assert.equal(shouldSkipInboxLoad({ loading: true, reset: false }), true);
  assert.equal(shouldSkipInboxLoad({ loading: true, reset: true }), false);
});

test("isStaleInboxResponse identifies older requests so they do not overwrite newer filters", () => {
  assert.equal(isStaleInboxResponse({ requestId: 1, latestRequestId: 2 }), true);
  assert.equal(isStaleInboxResponse({ requestId: 2, latestRequestId: 2 }), false);
});
