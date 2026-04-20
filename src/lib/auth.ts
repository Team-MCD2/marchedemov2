/* Simple password-protected admin — verified server-side.
   The password lives in a Vercel env variable: ADMIN_PASSWORD.
   A signed cookie keeps the user logged in after the first submit.
   This is intentionally lightweight — sufficient for a small team. */

import type { AstroCookies } from "astro";

const COOKIE_NAME = "mo_admin";
const COOKIE_MAX_AGE = 60 * 60 * 8; // 8h

function getSecret(): string {
  const s = import.meta.env.ADMIN_COOKIE_SECRET;
  if (!s) return "dev-only-unsafe-secret-please-set-ADMIN_COOKIE_SECRET";
  return s as string;
}

function getPassword(): string {
  const p = import.meta.env.ADMIN_PASSWORD;
  return (p as string) || "marchedemo2026";
}

/* Simple HMAC-like hash with Web Crypto.
   Returns hex digest of `payload + secret` with SHA-256.                  */
async function sign(payload: string): Promise<string> {
  const data = new TextEncoder().encode(payload + "|" + getSecret());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function login(password: string, cookies: AstroCookies) {
  if (password !== getPassword()) return false;
  const ts = Date.now().toString();
  const sig = await sign(ts);
  cookies.set(COOKIE_NAME, `${ts}.${sig}`, {
    httpOnly: true,
    path: "/",
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax",
    secure: import.meta.env.PROD,
  });
  return true;
}

export function logout(cookies: AstroCookies) {
  cookies.delete(COOKIE_NAME, { path: "/" });
}

export async function isAuthenticated(cookies: AstroCookies): Promise<boolean> {
  const raw = cookies.get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const [ts, sig] = raw.split(".");
  if (!ts || !sig) return false;
  const expected = await sign(ts);
  if (expected !== sig) return false;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age > COOKIE_MAX_AGE * 1000) return false;
  return true;
}
