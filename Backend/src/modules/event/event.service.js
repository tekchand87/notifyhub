import mongoose from "mongoose";

import { Event } from "./event.model.js";

import {publishEventToKafka} from "../../infrastructure/kafka/event.publisher.js"

import { AppError } from "../../utils/AppError.js";

export const publishEvent = async (tenantId,input) => {
  if (!mongoose.isValidObjectId(tenantId)) {
    throw new AppError(
      "Invalid tenant context",
      401
    );
  }

  const event = await Event.create({
    tenantId,
    type: input.type,
    channel: input.channel,
    payload: input.payload
  });

  try{
    const kafkaResult = await publishEventToKafka(event);
    return {
      eventId : event._id,
      status: event.status,
      createdAt : event.createdAt,
      kafka : kafkaResult
    };
  }
  catch(error){
    throw new AppError("Event was saved but could not be published to kafka",503);
  }
  // return {
  //   eventId: event._id,
  //   status: event.status,
  //   createdAt: event.createdAt
  // };
};


export const listEvents = async (
  tenantId,
  {
    page = 1,
    limit = 20,
    status,
    channel
  } = {}
) => {

  const normalizedPage =
    Math.max(Number(page) || 1, 1);

  const normalizedLimit =
    Math.min(
      Math.max(Number(limit) || 20, 1),
      100
    );

  const skip =
    (normalizedPage - 1) *
    normalizedLimit;

  const filter = {
    tenantId
  };

  if (status) {
    filter.status = status;
  }

  if (channel) {
    filter.channel = channel;
  }

  const [events, total] =
    await Promise.all([
      Event.find(filter)
        .select(
          "type channel payload status createdAt updatedAt"
        )
        .sort({
          createdAt: -1,
          _id: -1
        })
        .skip(skip)
        .limit(normalizedLimit)
        .lean(),

      Event.countDocuments(filter)
    ]);

  return {
    events,

    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      total,
      totalPages:
        Math.ceil(
          total / normalizedLimit
        )
    }
  };
};


export const getEvent = async (
  tenantId,
  eventId
) => {

  if (
    !mongoose.isValidObjectId(eventId)
  ) {
    throw new AppError(
      "Invalid event id",
      400
    );
  }

  const event = await Event.findOne({
    _id: eventId,
    tenantId
  })
    .select(
      "type channel payload status createdAt updatedAt"
    )
    .lean();

  if (!event) {
    throw new AppError(
      "Event not found",
      404
    );
  }

  return event;
};