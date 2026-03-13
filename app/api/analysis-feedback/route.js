import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";

// Configuration GitHub Models
const client = new OpenAI({
  baseURL: "https://models.inference.ai.azure.com",
  apiKey: process.env.GITHUB_TOKEN,
});

const createErrorResponse = (message, status) => {
  console.error(`[API/analysis-feedback] Error: ${message}`);
  return NextResponse.json({ error: message }, { status });
};

export async function POST(request) {
  const session = await getServerSession(authOptions);

  try {
    const { analysisId, feedback, rating } = await request.json();

    if (!feedback || typeof feedback !== "string") {
      return createErrorResponse("Feedback text is required.", 400);
    }

    if (!process.env.GITHUB_TOKEN) {
      return createErrorResponse("GitHub token not configured.", 500);
    }

    console.log("[API/analysis-feedback] Processing user feedback...");

    // Analyser le feedback pour améliorer le système
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a feedback analyzer. Analyze user feedback about fake news detection results. Return ONLY a valid JSON object:
{
  "sentiment": "positive/negative/neutral",
  "category": "accuracy/usability/feature-request/bug/other",
  "priority": "low/medium/high",
  "summary": "Brief summary of the feedback"
}`
        },
        {
          role: "user",
          content: `Analyze this feedback: "${feedback}"`
        }
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const analysis = JSON.parse(response.choices[0].message.content);

    console.log("[API/analysis-feedback] ✅ Feedback analyzed");

    // Sauvegarder en base
    if (session?.user?.email) {
      try {
        const mongoClient = await clientPromise;
        const db = mongoClient.db("fake-news-detector");
        
        await db.collection("feedback").insertOne({
          userEmail: session.user.email,
          analysisId: analysisId,
          feedback: feedback,
          rating: rating,
          analysis: analysis,
          createdAt: new Date(),
        });
      } catch (dbError) {
        console.error("[API/analysis-feedback] Database error:", dbError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Thank you for your feedback!",
      analysis: analysis
    });

  } catch (error) {
    console.error("[API/analysis-feedback] ❌ Error:", error);
    
    if (error.status === 401) {
      return createErrorResponse("GitHub token is invalid or expired.", 401);
    }

    return createErrorResponse(
      error.message || "An error occurred processing feedback.",
      500
    );
  }
}
