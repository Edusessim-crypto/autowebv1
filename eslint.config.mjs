import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // O worker de render é um serviço Python; seu venv não é código nosso.
  globalIgnores([
    ".next/**",
    ".data/**",
    "next-env.d.ts",
    "services/render-worker/**",
  ]),
]);
