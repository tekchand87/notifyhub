import * as outboxService from "./outbox.service.js";

export const listOutbox = async (req, res, next) => {
  try {
    const result = await outboxService.listOutboxForTenant(req.user.tenantId, req.query);
    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const replayOutbox = async (req, res, next) => {
  try {
    const result = await outboxService.replayFailedOutboxEvent(
      req.user.tenantId,
      req.params.outboxId,
      req.user._id
    );
    return res.status(202).json({
      success: true,
      message: "Outbox event requeued for Kafka publishing",
      data: { outboxEvent: result },
    });
  } catch (error) {
    next(error);
  }
};
