import { NextResponse } from "next/server";
import OpenAI from "openai";
import * as cheerio from "cheerio";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";

// Configuration GitHub Models
const client = new OpenAI({
  baseURL: "https://models.inference.ai.azure.com",
  apiKey: process.env.GITHUB_TOKEN,
});

const createErrorResponse = (message, status) => {
  console.error(`[API/analyze-url] Error: ${message}`);
  return NextResponse.json({ error: message }, { status });
};

// --- FONCTION DE NETTOYAGE CRITIQUE ---
const cleanJsonString = (str) => {
  if (!str) return "{}";
  // Enlève les ```json au début et les ``` à la fin
  return str.replace(/```json\n?|```/g, "").trim();
};

export async function POST(request) {
  const session = await getServerSession(authOptions);

  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return createErrorResponse("URL is required.", 400);
    }

    if (!process.env.GITHUB_TOKEN) {
      return createErrorResponse("GitHub token not configured.", 500);
    }

    console.log(`[API/analyze-url] Fetching URL: ${url}`);

    // On ajoute un User-Agent pour éviter d'être bloqué par certains sites
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
       return createErrorResponse("Impossible d'accéder au site (Site protégé ou lien invalide).", 400);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // Nettoyage du HTML inutile
    $("script, style, nav, footer, header, aside, iframe").remove();
    const text = $("body").text().trim().replace(/\s+/g, " ").substring(0, 6000);

    if (!text || text.length < 50) {
      return createErrorResponse("Could not extract meaningful content from URL.", 400);
    }

    console.log("[API/analyze-url] Analyzing extracted text...");

    const aiResponse = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are a fact-checking assistant. Analyze the provided news text. Return ONLY a valid JSON object (no markdown) with this exact structure:
{
  "isLikelyFake": boolean,
  "confidence": number (0-100),
  "analysis": "detailed explanation",
  "mainClaims": ["claim1", "claim2"],
  "bias": "left/right/neutral/mixed",
  "tone": "neutral/sensational/alarming/informative",
  "sensationalism": "low/medium/high",
  "logicalFallacies": ["fallacy1"],
  "sourceCredibility": "high/medium/low/unknown"
}`
        },
        {
          role: "user",
          content: `Analyze this news text from ${url}: "${text}"`
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
    });

    // --- C'EST ICI QUE LA MAGIE OPÈRE ---
    const rawContent = aiResponse.choices[0].message.content;
    const cleanContent = cleanJsonString(rawContent); // On nettoie le Markdown
    
    let result;
    try {
        result = JSON.parse(cleanContent);
    } catch (parseError) {
        console.error("JSON Parse Error. Raw:", rawContent);
        return createErrorResponse("Erreur de lecture de la réponse IA.", 500);
    }

    result.sourceUrl = url;

    // Sauvegarde en DB
    if (session?.user?.email) {
      try {
        const mongoClient = await clientPromise;
        const db = mongoClient.db("fake-news-detector");
        await db.collection("analyses").insertOne({
          userEmail: session.user.email,
          url: url,
          text: text.substring(0, 500),
          source: "url",
          result: result,
          createdAt: new Date(),
        });
      } catch (e) { console.error("DB Error", e); }
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("[API/analyze-url] Error:", error);
    return createErrorResponse(error.message, 500);
  }
}
