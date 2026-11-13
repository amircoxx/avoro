/** Maps public tech discovery and owner-profile endpoints. */
import { Router } from "express";
import { createReview, removeSavedTech, saveTech } from "../controllers/actions.controller";
import { getAvailability, getFeatured, getOwnProfile, getPublicProfile, saveProfile, search } from "../controllers/tech.controller";

export const techRouter = Router();
techRouter.get("/search", search);
techRouter.get("/featured", getFeatured);
techRouter.get("/", getOwnProfile);
techRouter.post("/", saveProfile);
techRouter.put("/:techId/saved", saveTech);
techRouter.delete("/:techId/saved", removeSavedTech);
techRouter.get("/:techId/availability", getAvailability);
techRouter.get("/:techId", getPublicProfile);
techRouter.post("/:techId/reviews", createReview);
