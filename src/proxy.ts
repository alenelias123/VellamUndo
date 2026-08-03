import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit-helper";
import type { RateLimitPolicyName } from "@/lib/rate-limit-config";

function resolvePolicy(pathname: string, method: string): RateLimitPolicyName | null {
  if (pathname === "/api/docs") {
    return null;
  }

  if (pathname === "/api/analytics" && method === "GET") {
    return "analytics";
  }

  if (pathname === "/api/geocode" && method === "GET") {
    return "geocode";
  }

  if (pathname === "/api/incidents" && method === "GET") {
    return "incidents";
  }

  if (pathname === "/api/incidents" && method === "POST") {
    return "incident-create";
  }

  if (/^\/api\/incidents\/[^/]+\/verify$/.test(pathname) && method === "POST") {
    return "incident-verify";
  }

  if (pathname === "/api/route-plan" && method === "POST") {
    return "route-plan";
  }

  if (pathname === "/api/help-requests" && method === "POST") {
    return "help-request";
  }

  if (/^\/api\/reports\/[^/]+$/.test(pathname) && method === "PUT") {
    return "report-edit";
  }

  if (/^\/api\/reports\/[^/]+$/.test(pathname) && method === "DELETE") {
    return "report-delete";
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const policy = resolvePolicy(pathname, request.method);

  if (!policy) {
    return NextResponse.next();
  }

  const result = await checkRateLimit(request, policy);

  if (!result.success && result.response) {
    return result.response;
  }

  const response = NextResponse.next();

  if (result.enabled && result.headers) {
    response.headers.set("X-RateLimit-Limit", result.headers["X-RateLimit-Limit"]);
    response.headers.set("X-RateLimit-Remaining", result.headers["X-RateLimit-Remaining"]);
    response.headers.set("X-RateLimit-Reset", result.headers["X-RateLimit-Reset"]);
  }

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
