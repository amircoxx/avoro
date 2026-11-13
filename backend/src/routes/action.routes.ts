/** Groups mutation and utility endpoints outside the core auth and tech routers. */
import { Router } from "express";
import {
  autocompleteLocation,
  getLocationFromCoords,
  createReferral,
  createUpload,
  removeProfileMedia,
  saveProfileMediaUpload
} from "../controllers/actions.controller";

export const locationRouter = Router();
locationRouter.get("/autocomplete", autocompleteLocation);
locationRouter.get("/coords", getLocationFromCoords);

export const referralRouter = Router();
referralRouter.post("/", createReferral);

export const uploadRouter = Router();
uploadRouter.post("/sign-url", createUpload);
uploadRouter.post("/profile-media", saveProfileMediaUpload);
uploadRouter.delete("/profile-media/:mediaId", removeProfileMedia);
