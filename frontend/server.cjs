const http = require("http");
const net = require("net");
const { URL } = require("url");
const next = require("next");

const dev = false;
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const backendHost = process.env.BACKEND_HOST || "127.0.0.1";
const backendPort = Number(process.env.BACKEND_PORT || 8000);
const openWebuiHost = process.env.OPEN_WEBUI_HOST || "127.0.0.1";
const openWebuiPort = Number(process.env.OPEN_WEBUI_PORT || 8080);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

function shouldProxyToBackend(pathname) {
  return (
    pathname === "/health" ||
    pathname === "/docs" ||
    pathname === "/openapi.json" ||
    pathname.startsWith("/api/")
  );
}

function shouldProxyToOpenWebUi(pathname) {
  return pathname === "/open-webui" || pathname.startsWith("/open-webui/");
}

function stripOpenWebUiPrefix(pathname) {
  const stripped = pathname.replace(/^\/open-webui(?=\/|$)/, "");
  return stripped || "/";
}

function buildHeaders(req, targetHost, targetPort) {
  return {
    ...req.headers,
    host: `${targetHost}:${targetPort}`,
    "x-forwarded-host": req.headers.host || "",
    "x-forwarded-proto": "https",
    "x-forwarded-for": req.socket.remoteAddress || "",
  };
}

function proxyHttp(req, res, targetHost, targetPort, targetPath) {
  const proxyReq = http.request(
    {
      hostname: targetHost,
      port: targetPort,
      method: req.method,
      path: targetPath,
      headers: buildHeaders(req, targetHost, targetPort),
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on("error", (error) => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({ detail: `Upstream proxy error: ${error.message}` }));
  });

  req.pipe(proxyReq);
}

function proxyUpgrade(req, socket, head, targetHost, targetPort, targetPath) {
  const upstream = net.connect(targetPort, targetHost, () => {
    const headers = buildHeaders(req, targetHost, targetPort);
    const lines = [`${req.method} ${targetPath} HTTP/${req.httpVersion}`];
    for (const [key, value] of Object.entries(headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const item of value) lines.push(`${key}: ${item}`);
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head && head.length > 0) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });

  upstream.on("error", () => {
    if (socket.writable) {
      socket.write("HTTP/1.1 502 Bad Gateway\r\n\r\n");
      socket.destroy();
    }
  });

  socket.on("error", () => {
    upstream.destroy();
  });
}

app.prepare().then(() => {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const { pathname, search } = requestUrl;

    if (shouldProxyToBackend(pathname)) {
      proxyHttp(req, res, backendHost, backendPort, `${pathname}${search}`);
      return;
    }

    if (shouldProxyToOpenWebUi(pathname)) {
      const targetPath = `${stripOpenWebUiPrefix(pathname)}${search}`;
      proxyHttp(req, res, openWebuiHost, openWebuiPort, targetPath);
      return;
    }

    handle(req, res, requestUrl);
  });

  server.on("upgrade", (req, socket, head) => {
    const requestUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = requestUrl.pathname;
    const search = requestUrl.search;

    if (
      pathname.startsWith("/api/v1/deployments/") &&
      (pathname.endsWith("/ws") || pathname.endsWith("/terminal"))
    ) {
      proxyUpgrade(req, socket, head, backendHost, backendPort, `${pathname}${search}`);
      return;
    }

    socket.destroy();
  });

  server.listen(port, hostname, () => {
    console.log(`> Frontend proxy listening on http://${hostname}:${port}`);
  });
});
