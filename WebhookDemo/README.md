# NotifyHub Webhook Receiver Demo

A dependency-free local receiver that lets you demonstrate a real NotifyHub webhook delivery.

```bash
cd WebhookDemo
WEBHOOK_SECRET=local-webhook-demo-secret-2026 npm start
```

Open `http://127.0.0.1:4010`. In NotifyHub, configure this URL for the tenant webhook:

```text
http://127.0.0.1:4010/notifyhub
```

For local testing, NotifyHub must have `WEBHOOK_ALLOW_LOCALHOST=true`. Set the same `WEBHOOK_SECRET` in both applications. The dashboard shows each received delivery ID, event type, payload, and whether the HMAC-SHA256 signature is valid. It stores at most 50 deliveries in memory and intentionally contains no database or external dependencies.

For a presentation, run the demo receiver and NotifyHub side-by-side, configure the endpoint, publish a webhook event, then show the NotifyHub Event status and this dashboard updating with a valid signature.

## Faculty demonstration script

1. Start Docker services, the NotifyHub API, the NotifyHub worker, and this receiver.
2. Open the NotifyHub dashboard and create/use an API key with `events:write`.
3. In Tenant Settings, set the webhook URL to `http://127.0.0.1:4010/notifyhub` and use the shared demo secret.
4. Publish an event with channel `webhook`.
5. Show the NotifyHub Events page changing from `Queued` to `Delivered`.
6. Show this receiver page: the delivery ID, event payload, and green `Valid` signature prove the signed webhook was received.

The important explanation is that NotifyHub does not call the receiver directly from the HTTP request. It stores the event, publishes through Kafka, and the worker performs the signed delivery asynchronously. A failed receiver response can therefore be retried and eventually moved to the DLQ.
