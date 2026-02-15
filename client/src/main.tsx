import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

window.addEventListener("vite:preloadError", () => {
  window.location.reload();
});

window.addEventListener("error", (event) => {
  if (
    event.message?.includes("Failed to fetch dynamically imported module") ||
    event.message?.includes("Importing a module script failed") ||
    event.message?.includes("error loading dynamically imported module")
  ) {
    const key = "__td_chunk_reload";
    const last = sessionStorage.getItem(key);
    const now = Date.now();
    if (!last || now - parseInt(last) > 10000) {
      sessionStorage.setItem(key, String(now));
      window.location.reload();
    }
  }
});

createRoot(document.getElementById("root")!).render(<App />);
