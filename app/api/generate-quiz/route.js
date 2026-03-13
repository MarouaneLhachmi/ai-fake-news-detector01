import { NextResponse } from "next/server";
import OpenAI from "openai";

// Configuration GitHub Models
const client = new OpenAI({
  baseURL: "https://models.inference.ai.azure.com",
  apiKey: process.env.GITHUB_TOKEN,
});

const createErrorResponse = (message, status) => {
  console.error(`[API/generate-quiz] Error: ${message}`);
  return NextResponse.json({ error: message }, { status });
};

export async function POST(request) {
  try {
    const { topic, difficulty = "medium" } = await request.json();

    if (!process.env.GITHUB_TOKEN) {
      return createErrorResponse("GitHub token not configured.", 500);
    }

    console.log(`[API/generate-quiz] Generating quiz on: ${topic || "general news"}`);

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a quiz generator. Generate a news literacy quiz. Return ONLY a valid JSON object with this structure:
{
  "questions": [
    {
      "question": "Question text",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Explanation of the correct answer"
    }
  ]
}
Generate 5 questions about identifying fake news, media literacy, and fact-checking.`
        },
        {
          role: "user",
          content: `Generate a ${difficulty} difficulty quiz about ${topic || "fake news detection and media literacy"}`
        }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const rawContent = response.choices[0].message.content;
    const cleanContent = rawContent.replace(/```json\n?|```/g, "").trim();
    const result = JSON.parse(cleanContent);
    
    console.log("[API/generate-quiz] ✅ Quiz generated successfully");

    return NextResponse.json(result);

  } catch (error) {
    console.error("[API/generate-quiz] ❌ Error:", error);
    
    if (error.status === 401) {
      return createErrorResponse("GitHub token is invalid or expired.", 401);
    }
    
    if (error.status === 429) {
      return createErrorResponse("Rate limit exceeded. Try again later.", 429);
    }

    return createErrorResponse(
      error.message || "An error occurred during quiz generation.",
      500
    );
  }
}
