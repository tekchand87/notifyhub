import crypto from "node:crypto";
import http from "node:http";

const port = Number(process.env.PORT) || 4010;
const secret = process.env.WEBHOOK_SECRET || "local-webhook-demo-secret-2026";
const maxBodyBytes = Number(process.env.MAX_BODY_BYTES) || 262_144;
const deliveries = [];
const maxStoredDeliveries = 50;

const json = (res, statusCode, value) => {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(value));
};

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>NotifyHub Webhook Receiver</title><style>
body{font:16px system-ui,sans-serif;background:#0b1020;color:#e8edf7;margin:0;padding:32px}main{max-width:1100px;margin:auto}h1{margin-bottom:4px}.status{color:#8ce99a}.flow{display:flex;gap:8px;flex-wrap:wrap;margin:22px 0}.step{background:#151c33;border:1px solid #2b3557;border-radius:8px;padding:12px 16px}.arrow{padding:12px 0;color:#a5b4fc}button{padding:9px 13px;border:0;border-radius:6px;background:#4c6ef5;color:white;font-weight:600;cursor:pointer}.note{background:#111936;border-left:4px solid #748ffc;padding:14px;margin:18px 0}table{margin-top:20px;width:100%;border-collapse:collapse;background:#151c33}th,td{padding:11px;text-align:left;border-bottom:1px solid #2b3557;vertical-align:top}th{color:#a5b4fc}code{font-size:13px}pre{white-space:pre-wrap;max-width:560px;margin:0}.valid{color:#8ce99a}.invalid{color:#ff8787}</style></head>
<body><main><h1>NotifyHub Webhook Receiver</h1><p class="status">● Running on port ${port}; HMAC signature verification is enabled.</p><div class="flow"><div class="step">1. API event</div><div class="arrow">→</div><div class="step">2. MongoDB outbox</div><div class="arrow">→</div><div class="step">3. Kafka</div><div class="arrow">→</div><div class="step">4. Worker</div><div class="arrow">→</div><div class="step">5. Signed webhook</div></div><div class="note"><strong>Demo endpoint:</strong> <code>POST http://127.0.0.1:${port}/notifyhub</code><br><strong>Shared secret:</strong> <code>${secret.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</code><br>Configure this URL and secret in NotifyHub Tenant Settings, then publish a webhook event. This page refreshes automatically.</div><button onclick="load()">Refresh now</button><table><thead><tr><th>Received</th><th>Delivery ID</th><th>Event</th><th>Signature</th><th>Payload</th></tr></thead><tbody id="rows"><tr><td colspan="5">Loading…</td></tr></tbody></table></main>
<script>const esc=v=>String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));async function load(){const data=await fetch('/deliveries').then(r=>r.json());document.querySelector('#rows').innerHTML=data.deliveries.length?data.deliveries.map(d=>'<tr><td>'+esc(new Date(d.receivedAt).toLocaleString())+'</td><td><code>'+esc(d.deliveryId)+'</code></td><td>'+esc(d.eventType)+'</td><td class="'+(d.signatureValid?'valid':'invalid')+'">'+(d.signatureValid?'Valid':'Invalid')+'</td><td><pre>'+esc(JSON.stringify(d.payload,null,2))+'</pre></td></tr>').join(''):'<tr><td colspan="5">No deliveries yet. Send a NotifyHub webhook event.</td></tr>'}load();setInterval(load,3000)</script></body></html>`;

const signaturesMatch = (rawBody, signature) => {
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
};

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(html);
  }
  if (req.method === "GET" && req.url === "/deliveries") return json(res, 200, { deliveries });
  if (req.method !== "POST" || req.url !== "/notifyhub") return json(res, 404, { success: false, message: "Not found" });

  const chunks = [];
  let bytes = 0;
  let rejected = false;
  req.on("data", (chunk) => {
    bytes += chunk.length;
    if (bytes > maxBodyBytes && !rejected) {
      rejected = true;
      json(res, 413, { success: false, message: "Payload too large" });
      req.destroy();
    } else if (!rejected) chunks.push(chunk);
  });
  req.on("end", () => {
    if (rejected) return;
    const rawBody = Buffer.concat(chunks);
    let payload;
    try { payload = JSON.parse(rawBody.toString("utf8")); }
    catch { return json(res, 400, { success: false, message: "Invalid JSON" }); }
    const signatureValid = signaturesMatch(rawBody, req.headers["x-notifyhub-signature"]);
    const delivery = {
      receivedAt: new Date().toISOString(),
      deliveryId: req.headers["x-notifyhub-delivery-id"] || null,
      eventType: req.headers["x-notifyhub-event"] || payload.eventType || null,
      signatureValid,
      payload,
    };
    deliveries.unshift(delivery);
    if (deliveries.length > maxStoredDeliveries) deliveries.length = maxStoredDeliveries;
    console.log(JSON.stringify({ operation: "webhook_received", deliveryId: delivery.deliveryId, eventType: delivery.eventType, signatureValid }));
    if (!signatureValid) return json(res, 401, { success: false, message: "Invalid signature" });
    return json(res, 204, {});
  });
  req.on("error", () => { if (!res.headersSent) json(res, 400, { success: false, message: "Invalid request" }); });
});

server.listen(port, "127.0.0.1", () => console.log(`NotifyHub webhook demo: http://127.0.0.1:${port}`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
process.on("SIGINT", () => server.close(() => process.exit(0)));
