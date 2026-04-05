import { describe, expect, it } from "vitest";

import { getDevServerPlan } from "../scripts/start-dev-lib.mjs";

describe("getDevServerPlan", () => {
  it("starts the dev server when the port is free", () => {
    const plan = getDevServerPlan({ port: 3456, listenerPid: null });

    expect(plan.shouldStart).toBe(true);
    expect(plan.lines[0]).toBe("启动 Excerpt Triage...");
    expect(plan.lines[1]).toBe("浏览器访问: http://localhost:3456");
  });

  it("shows a friendly reuse message when the port is already occupied", () => {
    const plan = getDevServerPlan({ port: 3456, listenerPid: 63617 });

    expect(plan.shouldStart).toBe(false);
    expect(plan.lines[0]).toMatch(/端口 3456 已被 PID 63617 占用/);
    expect(plan.lines[1]).toBe("浏览器访问: http://localhost:3456");
  });
});
