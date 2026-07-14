import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `vercel dev` serves the /api functions; `vite` alone won't.
export default defineConfig({
  plugins: [react()],
});
