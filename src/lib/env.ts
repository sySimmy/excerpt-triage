import os from "os";
import path from "path";

function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

export const VAULT_PATH = expandHome(process.env.VAULT_PATH ?? "");
