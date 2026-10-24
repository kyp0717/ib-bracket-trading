import { spawn, spawnSync } from "child_process";
import { readFileSync } from "fs";
import { basename } from "path";
import { hostname } from "os";

export function host(): string {
  return hostname().split(".")[0];
}

export function bucket(): string {
  return process.env.BRACKET_S3_BUCKET ?? "amzn-s3-trading-audit";
}

function region(): string {
  return process.env.BRACKET_S3_REGION ?? process.env.TRADER_S3_REGION ?? "us-east-1";
}

function creds(): { key: string; secret: string } | undefined {
  const key = process.env.AWS_ACCESS_KEY_ID ?? process.env.TRADER_S3_ACCESS_KEY;
  const secret = process.env.AWS_SECRET_ACCESS_KEY ?? process.env.TRADER_S3_SECRET_KEY;
  return key && secret ? { key, secret } : undefined;
}

function uri(key: string): string {
  return `s3://${bucket()}/${key}`;
}

export function upload(key: string, body: Buffer | string): Promise<string | null> {
  const c = creds();
  if (!c) {
    console.log(`UPLOAD_SKIPPED reason=no-credentials key=${key}`);
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const child = spawn("aws", ["s3", "cp", "-", uri(key), "--region", region()], {
      env: { ...process.env, AWS_ACCESS_KEY_ID: c.key, AWS_SECRET_ACCESS_KEY: c.secret, AWS_DEFAULT_REGION: region() },
      stdio: ["pipe", "ignore", "pipe"],
    });
    let err = "";
    child.stderr.on("data", (d) => { err += d; });
    child.on("error", (e) => {
      console.error(`UPLOAD_FAILED key=${key} err=${e.message}`);
      resolve(null);
    });
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`UPLOADED uri=${uri(key)} bytes=${body.length}`);
        resolve(uri(key));
      } else {
        console.error(`UPLOAD_FAILED uri=${uri(key)} stderr=${err.trim()}`);
        resolve(null);
      }
    });
    child.stdin.write(body);
    child.stdin.end();
  });
}

export function uploadSync(key: string, body: Buffer | string): void {
  const c = creds();
  if (!c) return;
  const out = spawnSync("aws", ["s3", "cp", "-", uri(key), "--region", region()], {
    input: body,
    timeout: 5000,
    env: { ...process.env, AWS_ACCESS_KEY_ID: c.key, AWS_SECRET_ACCESS_KEY: c.secret, AWS_DEFAULT_REGION: region() },
    encoding: "buffer",
  });
  if (out.status === 0) console.log(`UPLOADED uri=${uri(key)} bytes=${body.length}`);
  else console.error(`UPLOAD_FAILED uri=${uri(key)} stderr=${Buffer.from(out.stderr ?? "").toString().trim()}`);
}

export async function uploadFile(key: string, path: string): Promise<string | null> {
  return upload(key, readFileSync(path));
}

export function list(prefix: string): Promise<string[]> {
  const c = creds();
  if (!c) return Promise.resolve([]);
  return new Promise((resolve) => {
    const child = spawn("aws", ["s3", "ls", uri(prefix), "--recursive", "--region", region()], {
      env: { ...process.env, AWS_ACCESS_KEY_ID: c.key, AWS_SECRET_ACCESS_KEY: c.secret, AWS_DEFAULT_REGION: region() },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("error", () => resolve([]));
    child.on("close", (code) => {
      if (code !== 0) return resolve([]);
      resolve(out.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => l.split(/\s+/).slice(3).join(" ")));
    });
  });
}

export function download(key: string): Promise<string> {
  const c = creds();
  if (!c) return Promise.resolve("");
  return new Promise((resolve) => {
    const child = spawn("aws", ["s3", "cp", uri(key), "-", "--region", region()], {
      env: { ...process.env, AWS_ACCESS_KEY_ID: c.key, AWS_SECRET_ACCESS_KEY: c.secret, AWS_DEFAULT_REGION: region() },
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.on("error", () => resolve(""));
    child.on("close", () => resolve(out));
  });
}

export function evidenceKey(localName: string): string {
  return `evidence/${host()}/${basename(localName)}`;
}
