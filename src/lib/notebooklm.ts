import { execFile } from "child_process";
import path from "path";

const PYTHON_PATH = path.join(process.cwd(), ".venv", "bin", "python3");
const SCRIPT_PATH = path.join(process.cwd(), "scripts", "notebooklm-cli.py");

interface CLIResult {
  success: boolean;
  [key: string]: unknown;
}

export function callNotebookLM(
  subcommand: string,
  args: Record<string, string>,
  options?: { stdin?: string; timeout?: number }
): Promise<CLIResult> {
  const notebookId = process.env.NOTEBOOKLM_NOTEBOOK_ID;
  if (!notebookId) {
    return Promise.resolve({ success: false, error: "NOTEBOOKLM_NOTEBOOK_ID not configured" });
  }

  const cliArgs = [SCRIPT_PATH, subcommand, `--notebook-id=${notebookId}`];
  for (const [key, value] of Object.entries(args)) {
    cliArgs.push(`--${key}=${value}`);
  }

  return new Promise((resolve) => {
    const child = execFile(
      PYTHON_PATH,
      cliArgs,
      { timeout: options?.timeout ?? 30000 },
      (error, stdout, stderr) => {
        if (error) {
          const msg = stderr?.trim() || error.message;
          resolve({ success: false, error: msg });
          return;
        }
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          resolve({ success: false, error: stdout.trim() || "Unknown error" });
        }
      }
    );
    if (options?.stdin) {
      child.stdin?.write(options.stdin);
      child.stdin?.end();
    }
  });
}
