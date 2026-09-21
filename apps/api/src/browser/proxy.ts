import http from "node:http";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

export function mountBrowserProxy(app: FastifyInstance, browserUiUrl: string, user: string, password: string) {
  const upstream = new URL(browserUiUrl);
  const prefix = "/browser-ui";
  const authorization = `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;

  const targetPath = (url = "/") => {
    const stripped = url.startsWith(prefix) ? url.slice(prefix.length) : url;
    return stripped || "/";
  };

  async function proxyRequest(request: FastifyRequest, reply: FastifyReply) {
    const path = targetPath(request.raw.url);
    await new Promise<void>((resolve, reject) => {
      const req = http.request(
        { host: upstream.hostname, port: upstream.port || 80, method: request.raw.method, path, headers: { ...request.headers, host: upstream.host, authorization } },
        response => {
          reply.hijack();
          reply.raw.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(reply.raw);
          response.on("end", resolve);
        }
      );
      req.on("error", reject);
      request.raw.pipe(req);
    });
  }

  // Handle both /browser-ui (root) and /browser-ui/* (assets, websocket paths)
  app.all(`${prefix}`, proxyRequest);
  app.all(`${prefix}/*`, proxyRequest);

  app.server.on("upgrade", (request, socket, head) => {
    if (!request.url?.startsWith(`${prefix}/`) && request.url !== prefix) return;
    const path = targetPath(request.url);
    const req = http.request({ host: upstream.hostname, port: upstream.port || 80, method: "GET", path, headers: { ...request.headers, host: upstream.host, authorization, connection: "Upgrade", upgrade: "websocket" } });
    req.on("upgrade", (response, upstreamSocket, upstreamHead) => {
      socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n${Object.entries(response.headers).map(([key, value]) => `${key}: ${value}`).join("\r\n")}\r\n\r\n`);
      if (head.length) upstreamSocket.write(head);
      if (upstreamHead.length) socket.write(upstreamHead);
      upstreamSocket.pipe(socket).pipe(upstreamSocket);
    });
    req.on("error", () => socket.destroy());
    req.end();
  });
}
