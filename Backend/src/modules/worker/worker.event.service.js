import mongoose from "mongoose";

import { Event } from "../event/event.model.js";


export const markEventProcessing = async (eventId) => {

  if (!mongoose.isValidObjectId(eventId)) {
    throw new Error(`Invalid eventId: ${eventId}`);
  }

  return Event.findOneAndUpdate(
    {
      _id: eventId,
      status: "queued"
    },
    {
      $set: {
        status: "processing"
      }
    },
    {
      new: true
    }
  );
};


export const markEventDelivered = async (eventId) => {

  return Event.findOneAndUpdate(
    {
      _id: eventId,
      status: "processing"
    },
    {
      $set: {
        status: "delivered"
      }
    },
    {
      new: true
    }
  );
};


export const markEventFailed = async (eventId) => {

  return Event.findOneAndUpdate(
    {
      _id: eventId,
      status: "processing"
    },
    {
      $set: {
        status: "failed"
      }
    },
    {
      new: true
    }
  );
};