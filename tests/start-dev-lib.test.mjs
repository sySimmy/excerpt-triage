import test from "node:test";
import assert from "node:assert/strict";

import { getDevServerPlan } from "../scripts/start-dev-lib.mjs";

test("starts the dev server when the port is free", () => {
  const plan = getDevServerPlan({ port: 3456, listenerPid: null });

  assert.equal(plan.shouldStart, true);
  assert.equal(plan.lines[0], "启动 Excerpt Triage...");
  assert.equal(plan.lines[1], "浏览器访问: http://localhost:3456");
});

test("shows a friendly reuse message when the port is already occupied", () => {
  const plan = getDevServerPlan({ port: 3456, listenerPid: 63617 });

  assert.equal(plan.shouldStart, false);
  assert.match(plan.lines[0], /端口 3456 已被 PID 63617 占用/);
  assert.equal(plan.lines[1], "浏览器访问: http://localhost:3456");
});
