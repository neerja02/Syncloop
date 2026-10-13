/**
 * How the components talk to the backend. In the Next.js app these were server actions; here every call goes
 * through one `transport`, so you can point it at REST, RPC or a mock without touching the components.
 *
 * Default: POST {VITE_API_BASE ?? "/api"}/actions/{name} with the arguments as a JSON array. When an argument is a
 * FormData (file uploads), the request is multipart: the FormData fields plus `__args` (the other arguments as JSON).
 * The response must be JSON in the ActionResult shape below.
 */
export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type Transport = (name: string, args: unknown[]) => Promise<unknown>;

const API_BASE: string = import.meta.env.VITE_API_BASE ?? "/api";

const httpTransport: Transport = async (name, args) => {
  const form = args.find((a): a is FormData => a instanceof FormData);
  let init: RequestInit;
  if (form) {
    const body = new FormData();
    form.forEach((v, k) => body.append(k, v));
    body.append("__args", JSON.stringify(args.map((a) => (a instanceof FormData ? null : a))));
    init = { method: "POST", body, credentials: "include" };
  } else {
    init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args), credentials: "include" };
  }
  try {
    const res = await fetch(`${API_BASE}/actions/${name}`, init);
    return await res.json();
  } catch {
    return { ok: false, error: "Couldn't reach the server. Please check your connection and try again." };
  }
};

let transport: Transport = httpTransport;

/** Replace how calls are sent (e.g. a mock for demos and tests, or your own API client). */
export function setTransport(t: Transport) {
  transport = t;
}

export function call<T>(name: string, ...args: unknown[]): Promise<T> {
  return transport(name, args) as Promise<T>;
}
