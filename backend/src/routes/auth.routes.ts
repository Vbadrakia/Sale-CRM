import { Router } from 'express';
import * as controller from '../controllers/auth.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { validateBody } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { loginLimiter, otpLimiter, passwordResetLimiter } from '../middleware/rateLimit';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resendOtpSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyOtpSchema,
} from '../validators/auth.validators';

const router = Router();

router.post('/login', loginLimiter, validateBody(loginSchema), asyncHandler(controller.login));
router.post('/verify-otp', otpLimiter, validateBody(verifyOtpSchema), asyncHandler(controller.verifyOtp));
router.post('/resend-otp', otpLimiter, validateBody(resendOtpSchema), asyncHandler(controller.resendOtp));
router.post('/forgot-password', passwordResetLimiter, validateBody(forgotPasswordSchema), asyncHandler(controller.forgotPassword));
router.post('/reset-password', passwordResetLimiter, validateBody(resetPasswordSchema), asyncHandler(controller.resetPassword));
router.post('/logout', authenticate, asyncHandler(controller.logout));

router.get('/me', authenticate, asyncHandler(controller.me));
router.patch('/me', authenticate, validateBody(updateProfileSchema), asyncHandler(controller.updateProfile));
router.post('/change-password', authenticate, validateBody(changePasswordSchema), asyncHandler(controller.changePassword));

export default router;
