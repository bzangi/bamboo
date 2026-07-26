import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import process from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));

// O Next só carrega .env do diretório do app; o monorepo mantém UM .env na raiz
// (o mesmo que a API lê). Sem isto, NUTRI_API_KEY/API_URL não chegariam ao
// servidor web. `process.loadEnvFile` é stdlib (Node 20.12+) — nada de dotenv
// aqui. Vale para `next dev` e `next start`, que carregam este arquivo no boot.
try {
  process.loadEnvFile(resolve(__dirname, "../../.env"));
} catch {
  // .env é opcional: em produção as envs vêm do ambiente.
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Raiz do monorepo: evita o Next inferir um lockfile errado fora do repo.
  turbopack: { root: resolve(__dirname, "../..") },
  // Pacotes do workspace que expõem TS direto (sem build step) precisam ser
  // transpilados pelo Next.
  transpilePackages: ["@bamboo/types", "@bamboo/api-client", "@bamboo/core"],
};

export default nextConfig;
