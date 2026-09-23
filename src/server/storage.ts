import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  // URL temporária para um serviço interno ler o objeto sem abrir o bucket.
  // Nunca é persistida: o banco guarda a storageKey.
  signedUrl?(key: string, expiresInSeconds: number): Promise<string>;
}
// Chaves aceitas: mídia do veículo/marca e as peças geradas pelo Studio.
// Restringir o formato impede que uma chave arbitrária alcance o bucket.
const keyPattern =
  /^(?:[a-f0-9-]+\/(?:vehicles|branding)\/[a-f0-9-]+(?:-thumb)?\.webp|dealerships\/[a-f0-9-]+\/content\/[a-f0-9-]+\/[a-f0-9-]+\/card-\d{2}\.png)$/;
class LocalStorage implements StorageProvider {
  private root = path.resolve(process.env.LOCAL_DATA_DIR || ".data", "uploads");
  private resolve(key: string) {
    if (!keyPattern.test(key)) throw new Error("Invalid storage key");
    return path.join(this.root, key);
  }
  async put(key: string, data: Buffer) {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }
  async get(key: string) {
    return readFile(this.resolve(key));
  }
  async remove(key: string) {
    await unlink(this.resolve(key)).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
// Supabase Storage over its REST API; the service role key never leaves the
// server, so the bucket stays private and reads keep going through /api/media.
class SupabaseStorage implements StorageProvider {
  constructor(
    private url: string,
    private serviceKey: string,
    private bucket: string,
  ) {}
  private endpoint(key: string) {
    if (!keyPattern.test(key)) throw new Error("Invalid storage key");
    return `${this.url}/storage/v1/object/${this.bucket}/${key}`;
  }
  private headers() {
    return {
      authorization: `Bearer ${this.serviceKey}`,
      apikey: this.serviceKey,
    };
  }
  async put(key: string, data: Buffer) {
    const response = await fetch(this.endpoint(key), {
      method: "POST",
      headers: {
        ...this.headers(),
        "content-type": "image/webp",
        "x-upsert": "true",
      },
      body: new Uint8Array(data),
    });
    if (!response.ok)
      throw new Error(`Storage upload failed (${response.status}).`);
  }
  async get(key: string) {
    const response = await fetch(this.endpoint(key), {
      headers: this.headers(),
    });
    if (!response.ok)
      throw new Error(`Storage read failed (${response.status}).`);
    return Buffer.from(await response.arrayBuffer());
  }
  async remove(key: string) {
    const response = await fetch(this.endpoint(key), {
      method: "DELETE",
      headers: this.headers(),
    });
    // A missing object is already the desired end state.
    if (!response.ok && response.status !== 404)
      throw new Error(`Storage removal failed (${response.status}).`);
  }
  async signedUrl(key: string, expiresInSeconds: number) {
    if (!keyPattern.test(key)) throw new Error("Invalid storage key");
    const response = await fetch(
      `${this.url}/storage/v1/object/sign/${this.bucket}/${key}`,
      {
        method: "POST",
        headers: { ...this.headers(), "content-type": "application/json" },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
      },
    );
    if (!response.ok)
      throw new Error(`Signed URL failed (${response.status}).`);
    const data = (await response.json()) as { signedURL: string };
    return `${this.url}/storage/v1${data.signedURL}`;
  }
}
export function getStorage(): StorageProvider {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.STORAGE_PROVIDER === "supabase") {
    if (!url || !serviceKey)
      throw new Error(
        "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for Supabase storage.",
      );
    return new SupabaseStorage(
      url,
      serviceKey,
      process.env.SUPABASE_STORAGE_BUCKET || "vehicle-media",
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_LOCAL_DB !== "true"
  )
    throw new Error(
      "Configure an object storage provider before production uploads.",
    );
  return new LocalStorage();
}
