import { assert } from "../helpers.ts";
import { chromium } from "playwright-core";
import path from "path";

const FRONTEND_PORT = 10599;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  throw new Error(
    "Chrome/Chromium not found. Install Chrome or set CHROME_PATH.",
  );
}

async function waitForServer(timeoutMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${FRONTEND_PORT}/`);
      if (res.ok) return;
    } catch {}
    await delay(300);
  }
  throw new Error(`Frontend server did not start within ${timeoutMs / 1000}s`);
}

export async function walletConnectTest() {
  const frontendDir = path.resolve(import.meta.dirname!, "../../frontend");
  const proc = Bun.spawn([process.argv0, "run", "server/main.ts"], {
    cwd: frontendDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const executablePath = process.env["CHROME_PATH"] || findChrome();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
  });

  try {
    await waitForServer();

    const page = await browser.newPage();
    await page.goto(`http://localhost:${FRONTEND_PORT}/`, {
      waitUntil: "load",
      timeout: 15_000,
    });
    await page.waitForSelector(".app-shell", { timeout: 10_000 });

    // The ShadowBid header should expose the unified wallet entrypoint.
    await assert(
      "Frontend: header shows Connect wallet button",
      async () => {
        const btn = await page.$(".connect-button");
        return (await btn?.textContent())?.includes("Connect wallet") ?? false;
      },
    );

    // Click the unified entrypoint → modal opens.
    await assert("Frontend: clicking Connect wallet opens wallet modal", async () => {
      const btn = await page.$(".connect-button");
      if (!btn) return false;
      await btn.click();
      await page.waitForSelector(".wallet-modal-overlay", { timeout: 5_000 });
      return true;
    });

    // Modal should show Local Wallet first with RECOMMENDED badge
    await assert(
      "Frontend: wallet modal shows Local Wallet with RECOMMENDED badge",
      async () => {
        const badge = await page.$(".recommended-badge");
        if (!badge) return false;
        const text = await badge.textContent();
        return text?.includes("RECOMMENDED") ?? false;
      },
    );

    // Modal should show the key disclaimer with copy button
    await assert(
      "Frontend: wallet modal shows key disclaimer with copy button",
      async () => {
        const disclaimer = await page.$(".wallet-disclaimer");
        if (!disclaimer) return false;
        const copyBtn = await page.$(".copy-key-btn");
        return copyBtn !== null;
      },
    );

    // Close modal
    await assert("Frontend: can close wallet modal", async () => {
      const closeBtn = await page.$(".wallet-modal-close");
      if (!closeBtn) return false;
      await closeBtn.click();
      await page.waitForSelector(".wallet-modal-overlay", {
        state: "hidden",
        timeout: 3_000,
      });
      return true;
    });

    await assert("Frontend: ShadowBid auction registry remains rendered", async () => {
      return (await page.$(".auction-section")) !== null;
    });
  } finally {
    await browser.close();
    proc.kill();
  }
}
