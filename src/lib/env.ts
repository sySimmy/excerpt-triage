import fs from "fs";
import os from "os";
import path from "path";

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export const VAULT_PATH = expandHome(process.env.VAULT_PATH ?? "");

export function validateVaultPath(): { ok: boolean; message?: string } {
  if (!VAULT_PATH) {
    return { ok: false, message: "VAULT_PATH 未配置，请在 .env.local 中设置（参考 .env.example）" };
  }
  if (!fs.existsSync(VAULT_PATH)) {
    return { ok: false, message: `VAULT_PATH 路径不存在: ${VAULT_PATH}` };
  }
  return { ok: true };
}
