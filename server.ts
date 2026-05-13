import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Route: The Sophisticated Bridge
  app.get("/api/flights/live", async (req, res) => {
    try {
      const { stdout } = await execAsync("python backend/bridge.py get_all");
      const pythonData = JSON.parse(stdout);

      if (pythonData.error) {
        throw new Error(pythonData.error);
      }

      res.json(pythonData);
    } catch (error: any) {
      console.warn("Python bridge unavailable:", error.message);
      res.status(503).json({
        states: [],
        conflicts: [],
        futureConflicts: [],
        source: "unavailable",
        error: error.message,
      });
    }
  });

  // Vite middleware...
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
