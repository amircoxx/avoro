/** Mounts every versionless `/api` resource router in one place. */
import { Router } from "express";
import { authRouter } from "./auth.routes";
import { locationRouter, referralRouter, uploadRouter } from "./action.routes";
import { techRouter } from "./tech.routes";
import { savedTechRouter } from "./saved-tech.routes";
import { scheduleRouter } from "./schedule.routes";
import { bookingRouter } from "./booking.routes";
import { messagingRouter } from "./messaging.routes";
import { purchasesRouter } from "./purchasing.routes"

export const apiRouter = Router();
apiRouter.use("/auth", authRouter);
apiRouter.use("/techs", techRouter);
apiRouter.use("/saved-techs", savedTechRouter);
apiRouter.use("/locations", locationRouter);
apiRouter.use("/referrals", referralRouter);
apiRouter.use("/uploads", uploadRouter);
apiRouter.use("/schedule", scheduleRouter);
apiRouter.use("/bookings", bookingRouter);
apiRouter.use("/messaging", messagingRouter);
apiRouter.use("/purchases", purchasesRouter);