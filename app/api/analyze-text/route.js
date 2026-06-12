import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";

const client = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: process.env.GITHUB_TOKEN,
});

const createErrorResponse = (message, status) => {
    console.error(`[API/analyze-text] Error: ${message}`);
    return NextResponse.json({ error: message }, { status });
};

async function searchRecentNews(query) {
    try {
        if (!process.env.GNEWS_API_KEY) return [];
        const q = encodeURIComponent(query.substring(0, 100));
        const url = `https://gnews.io/api/v4/search?q=${q}&lang=en&max=5&sortby=publishedAt&apikey=${process.env.GNEWS_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) return [];
        const data = await res.json();
        return data.articles || [];
    } catch (e) {
        console.error("[GNews] Error:", e);
        return [];
    }
}

function buildNewsContext(articles) {
    if (!articles || articles.length === 0) return "";
    const lines = articles.map((a, i) =>
        `[${i + 1}] "${a.title}" — ${a.source?.name || "Unknown"} (${a.publishedAt?.substring(0, 10) || "?"}) — ${a.description || ""}`
    );
    return `\n\n--- REAL-TIME NEWS CONTEXT ---\n${lines.join("\n")}\n--- END CONTEXT ---`;
}

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

        console.log("[API/analyze-text] Searching recent news context...");
        const recentArticles = await searchRecentNews(text);
        const newsContext = buildNewsContext(recentArticles);
        console.log(`[API/analyze-text] Found ${recentArticles.length} articles.`);

        const response = await client.chat.completions.create({
            model: "gpt-4.1",
            messages: [
                {
                    role: "system",
                    content: `You are a fact-checking assistant with access to real-time news.
Analyze the provided news text and return ONLY a valid JSON object:
{
  "isLikelyFake": boolean,
  "confidence": number (0-100),
  "analysis": "detailed explanation in 2-3 sentences",
  "mainClaims": ["claim1", "claim2"],
  "bias": "left/right/neutral/mixed",
  "tone": "neutral/sensational/alarming/informative",
  "sensationalism": "low/medium/high",
  "logicalFallacies": ["fallacy1"],
  "sourceCredibility": "high/medium/low/unknown"
}
IMPORTANT: If real-time context is provided, USE IT to verify claims.
If context CONFIRMS the claim → isLikelyFake: false.
If context CONTRADICTS the claim → isLikelyFake: true.
No text outside the JSON.`
                },
                {
                    role: "user",
                    content: `Analyze this news text:\n\n"${text}"${newsContext}`
                }
            ],
            temperature: 0.1,
            max_tokens: 2000,
        });

        const content = response.choices[0].message.content;
        const result = JSON.parse(content.replace(/```json\n?|```/g, "").trim());

        if (recentArticles.length > 0) {
            result.contextSources = recentArticles.slice(0, 3).map(a => ({
                title: a.title,
                source: a.source?.name || "Unknown",
                date: a.publishedAt?.substring(0, 10),
                url: a.url,
            }));
        }

        if (session?.user?.email) {
            try {
                const mongoClient = await clientPromise;
                const db = mongoClient.db("fake-news-detector");
                await db.collection("analyses").insertOne({
                    userEmail: session.user.email,
                    text: text.substring(0, 500),
                    source: source || "text",
                    result,
                    createdAt: new Date(),
                });
            } catch (dbError) {
                console.error("[API/analyze-text] DB error:", dbError);
            }
        }

        return NextResponse.json(result);

    } catch (error) {
        console.error("[API/analyze-text] ❌ Error:", error);
        if (error.status === 401) return createErrorResponse("GitHub token is invalid or expired.", 401);
        if (error.status === 429) return createErrorResponse("Rate limit exceeded. Try again later.", 429);
        return createErrorResponse(error.message || "An error occurred during analysis.", 500);
    }
}
