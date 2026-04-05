import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LearningPanel from "./LearningPanel";

const excerpt = {
  id: 7,
  title: "学习文章",
  source_type: "article",
  source_name: "Learning Source",
  author: "Tester",
  url: "https://example.com/learn",
  published_at: "2026-04-05T00:00:00.000Z",
  tags: JSON.stringify([]),
  progress: 0,
  updated_at: "2026-04-05T00:00:00.000Z",
};

function jsonResponse(data: unknown, init?: ResponseInit) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
      ...init,
    }),
  );
}

function setupLearningFetchMock() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/excerpts/7") {
      return jsonResponse({ content: "# 原文内容" });
    }

    if (url.startsWith("/api/learning/material?")) {
      return jsonResponse({ exists: false });
    }

    if (url === "/api/learning/archive" && method === "POST") {
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: true });
  });
}

describe("LearningPanel archive confirmation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", setupLearningFetchMock());
    vi.stubGlobal("confirm", vi.fn(() => false));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks for confirmation before finishing and archiving from the learning panel", () => {
    const onFinish = vi.fn();

    render(<LearningPanel excerpt={excerpt} onFinish={onFinish} />);

    fireEvent.click(screen.getByRole("button", { name: "已掌握 → 确认归档" }));

    expect(confirm).toHaveBeenCalledWith("确定归档这篇文章？");
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/learning/archive",
      expect.objectContaining({ method: "POST" }),
    );
    expect(onFinish).not.toHaveBeenCalled();
  });
});
