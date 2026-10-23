import { http as mswHttp, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { server } from "@/shared/config/tests/msw/server";

import { ApiError } from "./api-error";
import { http } from "./http";
import { tokenStorage } from "./token";

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

const onLogout = vi.fn();

beforeEach(() => {
  tokenStorage.set(null);
  tokenStorage.setLogoutHandler(onLogout);
  onLogout.mockClear();
  toastError.mockClear();
});

function meRequiring(token: string) {
  return mswHttp.get("*/me", ({ request }) =>
    request.headers.get("authorization") === `Bearer ${token}`
      ? HttpResponse.json({ id: 1 })
      : new HttpResponse(null, { status: 401 }),
  );
}

describe("http interceptors", () => {
  it("attaches the bearer token", async () => {
    tokenStorage.set("abc");
    server.use(meRequiring("abc"));

    const { data } = await http.get<{ id: number }>("/me");

    expect(data).toEqual({ id: 1 });
  });

  it("refreshes on 401 and retries the original request with the new token", async () => {
    tokenStorage.set("expired");
    server.use(
      mswHttp.post("*/auth/refresh", () => HttpResponse.json({ accessToken: "new" })),
      meRequiring("new"),
    );

    const { data } = await http.get<{ id: number }>("/me");

    expect(data).toEqual({ id: 1 });
    expect(tokenStorage.get()).toBe("new");
  });

  it("refreshes once for parallel 401s", async () => {
    let refreshCalls = 0;
    server.use(
      mswHttp.post("*/auth/refresh", () => {
        refreshCalls++;
        return HttpResponse.json({ accessToken: "new" });
      }),
      meRequiring("new"),
    );

    await Promise.all([http.get("/me"), http.get("/me"), http.get("/me")]);

    expect(refreshCalls).toBe(1);
  });

  it("logs out and rejects with ApiError when the refresh fails", async () => {
    server.use(
      mswHttp.post("*/auth/refresh", () => new HttpResponse(null, { status: 401 })),
      meRequiring("never"),
    );

    await expect(http.get("/me")).rejects.toBeInstanceOf(ApiError);
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("does not loop on a 401 from the refresh endpoint itself", async () => {
    let refreshCalls = 0;
    server.use(
      mswHttp.post("*/auth/refresh", () => {
        refreshCalls++;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(http.post("/auth/refresh")).rejects.toMatchObject({ status: 401 });
    expect(refreshCalls).toBe(1);
    expect(onLogout).not.toHaveBeenCalled();
  });

  it("toasts a 5xx exactly once and rejects with ApiError", async () => {
    server.use(mswHttp.get("*/boom", () => new HttpResponse(null, { status: 503 })));

    await expect(http.get("/boom")).rejects.toMatchObject({ name: "ApiError", status: 503 });
    expect(toastError).toHaveBeenCalledTimes(1);
  });

  it("does not toast a 4xx", async () => {
    server.use(
      mswHttp.get("*/missing", () =>
        HttpResponse.json({ message: "Not found", code: "NOT_FOUND" }, { status: 404 }),
      ),
    );

    await expect(http.get("/missing")).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
      message: "Not found",
    });
    expect(toastError).not.toHaveBeenCalled();
  });
});
