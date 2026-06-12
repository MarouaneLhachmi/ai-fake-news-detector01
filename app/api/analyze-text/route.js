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
  console.error(`[API/analyze-text] Error: ${message}`);
  return NextResponse.json({ error: message }, { status });
};

export async function POST(request) {
  const session = await getServerSession(authOptions);

  try {
    const { text, source } = await request.json();

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return createErrorResponse("Text for analysis is required.", 400);
    }

    if (!process.env.GITHUB_TOKEN) {
      return createErrorResponse("GitHub token not configured.", 500);
    }

    console.log("[API/analyze-text] Starting analysis with GitHub Models...");

    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are a fact-checking assistant. Analyze the provided news text and return ONLY a valid JSON object with this exact structure:
{
  "isLikelyFake": boolean,
  "confidence": number (0-100),
  "analysis": "detailed explanation in 2-3 sentences",
  "mainClaims": ["claim1", "claim2"],
  "bias": "left/right/neutral/mixed",
  "tone": "neutral/sensational/alarming/informative",
  "sensationalism": "low/medium/high",
  "logicalFallacies": ["fallacy1", "fallacy2"],
  "sourceCredibility": "high/medium/low/unknown"
}
Do not include any text outside the JSON object.`
        },
        {
          role: "user",
          content: `Analyze this news text for fake news detection: "${text}"`
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    const content = response.choices[0].message.content;
    const result = JSON.parse(content);
    
    console.log("[API/analyze-text] ✅ Analysis completed");

    if (session?.user?.email) {
      try {
        const mongoClient = await clientPromise;
        const db = mongoClient.db("fake-news-detector");
        
        await db.collection("analyses").insertOne({
          userEmail: session.user.email,
          text: text.substring(0, 500),
          source: source || "text",
          result: result,
          createdAt: new Date(),
        });
      } catch (dbError) {
        console.error("[API/analyze-text] Database error:", dbError);
      }
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("[API/analyze-text] ❌ Error:", error);
    
    if (error.status === 401) {
      return createErrorResponse("GitHub token is invalid or expired.", 401);
    }
    
    if (error.status === 429) {
      return createErrorResponse("Rate limit exceeded. Try again later.", 429);
    }

    return createErrorResponse(
      error.message || "An error occurred during analysis.",
      500
    );
  }
}
