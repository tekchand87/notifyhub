// Usage: node src/scripts/backfill-delivery-tenant-id.js [--apply]
// Default is dry-run. Run during a maintenance window before enforcing the
// Delivery.tenantId requirement against an existing production collection.
import "dotenv/config";
import mongoose from "mongoose";
import { Delivery } from "../modules/event/delivery.model.js";
import { Event } from "../modules/event/event.model.js";

const apply = process.argv.includes("--apply");
if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");

await mongoose.connect(process.env.MONGODB_URI);
try {
  const cursor = Delivery.find({ tenantId: { $exists: false } }).select("_id eventId").lean().cursor();
  let scanned = 0;
  let updated = 0;
  let unresolved = 0;
  for await (const delivery of cursor) {
    scanned += 1;
    const event = await Event.findById(delivery.eventId).select("tenantId").lean();
    if (!event?.tenantId) { unresolved += 1; continue; }
    if (apply) {
      await Delivery.updateOne({ _id: delivery._id, tenantId: { $exists: false } }, { $set: { tenantId: event.tenantId } });
      updated += 1;
    }
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", scanned, updated, unresolved }));
  if (unresolved) process.exitCode = 2;
} finally { await mongoose.disconnect(); }
