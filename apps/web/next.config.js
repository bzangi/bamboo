import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Raiz do monorepo: evita o Next inferir um lockfile errado fora do repo.
  turbopack: { root: resolve(__dirname, "../..") },
  // Pacotes do workspace que expõem TS direto (sem build step) precisam ser
  // transpilados pelo Next.
  transpilePackages: ["@bamboo/types", "@bamboo/api-client", "@bamboo/core"],
};

export default nextConfig;
