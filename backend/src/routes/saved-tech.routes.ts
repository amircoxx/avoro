/** Maps the saved-tech collection endpoint for authenticated customers. */
import { Router } from "express";
import { listSavedTechs } from "../controllers/saved-tech.controller";

export const savedTechRouter = Router();
savedTechRouter.get("/", listSavedTechs);
