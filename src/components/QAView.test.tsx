import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import QAView from "./QAView";

interface QAMessage {
  question: string;
  answer: string;
  timestamp: string;
}

describe("QAView focused state", () => {
  const initialMessages: QAMessage[] = [
    {
      question: "第一条问题",
      answer: "第一条回答",
      timestamp: "2026-04-04T00:00:00.000Z",
    },
    {
      question: "第二条问题",
      answer: "第二条回答",
      timestamp: "2026-04-04T00:01:00.000Z",
    },
  ];

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the latest message selected by default and does not auto-scroll the transcript", () => {
    render(createElement(QAView, { excerptId: 42, initialMessages }));

    expect(screen.getByText("第二条问题").closest("[data-state='selected']")).not.toBeNull();
    expect(screen.getByText("第一条问题").closest("[data-state='selected']")).toBeNull();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("focuses a pending question and appends the final answer when the request resolves", async () => {
    let resolveFetch: (value: Response) => void = () => undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    render(createElement(QAView, { excerptId: 42, initialMessages: [] }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  聚焦问题是什么？  " } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    expect(fetch).toHaveBeenCalledWith(
      "/api/learning/ask",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excerpt_id: 42, question: "聚焦问题是什么？" }),
      }),
    );

    expect(screen.getByText("聚焦问题是什么？").closest("[data-state='pending']")).not.toBeNull();

    resolveFetch(
      new Response(JSON.stringify({ answer: "聚焦后的回答" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => expect(screen.getByText("聚焦后的回答")).toBeInTheDocument());
    expect(screen.getByText("聚焦问题是什么？").closest("[data-state='selected']")).not.toBeNull();
  });
});
