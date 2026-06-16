#!/usr/bin/env bash
# Sobe o simulador iOS do app mobile usando dados da seed.
# Roda a seed, extrai o patientId, escreve apps/mobile/.env e inicia o Expo.
# Uso: pnpm mobile:dev
set -euo pipefail

# Garante que estamos na raiz do repo
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "[mobile-dev] Rodando seed..."
SEED_OUT=$(node --env-file=.env --import tsx packages/db/scripts/seed.ts 2>&1)
echo "$SEED_OUT"

PATIENT_ID=$(echo "$SEED_OUT" | grep 'patientId:' | awk '{print $NF}')

if [ -z "$PATIENT_ID" ]; then
  echo "[mobile-dev] ERRO: patientId não encontrado na saída do seed. O banco está rodando?"
  exit 1
fi

cat > apps/mobile/.env <<EOF
EXPO_PUBLIC_API_URL=http://localhost:3333
EXPO_PUBLIC_PATIENT_ID=$PATIENT_ID
EOF

echo "[mobile-dev] apps/mobile/.env atualizado — PATIENT_ID=$PATIENT_ID"
echo "[mobile-dev] Iniciando simulador iOS..."

cd apps/mobile
exec npx expo start --ios
