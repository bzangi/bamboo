// Auth stub (v0): paciente fixo por variável de ambiente.
// Expo expõe automaticamente vars com prefixo EXPO_PUBLIC_* no bundle do cliente.
//
// Como setar (ex.: arquivo .env na raiz de apps/mobile, ou inline ao rodar):
//   EXPO_PUBLIC_API_URL=http://localhost:3002
//   EXPO_PUBLIC_PATIENT_ID=<uuid do paciente semeado>
//
// O UUID do paciente muda a cada seed, por isso NÃO é hardcoded — vem do env.

const DEFAULT_API_URL = "http://localhost:3002";

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? DEFAULT_API_URL;

// Sem default: se faltar, a Home exibe um aviso de configuração (não chuta UUID).
export const PATIENT_ID: string | undefined =
  process.env.EXPO_PUBLIC_PATIENT_ID;
