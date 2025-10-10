import { Router } from "express";
import { validate } from "../middleware/validate.middleware";
import {
  ForgotPasswordSchema,
  LoginSchema,
  RegisterSchema,
  ResetPasswordSchema,
  VerifyResetCodeSchema,
} from "../validators/auth.schema";
import {
  forgotPassword,
  getProfile,
  loginUser,
  logoutUser,
  registerUser,
  resetPassword,
  searchUsersAll,
  verifyResetCode,
} from "../controller/auth.controller";
import { authenticateJWT } from "../middleware/auth.middleware";

const router = Router();

// Public auth routes
router.post("/register", validate(RegisterSchema), registerUser);
router.post("/login", validate(LoginSchema), loginUser);
router.post("/forgot-password", validate(ForgotPasswordSchema), forgotPassword);
router.post(
  "/verify-reset-code",
  validate(VerifyResetCodeSchema),
  verifyResetCode
);
router.post("/reset-password", validate(ResetPasswordSchema), resetPassword);

// Protected auth routes
router.post("/logout", authenticateJWT, logoutUser);
router.get("/profile", authenticateJWT, getProfile);
router.get("/users/search", authenticateJWT, searchUsersAll);

export default router;
