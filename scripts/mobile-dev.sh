#!/usr/bin/env bash
# Sobe o simulador iOS do app mobile com o PLANO REAL do paciente 0.
# Carrega o plano (packages/db/scripts/planos/carregar.ts), extrai o patientId,
# escreve apps/mobile/.env e inicia o Expo.
# Uso: pnpm mobile:dev
set -euo pipefail

# Garante que estamos na raiz do repo
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Carrega o PLANO REAL do paciente 0 (não o plano fictício do seed). O carregador
# é idempotente e exige a nutricionista do seed — se o banco estiver vazio, ele
# diz "rode o seed primeiro".
echo "[mobile-dev] Carregando o plano real..."
CARGA_OUT=$(node --env-file=.env --import tsx packages/db/scripts/planos/carregar.ts 2>&1)
echo "$CARGA_OUT"

PATIENT_ID=$(echo "$CARGA_OUT" | grep 'patientId ' | awk '{print $NF}')

if [ -z "$PATIENT_ID" ]; then
  echo "[mobile-dev] ERRO: patientId não encontrado na saída da carga. O banco está rodando e semeado?"
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
