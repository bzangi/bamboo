// Camada de rede compartilhada do client tipado. Centraliza o fetch + o
// tratamento de erro pra que TODA falha vire um ApiError descritivo — e, crucial
// pro app: separa "não conectou" (falha de rede: baseUrl/porta errada, offline)
// de "a API respondeu com erro" (status + corpo). Sem isso, o catch do app só
// recebia `Error("X failed: 404")` e perdia o corpo de erro da API.

export interface ApiErrorInit {
  readonly message: string;
  /** status HTTP; 0 quando não houve resposta (falha de rede). */
  readonly status: number;
  readonly isNetworkError: boolean;
  readonly url: string;
  readonly method: string;
  /** corpo de erro parseado da API (ApiErrorModel), se houver. */
  readonly body: unknown;
  readonly cause?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly isNetworkError: boolean;
  readonly url: string;
  readonly method: string;
  readonly body: unknown;

  constructor(init: ApiErrorInit) {
    super(
      init.message,
      init.cause !== undefined ? { cause: init.cause } : undefined,
    );
    this.name = "ApiError";
    this.status = init.status;
    this.isNetworkError = init.isNetworkError;
    this.url = init.url;
    this.method = init.method;
    this.body = init.body;
  }
}

export interface RequestOptions extends RequestInit {
  /** rótulo da operação (ex.: "getToday") — entra na mensagem de erro. */
  readonly label?: string;
}

// Lê o corpo de erro como JSON sem nunca lançar: respostas de erro podem não ser
// JSON (ex.: HTML de proxy, corpo vazio). Devolve undefined nesse caso.
async function safeJson(res: {
  json: () => Promise<unknown>;
}): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return undefined;
  }
}

/**
 * fetch tipado: devolve o JSON em 2xx; em qualquer falha lança um ApiError.
 * - fetch lança (não conectou) → ApiError{ isNetworkError:true, status:0 }.
 * - resposta não-ok → ApiError{ isNetworkError:false, status, body }.
 */
export async function requestJson<T>(
  url: string,
  options: RequestOptions = {},
): Promise<T> {
  const { label, ...init } = options;
  const method = init.method ?? "GET";
  const op = label ?? method;

  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (cause) {
    throw new ApiError({
      message: `${op} — falha de rede: não conectou em ${url} (verifique a API_URL/porta)`,
      status: 0,
      isNetworkError: true,
      url,
      method,
      body: undefined,
      cause,
    });
  }

  if (!res.ok) {
    throw new ApiError({
      message: `${op} — HTTP ${res.status} ${res.statusText}`,
      status: res.status,
      isNetworkError: false,
      url,
      method,
      body: await safeJson(res),
    });
  }

  return (await res.json()) as T;
}
