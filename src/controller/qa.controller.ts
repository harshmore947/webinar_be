import { Request, Response } from "express";
import { Types } from "mongoose";
import Question from "../models/Question.model";
import Webinar from "../models/Webinar.model";
import { AuthRequest } from "../middleware/auth.middleware";

// Submit a question
export const submitQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const { webinarId } = req.params;
    const { question } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ message: "Question is required" });
    }

    // Check if webinar exists
    const webinar = await Webinar.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({ message: "Webinar not found" });
    }

    // Check if Q&A is enabled
    if (!webinar.enableQA) {
      return res
        .status(403)
        .json({ message: "Q&A is not enabled for this webinar" });
    }

    // Create question
    const newQuestion = new Question({
      webinarId,
      userId,
      question: question.trim(),
      status: "approved", // Auto-approve
    });

    await newQuestion.save();
    await newQuestion.populate("userId", "firstName lastName email");

    res.status(201).json({
      message: "Question submitted successfully",
      question: newQuestion,
    });
  } catch (error) {
    console.error("Error submitting question:", error);
    res.status(500).json({ message: "Failed to submit question" });
  }
};

// Get all questions for a webinar
export const getQuestions = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const { sort = "popular" } = req.query;

    let sortOption: any = {};

    if (sort === "popular") {
      sortOption = { isPinned: -1, upvoteCount: -1, createdAt: -1 };
    } else if (sort === "recent") {
      sortOption = { isPinned: -1, createdAt: -1 };
    } else if (sort === "answered") {
      sortOption = { isPinned: -1, answeredAt: -1 };
    }

    const questions = await Question.find({
      webinarId,
      status: { $ne: "hidden" },
    })
      .sort(sortOption)
      .populate("userId", "firstName lastName email")
      .populate("answeredBy", "firstName lastName email");

    res.status(200).json({ questions });
  } catch (error) {
    console.error("Error fetching questions:", error);
    res.status(500).json({ message: "Failed to fetch questions" });
  }
};

// Upvote a question
export const upvoteQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Check if user already upvoted
    const hasUpvoted = question.upvotes.some(
      (id) => id.toString() === userId.toString()
    );

    if (hasUpvoted) {
      // Remove upvote
      question.upvotes = question.upvotes.filter(
        (id) => id.toString() !== userId.toString()
      );
    } else {
      // Add upvote
      question.upvotes.push(new Types.ObjectId(userId));
    }

    await question.save();
    await question.populate("userId", "firstName lastName email");
    await question.populate("answeredBy", "firstName lastName email");

    res.status(200).json({
      message: hasUpvoted ? "Upvote removed" : "Question upvoted",
      question,
    });
  } catch (error) {
    console.error("Error upvoting question:", error);
    res.status(500).json({ message: "Failed to upvote question" });
  }
};

// Answer a question (host/moderator only)
export const answerQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const { questionId } = req.params;
    const { answer } = req.body;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!answer || answer.trim().length === 0) {
      return res.status(400).json({ message: "Answer is required" });
    }

    const question = await Question.findById(questionId).populate("webinarId");
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Check if user is host or moderator
    const webinar = question.webinarId as any;
    const isHost = webinar.hostId.toString() === userId.toString();
    const isModerator = webinar.moderators.some(
      (mod: any) => mod.toString() === userId.toString()
    );

    if (!isHost && !isModerator) {
      return res
        .status(403)
        .json({ message: "Only host or moderators can answer questions" });
    }

    question.answer = answer.trim();
    question.answeredBy = new Types.ObjectId(userId);
    question.answeredAt = new Date();
    question.status = "answered";

    await question.save();
    await question.populate("userId", "firstName lastName email");
    await question.populate("answeredBy", "firstName lastName email");

    res.status(200).json({
      message: "Question answered successfully",
      question,
    });
  } catch (error) {
    console.error("Error answering question:", error);
    res.status(500).json({ message: "Failed to answer question" });
  }
};

// Pin/unpin a question (host/moderator only)
export const togglePinQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const question = await Question.findById(questionId).populate("webinarId");
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Check if user is host or moderator
    const webinar = question.webinarId as any;
    const isHost = webinar.hostId.toString() === userId.toString();
    const isModerator = webinar.moderators.some(
      (mod: any) => mod.toString() === userId.toString()
    );

    if (!isHost && !isModerator) {
      return res
        .status(403)
        .json({ message: "Only host or moderators can pin questions" });
    }

    question.isPinned = !question.isPinned;
    await question.save();
    await question.populate("userId", "firstName lastName email");
    await question.populate("answeredBy", "firstName lastName email");

    res.status(200).json({
      message: question.isPinned ? "Question pinned" : "Question unpinned",
      question,
    });
  } catch (error) {
    console.error("Error toggling pin:", error);
    res.status(500).json({ message: "Failed to toggle pin" });
  }
};

// Delete a question (host/moderator/author only)
export const deleteQuestion = async (req: AuthRequest, res: Response) => {
  try {
    const { questionId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const question = await Question.findById(questionId).populate("webinarId");
    if (!question) {
      return res.status(404).json({ message: "Question not found" });
    }

    // Check if user is author, host, or moderator
    const webinar = question.webinarId as any;
    const isAuthor = question.userId.toString() === userId.toString();
    const isHost = webinar.hostId.toString() === userId.toString();
    const isModerator = webinar.moderators.some(
      (mod: any) => mod.toString() === userId.toString()
    );

    if (!isAuthor && !isHost && !isModerator) {
      return res
        .status(403)
        .json({ message: "Unauthorized to delete this question" });
    }

    await Question.findByIdAndDelete(questionId);

    res.status(200).json({ message: "Question deleted successfully" });
  } catch (error) {
    console.error("Error deleting question:", error);
    res.status(500).json({ message: "Failed to delete question" });
  }
};

// Export Q&A for a webinar (host only)
export const exportQuestions = async (req: AuthRequest, res: Response) => {
  try {
    const { webinarId } = req.params;
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Check if user is host
    const webinar = await Webinar.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({ message: "Webinar not found" });
    }

    if (webinar.hostId.toString() !== userId.toString()) {
      return res.status(403).json({ message: "Only host can export Q&A" });
    }

    const questions = await Question.find({ webinarId })
      .sort({ isPinned: -1, upvoteCount: -1, createdAt: -1 })
      .populate("userId", "firstName lastName email")
      .populate("answeredBy", "firstName lastName email");

    res.status(200).json({
      webinar: {
        title: webinar.title,
        date: webinar.date,
      },
      questions,
      exportedAt: new Date(),
    });
  } catch (error) {
    console.error("Error exporting questions:", error);
    res.status(500).json({ message: "Failed to export questions" });
  }
};
