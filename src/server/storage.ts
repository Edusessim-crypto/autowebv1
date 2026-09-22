import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}
class LocalStorage implements StorageProvider {
  private root = path.resolve(process.env.LOCAL_DATA_DIR || ".data", "uploads");
  private resolve(key: string) {
    if (
      !/^[a-f0-9-]+\/(vehicles|branding)\/[a-f0-9-]+(-thumb)?\.webp$/.test(key)
    )
      throw new Error("Invalid storage key");
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
export function getStorage(): StorageProvider {
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_LOCAL_DB !== "true"
  )
    throw new Error(
      "Configure an object storage provider before production uploads.",
    );
  return new LocalStorage();
}
