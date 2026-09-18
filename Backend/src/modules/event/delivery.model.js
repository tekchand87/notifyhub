// src/modules/event/delivery.model.js
// One Delivery document = one delivery attempt for one Event.
// Phase 9 will add attempt-count-based retry; this model already supports it.

import mongoose from "mongoose";
import { EVENT_CHANNELS_VALUES } from "./event.constants.js";

const deliverySchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      required: true,
      index: true,
    },

    attemptNumber: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },

    channel: {
      type: String,
      enum: EVENT_CHANNELS_VALUES,
      required: true,
    },

    // "success" | "failed"
    status: {
      type: String,
      enum: ["success", "failed"],
      required: true,
    },

    // Provider/SMTP response text (not a numeric HTTP code for SMTP)
    providerResponse: {
      type: String,
      default: null,
    },

    // Nodemailer messageId for traceability
    messageId: {
      type: String,
      default: null,
    },

    // Error message if status === "failed"
    errorMessage: {
      type: String,
      default: null,
    },

    attemptedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Efficiently list all attempts for an event
deliverySchema.index({ tenantId: 1, eventId: 1, attemptedAt: -1 });

export const Delivery = mongoose.model("Delivery", deliverySchema);
