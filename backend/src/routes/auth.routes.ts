/** Maps authentication and account endpoints to their controller adapters. */
import { Router } from "express";
import { changePassword, login, logout, me, register, updateAccount, forgotPassword, completePasswordReset } from "../controllers/auth.controller";

export const authRouter = Router();
authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/logout", logout);
authRouter.get("/me", me);
authRouter.put("/account", updateAccount);
authRouter.put("/password", changePassword);
authRouter.post("/forgot-password", forgotPassword);
authRouter.post("/reset-password", completePasswordReset);