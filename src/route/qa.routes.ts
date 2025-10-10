import { Router } from "express";
import { authenticateJWT } from "../middleware/auth.middleware";
import {
  submitQuestion,
  getQuestions,
  upvoteQuestion,
  answerQuestion,
  togglePinQuestion,
  deleteQuestion,
  exportQuestions,
} from "../controller/qa.controller";

const router = Router();

// Public route to get questions
router.get("/:webinarId/questions", getQuestions);

// Protected routes
router.use(authenticateJWT);

router.post("/:webinarId/questions", submitQuestion);
router.post("/questions/:questionId/upvote", upvoteQuestion);
router.post("/questions/:questionId/answer", answerQuestion);
router.post("/questions/:questionId/pin", togglePinQuestion);
router.delete("/questions/:questionId", deleteQuestion);
router.get("/:webinarId/questions/export", exportQuestions);

export default router;
