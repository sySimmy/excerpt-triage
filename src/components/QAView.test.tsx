import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

    const history = screen.getByLabelText("问答历史");

    expect(within(history).getByRole("button", { name: /第二条问题/ })).toHaveAttribute("data-state", "selected");
    expect(within(history).getByRole("button", { name: /第一条问题/ })).not.toHaveAttribute("data-state", "selected");
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("renders the focused answer as markdown content", () => {
    const markdownMessages: QAMessage[] = [
      {
        question: "Markdown 问题",
        answer: "这是**重点**。\n\n- 第一项\n- 第二项\n\n[参考链接](https://example.com)",
        timestamp: "2026-04-04T00:02:00.000Z",
      },
    ];

    render(createElement(QAView, { excerptId: 42, initialMessages: markdownMessages }));

    expect(screen.getByRole("link", { name: "参考链接" })).toHaveAttribute("href", "https://example.com");
    expect(screen.getByRole("list")).toBeInTheDocument();
    expect(screen.getByText("重点").closest("strong")).not.toBeNull();
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
    expect(screen.getByRole("status", { name: "回答生成中" })).toBeInTheDocument();

    resolveFetch(
      new Response(JSON.stringify({ answer: "聚焦后的回答" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await waitFor(() => expect(screen.getByText("聚焦后的回答")).toBeInTheDocument());
    expect(screen.getByLabelText("问答历史")).toBeInTheDocument();
    expect(within(screen.getByLabelText("问答历史")).getByRole("button", { name: /聚焦问题是什么/ })).toHaveAttribute(
      "data-state",
      "selected",
    );
  });

  it("shows a reader-side error card when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    render(createElement(QAView, { excerptId: 42, initialMessages: [] }));

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "失败时怎么办？" } });
    fireEvent.click(screen.getByRole("button", { name: "发送" }));

    await waitFor(() => expect(screen.getByTestId("qa-error-card")).toBeInTheDocument());
    expect(screen.getByTestId("qa-error-card")).toHaveTextContent("出错了，请重试");
  });

  it("shows only the focused answer and lets history buttons switch the reader pane", () => {
    render(createElement(QAView, { excerptId: 42, initialMessages }));

    const history = screen.getByLabelText("问答历史");

    expect(within(history).getByRole("button", { name: /第一条问题/ })).toBeInTheDocument();
    expect(within(history).getByRole("button", { name: /第二条问题/ })).toBeInTheDocument();
    expect(screen.queryByText("第一条回答")).not.toBeInTheDocument();
    expect(screen.getByText("第二条回答")).toBeInTheDocument();

    fireEvent.click(within(history).getByRole("button", { name: /第一条问题/ }));

    expect(screen.getByText("第一条回答")).toBeInTheDocument();
    expect(screen.queryByText("第二条回答")).not.toBeInTheDocument();
  });
});
