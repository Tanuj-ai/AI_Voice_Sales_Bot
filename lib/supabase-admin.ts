const bucketName = "recordings";

function getSupabaseConfiguration() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local, then restart the server.");
  }
  return { url, serviceRoleKey };
}

export function supabaseBucketName() {
  return bucketName;
}

export function supabaseProjectUrl() {
  return getSupabaseConfiguration().url;
}

export function supabaseAdminFetch(path: string, init: RequestInit = {}) {
  const { url, serviceRoleKey } = getSupabaseConfiguration();
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Authorization", `Bearer ${serviceRoleKey}`);
  return fetch(`${url}${path}`, { ...init, headers, cache: "no-store" });
}

export async function supabaseError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string; error?: string };
    return body.message ?? body.error ?? `Supabase request failed (${response.status}).`;
  } catch {
    return `Supabase request failed (${response.status}).`;
  }
}
