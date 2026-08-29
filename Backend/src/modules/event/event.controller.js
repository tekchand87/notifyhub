import * as eventService
  from "./event.service.js";


export const publishEvent = async (
  req,
  res,
  next
) => {
  try {

    const result =
      await eventService.publishEvent(
        req.tenantId,
        req.body
      );

    return res
      .status(202)
      .json({
        success: true,
        message: "Event accepted",
        data: result
      });

  } catch (error) {
    next(error);
  }
};


export const listEvents = async (
  req,
  res,
  next
) => {
  try {

    const result =
      await eventService.listEvents(
        req.user.tenantId,
        req.query
      );

    return res
      .status(200)
      .json({
        success: true,
        data: result
      });

  } catch (error) {
    next(error);
  }
};


export const getEvent = async (
  req,
  res,
  next
) => {
  try {

    const result =
      await eventService.getEvent(
        req.user.tenantId,
        req.params.eventId
      );

    return res
      .status(200)
      .json({
        success: true,
        data: {
          event: result
        }
      });

  } catch (error) {
    next(error);
  }
};