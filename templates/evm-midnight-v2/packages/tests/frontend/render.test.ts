import { assert } from "../helpers.ts";
import path from "path";
import { chromium } from "playwright-core";

const FRONTEND_PORT = 10599;
// Match serialized private-data keys/attributes, not explanatory copy such as
// "bid openings are never exposed" that documents the privacy boundary.
const PRIVATE_DATA = /(?:["'](?:salt|opening|losing[_-]?amount|private[_-]?amount)["']\s*:|data-(?:salt|opening|losing-amount|private-amount)=)/i;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${FRONTEND_PORT}/`);
      if (res.ok) return;
    } catch { /* not ready */ }
    await delay(300);
  }
  throw new Error(`Frontend server did not start within ${timeoutMs / 1000}s`);
}

function findChrome(): string {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
  for (const c of candidates) {
    try {
      if (Bun.file(c).size > 0) return c;
    } catch {}
  }
  throw new Error("Chrome/Chromium not found. Install Chrome or set CHROME_PATH.");
}

export async function frontendRenderTest() {
  const frontendDir = path.resolve(import.meta.dirname!, "../../frontend");
  const proc = Bun.spawn([process.argv0, "run", "server/main.ts"], {
    cwd: frontendDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.exited.then(async (code) => {
    if (code !== 0) {
      const stderr = await new Response(proc.stderr).text();
      console.error(`[RENDER TEST] Server exited with code ${code}:`, stderr.slice(-500));
    }
  });

  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;

  try {
    await waitForServer();

    await assert("Frontend server responds 200 on /", async () => {
      const res = await fetch(`http://localhost:${FRONTEND_PORT}/`);
      return res.status === 200;
    });

    const executablePath = process.env["CHROME_PATH"] || findChrome();
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage();

    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await page.goto(`http://localhost:${FRONTEND_PORT}/`, { waitUntil: "load", timeout: 15_000 });
    await page.waitForSelector(".app-shell", { timeout: 10_000 });

    await assert("ShadowBid browser output does not disclose private bid fields", async () => {
      return !PRIVATE_DATA.test(await page.content());
    });

    await assert("Frontend React app mounts (application shell rendered)", async () => {
      const container = await page.$(".app-shell");
      return container !== null;
    });

    await assert("Frontend renders ShadowBid header", async () => {
      const title = await page.textContent("button.brand");
      return title !== null && title.replace(/\s+/g, "").includes("SHADOWBID");
    });

    await assert("Frontend renders the auction registry", async () => {
      const section = await page.$(".auction-section");
      return section !== null;
    });

    await assert("Frontend has no fatal JS errors", async () => {
      if (jsErrors.length > 0) {
        console.log("\n  JS errors:", jsErrors);
      }
      return jsErrors.length === 0;
    });
  } finally {
    if (browser) await browser.close();
    proc.kill();
  }
}
