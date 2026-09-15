let currentScope = "";
export function setAccessScope(value: string) {
  currentScope = value;
}
export function installAccessFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const local = url.startsWith("/api/");
    if (!local) return original(input, init);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (currentScope && !url.startsWith("/api/auth/"))
      headers.set("X-Access-Scope", currentScope);
    const response = await original(input, {
      ...init,
      headers,
      cache: "no-store",
    });
    const next = response.headers.get("X-Access-Scope");
    if (
      currentScope &&
      next &&
      next !== currentScope &&
      !url.startsWith("/api/auth/")
    ) {
      currentScope = "";
      sessionStorage.removeItem("stint-bootstrap-cache");
      window.location.replace(
        window.location.pathname.startsWith("/staff") ? "/staff/overview" : "/",
      );
    }
    return response;
  };
}
