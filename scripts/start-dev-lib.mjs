export function getDevServerPlan({ port, listenerPid }) {
  const url = `http://localhost:${port}`;

  if (listenerPid !== null) {
    return {
      shouldStart: false,
      lines: [
        `端口 ${port} 已被 PID ${listenerPid} 占用，可能已有 Excerpt Triage 在运行。`,
        `浏览器访问: ${url}`,
      ],
    };
  }

  return {
    shouldStart: true,
    lines: [
      "启动 Excerpt Triage...",
      `浏览器访问: ${url}`,
      "",
    ],
  };
}
