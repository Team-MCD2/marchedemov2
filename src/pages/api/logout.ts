import type { APIRoute } from "astro";
import { logout } from "@/lib/auth";

/**
 * GET/POST /api/logout — clears the admin cookie and redirects to /admin/login.
 *
 * `prerender = false` required in hybrid mode (cf login.ts).
 */
export const prerender = false;

export const GET: APIRoute = ({ redirect, cookies }) => {
  logout(cookies);
  return redirect("/admin/login", 303);
};

export const POST: APIRoute = ({ redirect, cookies }) => {
  logout(cookies);
  return redirect("/admin/login", 303);
};
