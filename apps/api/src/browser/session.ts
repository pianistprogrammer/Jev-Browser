import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ActionEnvelope, BrowserSession, PageElement, PageEvidence } from "@jev/contracts";
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
  constructor(private readonly headless = true, private readonly cdpUrl?: string) {}

  private async ensure(): Promise<Page> {
    if (this.page && !this.page.isClosed() && this.browser?.isConnected()) return this.page;
    if (this.launching) return this.launching;
    this.launching = (async () => {
      if (this.cdpUrl && process.env.NODE_ENV !== "test") {
        const endpoint = new URL(this.cdpUrl);
        const response = await fetch(`${endpoint.origin}/json/version`, { signal: AbortSignal.timeout(5000) });
        if (!response.ok) throw new Error("Persistent browser service is unavailable.");
        const version = await response.json() as { webSocketDebuggerUrl?: string };
        if (!version.webSocketDebuggerUrl) throw new Error("Persistent browser CDP did not provide a websocket endpoint.");
        const websocket = version.webSocketDebuggerUrl.replace(/^ws:\/\/[^/]+/, `ws://${endpoint.host}`);
        this.browser = await chromium.connectOverCDP(websocket, { timeout: 10000 });
        this.context = this.browser.contexts()[0];
        if (!this.context) throw new Error("Persistent browser has no context.");
        const pages = this.context.pages().filter(candidate => !candidate.isClosed());
        this.page = pages.at(-1) ?? await this.context.newPage();
      } else {
        this.browser = await chromium.launch({ headless: this.headless });
        this.context = await this.browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", acceptDownloads: false, serviceWorkers: "block" });
        this.page = await this.context.newPage();
      }
      await this.context.route("**/*", async route => {
        if (route.request().isNavigationRequest()) {
          try { validateNavigationUrl(route.request().url(), false); }
          catch { await route.abort("blockedbyclient"); return; }
        }
        await route.continue();
      });
      return this.page;
    })();
    try { return await this.launching; } finally { this.launching = undefined; }
  }

  private async updateSession(page: Page): Promise<BrowserSession> {
    this.session = {
      id: this.session?.id ?? crypto.randomUUID(),
      url: page.url(),
      title: (await page.title()) || page.url(),
      connected: true,
      lastUpdatedAt: new Date().toISOString(),
      screenshot: "",
    };
    this.session.screenshot = `data:image/jpeg;base64,${(await this.screenshot()).toString("base64")}`;
    return { ...this.session };
  }

  async open(url: string): Promise<BrowserSession> {
    validateNavigationUrl(url, false);
    const page = await this.ensure();
    let response;
    try {
      response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("timeout") || msg.includes("Timeout") || msg.includes("aborted")) {
        return { ...(this.session ?? { id: crypto.randomUUID(), connected: true, screenshot: "" }), url: page.url() || url, title: "Page timed out — try a different link", lastUpdatedAt: new Date().toISOString() } as BrowserSession;
      }
      throw err;
    }
    // Treat 4xx/5xx as soft failures — let Qwen pick a different link
    const status = response?.status() ?? 200;
    if (status === 401 || status === 403 || status === 429) {
      return { ...(this.session ?? { id: crypto.randomUUID(), connected: true, screenshot: "" }), url: page.url(), title: `Access denied (${status}) — try a different link`, lastUpdatedAt: new Date().toISOString() } as BrowserSession;
    }
    if (response && !response.ok() && status !== 404) throw new Error(`The page returned HTTP ${status}.`);
    validateNavigationUrl(page.url(), false);
    try {
      await page.locator("body").waitFor({ state: "visible", timeout: 5000 });
    } catch { /* body may not appear on some pages — continue anyway */ }
    return this.updateSession(page);
  }

  private async element(ref: string) {
    const page = await this.ensure();
    const locator = page.locator(`[data-agent-ref="${ref}"]`);
    if (await locator.count() !== 1) throw new Error("Stale element reference. Take a fresh browser snapshot and use its references.");
    return locator;
  }

  async execute(action: ActionEnvelope): Promise<BrowserSession> {
    if (action.requiresApproval) throw new Error("This action requires approval and cannot run here.");
    if (action.kind === "navigate" || action.kind === "browser_open") {
      const url = action.target ?? action.args.url;
      if (!url) throw new Error(`${action.kind} requires a URL.`);
      return this.open(url);
    }
    const page = await this.ensure();
    switch (action.kind) {
      case "extract":
      case "browser_snapshot":
        await page.locator("body").innerText();
        return this.updateSession(page);
      case "browser_click":
        await (await this.element(action.args.ref ?? "")).click({ timeout: 5000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
        return this.updateSession(page);
      case "browser_type": {
        const input = await this.element(action.args.ref ?? "");
        await input.fill(action.args.text ?? "", { timeout: 5000 });
        if (action.args.submit === "true") await input.press("Enter", { timeout: 5000 });
        await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
        return this.updateSession(page);
      }
      case "browser_key":
        await page.keyboard.press(action.args.key ?? "Enter");
        await page.waitForTimeout(200);
        return this.updateSession(page);
      case "browser_scroll":
        await page.mouse.wheel(0, Number(action.args.pixels ?? 0));
        await page.waitForTimeout(200);
        return this.updateSession(page);
      case "browser_switch_tab": {
        const target = this.context?.pages()[Number(action.args.index ?? 0)];
        if (!target) throw new Error("Unknown tab index. Take a fresh browser snapshot.");
        await target.bringToFront();
        this.page = target;
        return this.updateSession(target);
      }
      default:
        throw new Error(`Unsupported browser action: ${action.kind}`);
    }
  }

  async observe(): Promise<PageEvidence> {
    const page = await this.ensure();
    const elements = await page.locator("a[href],button,input,textarea,select,[role=button],[role=combobox],[contenteditable=true]").evaluateAll(nodes => nodes
      .filter(node => {
        const style = getComputedStyle(node);
        return node.getClientRects().length > 0 && style.visibility !== "hidden" && style.display !== "none" && !node.closest("[inert],[aria-hidden=true]");
      })
      .slice(0, 120)
      .map((node, index) => {
        const element = node as HTMLElement;
        const input = node as HTMLInputElement;
        const ref = `e${index + 1}`;
        element.setAttribute("data-agent-ref", ref);
        const tag = element.tagName.toLowerCase();
        const kind: PageElement["kind"] = tag === "a" ? "link" : tag === "button" || element.getAttribute("role") === "button" ? "button" : tag === "textarea" ? "textarea" : tag === "select" ? "select" : element.isContentEditable ? "contenteditable" : "input";
        const label = (element.getAttribute("aria-label") || input.labels?.[0]?.textContent || element.innerText || input.placeholder || input.value || element.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 180);
        return { ref, label, kind, inputType: input.type || undefined, disabled: Boolean(input.disabled) };
      }));
    const links = await page.locator("a[href]").evaluateAll(nodes => nodes
      .filter(node => node.getClientRects().length > 0)
      .map(node => ({ title: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200), url: (node as HTMLAnchorElement).href }))
      .filter(link => link.title && link.url.startsWith("https://")).slice(0, 100));
    const stories = new URL(page.url()).hostname === "news.ycombinator.com"
      ? await page.locator(".athing .titleline > a").evaluateAll(nodes => nodes.slice(0, 10).map(node => ({ title: node.textContent?.trim() || "", url: (node as HTMLAnchorElement).href })).filter(link => /^https?:/.test(link.url)))
      : [];
    return {
      url: page.url(), title: await page.title(), text: (await page.locator("body").innerText()).slice(0, 14000), links, stories, elements,
      tabs: (this.context?.pages() ?? []).map((tab, index) => ({ index, url: tab.url(), active: tab === page })), capturedAt: new Date().toISOString(),
    };
  }

  async screenshot(): Promise<Buffer> {
    const page = await this.ensure();
    if (!this.frame) this.frame = page.screenshot({ type: "jpeg", quality: 76, timeout: 10000 }).finally(() => { this.frame = undefined; });
    return this.frame;
  }

  status() { return { active: Boolean(this.browser?.isConnected() && this.page && !this.page.isClosed()), url: this.page?.url() ?? "", title: this.session?.title ?? "" }; }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined; this.context = undefined; this.page = undefined; this.session = undefined;
  }
}
