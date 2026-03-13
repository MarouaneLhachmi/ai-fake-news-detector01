import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";

const createErrorResponse = (message, status) => {
  console.error(`[API/quiz-score] Error: ${message}`);
  return NextResponse.json({ error: message }, { status });
};

export async function POST(request) {
  const session = await getServerSession(authOptions);

  try {
    const { score, totalQuestions, correctAnswers, topic, duration } = await request.json();

    if (typeof score !== "number" || score < 0 || score > 100) {
      return createErrorResponse("Invalid score value.", 400);
    }

    if (!session?.user?.email) {
      return createErrorResponse("Authentication required.", 401);
    }

    console.log(`[API/quiz-score] Saving quiz score for user: ${session.user.email}`);

    // Sauvegarder le score en base de données
    try {
      const mongoClient = await clientPromise;
      const db = mongoClient.db("fake-news-detector");
      
      const quizResult = {
        userEmail: session.user.email,
        score: score,
        totalQuestions: totalQuestions || 0,
        correctAnswers: correctAnswers || 0,
        topic: topic || "general",
        duration: duration || 0,
        createdAt: new Date(),
      };

      const result = await db.collection("quiz_scores").insertOne(quizResult);

      console.log("[API/quiz-score] ✅ Quiz score saved successfully");

      // Calculer les statistiques de l'utilisateur
      const userStats = await db.collection("quiz_scores")
        .aggregate([
          { $match: { userEmail: session.user.email } },
          {
            $group: {
              _id: "$userEmail",
              totalQuizzes: { $sum: 1 },
              averageScore: { $avg: "$score" },
              bestScore: { $max: "$score" },
              totalCorrect: { $sum: "$correctAnswers" },
              totalQuestions: { $sum: "$totalQuestions" }
            }
          }
        ])
        .toArray();

      return NextResponse.json({
        success: true,
        message: "Quiz score saved successfully",
        id: result.insertedId,
        stats: userStats[0] || {
          totalQuizzes: 1,
          averageScore: score,
          bestScore: score,
          totalCorrect: correctAnswers,
          totalQuestions: totalQuestions
        }
      });

    } catch (dbError) {
      console.error("[API/quiz-score] Database error:", dbError);
      return createErrorResponse("Failed to save quiz score to database.", 500);
    }

  } catch (error) {
    console.error("[API/quiz-score] ❌ Error:", error);
    
    return createErrorResponse(
      error.message || "An error occurred while saving quiz score.",
      500
    );
  }
}

export async function GET(request) {
  const session = await getServerSession(authOptions);

  try {
    if (!session?.user?.email) {
      return createErrorResponse("Authentication required.", 401);
    }

    console.log(`[API/quiz-score] Fetching quiz history for user: ${session.user.email}`);

    const mongoClient = await clientPromise;
    const db = mongoClient.db("fake-news-detector");
    
    // Récupérer l'historique des scores
    const scores = await db.collection("quiz_scores")
      .find({ userEmail: session.user.email })
      .sort({ createdAt: -1 })
      .limit(20)
      .toArray();

    // Calculer les statistiques
    const stats = await db.collection("quiz_scores")
      .aggregate([
        { $match: { userEmail: session.user.email } },
        {
          $group: {
            _id: "$userEmail",
            totalQuizzes: { $sum: 1 },
            averageScore: { $avg: "$score" },
            bestScore: { $max: "$score" },
            totalCorrect: { $sum: "$correctAnswers" },
            totalQuestions: { $sum: "$totalQuestions" }
          }
        }
      ])
      .toArray();

    console.log("[API/quiz-score] ✅ Quiz history fetched successfully");

    return NextResponse.json({
      success: true,
      scores: scores,
      stats: stats[0] || {
        totalQuizzes: 0,
        averageScore: 0,
        bestScore: 0,
        totalCorrect: 0,
        totalQuestions: 0
      }
    });

  } catch (error) {
    console.error("[API/quiz-score] ❌ Error:", error);
    
    return createErrorResponse(
      error.message || "An error occurred while fetching quiz history.",
      500
    );
  }
}
