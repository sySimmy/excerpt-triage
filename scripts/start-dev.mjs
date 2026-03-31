#!/usr/bin/env node

import { execSync, spawn } from "node:child_process";
import process from "node:process";
import { getDevServerPlan } from "./start-dev-lib.mjs";

function getListenerPid(port) {
  try {
    const output = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();

    if (!output) return null;
    const firstPid = output.split(/\s+/)[0];
    const pid = Number(firstPid);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

const port = Number(process.env.EXCERPT_TRIAGE_PORT ?? "3456");
const listenerPid = getListenerPid(port);
const plan = getDevServerPlan({ port, listenerPid });

for (const line of plan.lines) {
  console.log(line);
}

if (!plan.shouldStart) {
  process.exit(0);
}

const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  cwd: process.cwd(),
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
