import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ActionEnvelope, BrowserSession, PageEvidence } from "@jev/contracts";
import { validateNavigationUrl } from "../policy/navigation.js";

export interface BrowserSessionDriver {
  open(url: string): Promise<BrowserSession>;
  execute(action: ActionEnvelope): Promise<BrowserSession>;
  observe(): Promise<PageEvidence>;
  screenshot(): Promise<Buffer>;
  status(): { active: boolean; url: string; title: string };
  close(): Promise<void>;
}

export class PlaywrightBrowserSession implements BrowserSessionDriver {
  private browser?: Browser;
  private context?: BrowserContext;
  private page?: Page;
  private session?: BrowserSession;
  private launching?: Promise<Page>;
  private frame?: Promise<Buffer>;
  constructor(private readonly headless = true) {}

  private async ensure(): Promise<Page> {
    if (this.page && !this.page.isClosed() && this.browser?.isConnected()) return this.page;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      this.browser = await chromium.launch({ headless: this.headless });
      this.context = await this.browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", acceptDownloads: false, serviceWorkers: "block" });
      // Check redirects and page-initiated document navigations as well.
      await this.context.route("**/*", async route => {
        if (route.request().isNavigationRequest()) {
          try { validateNavigationUrl(route.request().url(), false); }
          catch { await route.abort("blockedbyclient"); return; }
        }
        await route.continue();
      });
      this.page = await this.context.newPage();
      return this.page;
    })();
    try { return await this.launching; } finally { this.launching = undefined; }
  }

  async open(url: string): Promise<BrowserSession> {
    validateNavigationUrl(url, false);
    const page = await this.ensure();
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    if (response && !response.ok()) throw new Error(`The page returned HTTP ${response.status()}.`);
    validateNavigationUrl(page.url(), false);
    await page.locator("body").waitFor({ state: "visible", timeout: 10000 });
    this.session = {
      id: this.session?.id ?? crypto.randomUUID(), url: page.url(),
      title: (await page.title()) || page.url(), connected: true,
      lastUpdatedAt: new Date().toISOString(), screenshot: "",
    };
    this.session.screenshot = `data:image/jpeg;base64,${(await this.screenshot()).toString("base64")}`;
    return { ...this.session };
  }

  async execute(action: ActionEnvelope): Promise<BrowserSession> {
    if (action.requiresApproval) throw new Error("This action requires approval and cannot run here.");
    if (action.kind === "navigate" && action.target) return this.open(action.target);
    if (action.kind !== "extract") throw new Error(`Unsupported browser action: ${action.kind}`);
    if (!this.session || !this.page || this.page.isClosed()) throw new Error("Browser session is not open.");
    await this.page.locator("body").innerText();
    this.session = { ...this.session, url: this.page.url(), title: await this.page.title(), lastUpdatedAt: new Date().toISOString() };
    return { ...this.session };
  }

  async observe(): Promise<PageEvidence> {
    if (!this.page || this.page.isClosed()) throw new Error("Browser session is not open.");
    const page = this.page;
    const links = await page.locator("a[href]").evaluateAll(elements => elements
      .filter(el => el.getClientRects().length > 0)
      .map(el => ({ title: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200), url: (el as HTMLAnchorElement).href }))
      .filter(link => link.title && link.url.startsWith("https://")).slice(0, 100));
    // These are titles actually rendered by Hacker News, in the displayed order.
    const stories = new URL(page.url()).hostname === "news.ycombinator.com"
      ? await page.locator(".athing .titleline > a").evaluateAll(elements => elements.slice(0, 10).map(el => ({ title: el.textContent?.trim() || "", url: (el as HTMLAnchorElement).href })).filter(link => /^https?:/.test(link.url)))
      : [];
    return { url: page.url(), title: await page.title(), text: (await page.locator("body").innerText()).slice(0, 14000), links, stories, capturedAt: new Date().toISOString() };
  }

  async screenshot(): Promise<Buffer> {
    if (!this.page || this.page.isClosed()) throw new Error("Browser is not open.");
    // Multiple UI readers share one frame capture.
    if (!this.frame) this.frame = this.page.screenshot({ type: "jpeg", quality: 76, timeout: 10000 }).finally(() => { this.frame = undefined; });
    return this.frame;
  }
  status() {
    return { active: Boolean(this.browser?.isConnected() && this.page && !this.page.isClosed()), url: this.page?.url() ?? "", title: this.session?.title ?? "" };
  }
  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined; this.context = undefined; this.page = undefined; this.session = undefined;
  }
}
