(() => {
  const stored = (() => {
    try { return (typeof localStorage !== "undefined" && localStorage.getItem("lbApiBase")) || ""; } catch { return ""; }
  })();

  const queryOverride = (() => {
    try {
      const sp = new URLSearchParams(String(window.location && window.location.search || ""));
      return String(sp.get("apiBase") || sp.get("api") || "").trim();
    } catch {
      return "";
    }
  })();

  const host = String(window.location && window.location.hostname || "").trim();
  const isLocal =
    window.location && (window.location.protocol === "file:" || host === "localhost" || host === "127.0.0.1");
  const isLoopbackBase = (value) => /^(https?:\/\/)?(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(value || "").trim().replace(/\/+$/, ""));
  const normalizedStored = !isLocal && isLoopbackBase(stored) ? "" : stored;
  const normalizedWindowBase = !isLocal && isLoopbackBase(window.API_BASE_URL || window.LB_API_BASE)
    ? ""
    : (window.API_BASE_URL || window.LB_API_BASE || "");
  const byWindow = normalizedWindowBase || queryOverride || normalizedStored;

  const byOrigin = isLocal
    ? "http://localhost:5000"
    : (window.location && window.location.origin) || "";

  const candidate = byWindow || byOrigin;
  const fallback = String(candidate || byOrigin)
    .trim()
    .replace(/\/+$/, "");

  window.API_BASE_URL = fallback;
  window.LB_API_BASE = fallback;

  if (!isLocal && stored && isLoopbackBase(stored)) {
    try { localStorage.removeItem("lbApiBase"); } catch {}
  }

  if (queryOverride) {
    try { localStorage.setItem("lbApiBase", fallback); } catch {}
  }
})();
