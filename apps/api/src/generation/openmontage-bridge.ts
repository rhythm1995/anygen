/**
 * NestJS → vendor-overlay/bridge/run.py（CONCLUSIONS D6/D13）。
 * 禁止在 TS 重写 vendor 工具逻辑；stdin JSON / stdout JSON。
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface BridgeRequest {
  tool: string;
  action?: "execute" | "estimate_cost" | "get_info" | "dry_run";
  inputs?: Record<string, unknown>;
}

export interface BridgeResponse {
  ok: boolean;
  result?: Record<string, unknown>;
  error?: string;
}

export function repoRoot(): string {
  const cwd = process.cwd();
  if (existsSync(join(cwd, "vendor-overlay/bridge/run.py"))) return cwd;
  const up = resolve(cwd, "../..");
  if (existsSync(join(up, "vendor-overlay/bridge/run.py"))) return up;
  return cwd;
}

export function bridgeScriptPath(): string {
  return join(repoRoot(), "vendor-overlay/bridge/run.py");
}

function pythonBin(): string {
  const venv = join(repoRoot(), "vendor/openmontage/.venv/bin/python");
  if (existsSync(venv)) return venv;
  return "python3";
}

export function runOpenMontageBridge(
  req: BridgeRequest,
  opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {},
): Promise<BridgeResponse> {
  const script = bridgeScriptPath();
  if (!existsSync(script)) {
    return Promise.resolve({ ok: false, error: "openmontage bridge missing: vendor-overlay/bridge/run.py" });
  }
  const timeoutMs = opts.timeoutMs ?? 180_000;
  return new Promise((resolvePromise) => {
    const child = spawn(pythonBin(), [script], {
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolvePromise({ ok: false, error: `openmontage bridge timeout after ${timeoutMs}ms` });
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => errChunks.push(d));
    child.on("error", (e) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, error: `openmontage bridge spawn failed: ${e.message}` });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        const err = Buffer.concat(errChunks).toString("utf8").slice(0, 400);
        resolvePromise({ ok: false, error: `openmontage bridge empty stdout (exit ${code}): ${err}` });
        return;
      }
      try {
        const parsed = JSON.parse(raw) as BridgeResponse;
        resolvePromise(parsed);
      } catch {
        resolvePromise({ ok: false, error: `openmontage bridge bad json: ${raw.slice(0, 240)}` });
      }
    });
    child.stdin.write(JSON.stringify({ tool: req.tool, action: req.action ?? "execute", inputs: req.inputs ?? {} }));
    child.stdin.end();
  });
}
