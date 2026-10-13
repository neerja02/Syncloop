import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/config/env";
import { hmac, safeEqual } from "@/lib/security/crypto";

/**
 * Private file storage. Files are never exposed through permanent public URLs: callers obtain short-lived
 * signed URLs that are additionally bound to the requesting user and re-checked against permissions.
 */
export interface StorageProvider {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  signedUrl(key: string, opts: { userId: string; ttlSeconds?: number; download?: boolean }): Promise<string>;
}

function assertSafeKey(key: string) {
  if (!/^[a-zA-Z0-9/_\-.]+$/.test(key) || key.includes("..")) throw new Error("Invalid storage key");
}

export function signFileToken(key: string, userId: string, exp: number) {
  return hmac(env.storageSigningSecret, `${key}|${userId}|${exp}`);
}

export function verifyFileToken(key: string, userId: string, exp: number, sig: string) {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  return safeEqual(signFileToken(key, userId, exp), sig);
}

export class LocalStorageProvider implements StorageProvider {
  readonly name = "local";
  constructor(private root = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.storageDir)) {}
  private file(key: string) {
    assertSafeKey(key);
    return path.join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    const f = this.file(key);
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, data, { mode: 0o600 });
  }
  async get(key: string) {
    return fs.readFile(this.file(key));
  }
  async delete(key: string) {
    await fs.rm(this.file(key), { force: true });
  }
  async signedUrl(key: string, opts: { userId: string; ttlSeconds?: number; download?: boolean }) {
    const exp = Math.floor(Date.now() / 1000) + (opts.ttlSeconds ?? 300);
    const sig = signFileToken(key, opts.userId, exp);
    const q = new URLSearchParams({ key, exp: String(exp), sig });
    if (opts.download) q.set("download", "1");
    return `/api/files?${q.toString()}`;
  }
}

/** Supabase Storage adapter (private bucket). Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. */
export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase";
  constructor(
    private url = env.keys.supabaseUrl!,
    private serviceKey = env.keys.supabaseServiceRole!,
    private bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "health-files",
  ) {
    if (!url || !serviceKey) throw new Error("Supabase storage requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  }
  private headers(extra: Record<string, string> = {}) {
    return { Authorization: `Bearer ${this.serviceKey}`, apikey: this.serviceKey, ...extra };
  }
  async put(key: string, data: Buffer, contentType: string) {
    assertSafeKey(key);
    const res = await fetch(`${this.url}/storage/v1/object/${this.bucket}/${key}`, {
      method: "POST",
      headers: this.headers({ "Content-Type": contentType, "x-upsert": "false" }),
      body: new Uint8Array(data),
    });
    if (!res.ok) throw new Error(`Supabase upload failed: ${res.status}`);
  }
  async get(key: string) {
    assertSafeKey(key);
    const res = await fetch(`${this.url}/storage/v1/object/authenticated/${this.bucket}/${key}`, { headers: this.headers() });
    if (!res.ok) throw new Error(`Supabase download failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  async delete(key: string) {
    assertSafeKey(key);
    await fetch(`${this.url}/storage/v1/object/${this.bucket}`, {
      method: "DELETE",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefixes: [key] }),
    });
  }
  async signedUrl(key: string, opts: { userId: string; ttlSeconds?: number }) {
    // Route through our own /api/files endpoint so permission checks still run on every access.
    return new LocalStorageProvider().signedUrl(key, opts);
  }
}

let instance: StorageProvider | null = null;
export function getStorage(): StorageProvider {
  if (!instance) instance = env.storageProvider === "supabase" ? new SupabaseStorageProvider() : new LocalStorageProvider();
  return instance;
}
