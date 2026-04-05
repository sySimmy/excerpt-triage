import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReadingPanel from "./ReadingPanel";

const excerptResponse = {
  id: 42,
  title: "测试文章",
  source_type: "article",
  source_name: "Test Source",
  author: "Tester",
  url: "https://example.com/article",
  published_at: "2026-04-05T00:00:00.000Z",
  signal: 3,
  status: "to_process",
  tags: JSON.stringify(["tag/a"]),
  topic: null,
  content: "测试内容",
  location: "inbox",
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

function setupReadingFetchMock() {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url === "/api/excerpts/42") {
      return jsonResponse(excerptResponse);
    }

    if (url.startsWith("/api/learning/material?")) {
      return jsonResponse({ exists: false });
    }

    if (url === "/api/archive" && method === "POST") {
      return jsonResponse({ success: true });
    }

    if (url === "/api/excerpts/42" && method === "PATCH") {
      return jsonResponse({ success: true });
    }

    if (url === "/api/deep-read" && method === "POST") {
      return jsonResponse({ success: true });
    }

    return jsonResponse({ success: true });
  });
}

describe("ReadingPanel archive confirmation", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", setupReadingFetchMock());
    vi.stubGlobal("confirm", vi.fn(() => false));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks for confirmation before archiving from the inbox action button", async () => {
    render(<ReadingPanel excerptId={42} tagSuggestions={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: "归档 →" }));

    expect(confirm).toHaveBeenCalledWith("确定归档这篇文章？");
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/archive",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("asks for confirmation before archiving from the deep-read action button", async () => {
    render(<ReadingPanel excerptId={42} tagSuggestions={[]} deepReadMode />);

    fireEvent.click(await screen.findByRole("button", { name: "归档 →" }));

    expect(confirm).toHaveBeenCalledWith("确定归档这篇文章？");
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/archive",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("asks for confirmation before the Enter shortcut archives", async () => {
    render(<ReadingPanel excerptId={42} tagSuggestions={[]} />);

    await screen.findByText("测试文章");
    fireEvent.keyDown(window, { key: "Enter" });

    await waitFor(() => expect(confirm).toHaveBeenCalledWith("确定归档这篇文章？"));
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/archive",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
