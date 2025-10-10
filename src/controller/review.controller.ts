import { Request, Response } from "express";
import { Types } from "mongoose";
import ReviewModel from "../models/Review.model";
import WebinarModel from "../models/Webinar.model";

export const createOrUpdateReview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { webinarId } = req.params;
    const { rating, comment } = req.body;

    console.log("📥 Review request received:", {
      userId,
      webinarId,
      body: req.body,
      rating,
      comment,
      ratingType: typeof rating,
      commentType: typeof comment,
    });

    if (!userId) {
      console.log("❌ Authentication required");
      return res
        .status(401)
        .json({ success: false, msg: "Authentication required" });
    }
    if (!Types.ObjectId.isValid(webinarId)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar ID" });
    }

    const webinar = await WebinarModel.findById(webinarId);
    if (!webinar) {
      return res.status(404).json({ success: false, msg: "Webinar not found" });
    }

    // Only enrolled users can review
    const isEnrolled = webinar.enrolledUsers.some(
      (id) => id.toString() === userId
    );
    if (!isEnrolled) {
      return res.status(403).json({
        success: false,
        msg: "Only enrolled attendees can review",
        error: "NOT_ENROLLED",
      });
    }

    const review = await ReviewModel.findOneAndUpdate(
      { webinarId, userId },
      { rating, comment },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Update webinar aggregates
    const agg = await ReviewModel.aggregate([
      { $match: { webinarId: new Types.ObjectId(webinarId) } },
      {
        $group: {
          _id: "$webinarId",
          avgRating: { $avg: "$rating" },
          count: { $sum: 1 },
        },
      },
    ]);

    const avgRating = agg[0]?.avgRating || 0;
    const reviewCount = agg[0]?.count || 0;
    await WebinarModel.findByIdAndUpdate(webinarId, {
      averageRating: Number(avgRating.toFixed(2)),
      reviewCount,
    });

    res.json({ success: true, review });
  } catch (error) {
    console.error("Error creating/updating review:", error);
    res.status(500).json({ success: false, msg: "Failed to save review" });
  }
};

export const getWebinarReviews = async (req: Request, res: Response) => {
  try {
    const { webinarId } = req.params;
    const { page = 1, limit = 10 } = req.query;

    if (!Types.ObjectId.isValid(webinarId)) {
      return res
        .status(400)
        .json({ success: false, msg: "Invalid webinar ID" });
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [reviews, total] = await Promise.all([
      ReviewModel.find({ webinarId })
        .populate("userId", "firstName lastName email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ReviewModel.countDocuments({ webinarId }),
    ]);

    res.json({
      success: true,
      reviews: reviews.map((r) => ({
        _id: r._id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt,
        user: r.userId,
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ success: false, msg: "Failed to fetch reviews" });
  }
};
