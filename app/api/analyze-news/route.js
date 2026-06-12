import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";

const client = new OpenAI({
    baseURL: "https://models.inference.ai.azure.com",
    apiKey: process.env.GITHUB_TOKEN,
});

const cleanJsonString = (str) => str ? str.replace(/```json\n?|```/g, "").trim() : "{}";

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
        let base64Image = null;
        let imageMimeType = "image/jpeg";
        const contentType = request.headers.get("content-type") || "";

        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const imageFile = formData.get("image");
            if (imageFile && typeof imageFile === "object") {
                const bytes = await imageFile.arrayBuffer();
                base64Image = Buffer.from(bytes).toString("base64");
                imageMimeType = imageFile.type || "image/jpeg";
            }
        } else {
            const body = await request.json();
            if (body.imageUrl) {
                const imgRes = await fetch(body.imageUrl, {
                    headers: { "User-Agent": "Mozilla/5.0" },
                });
                if (!imgRes.ok) {
                    return NextResponse.json(
                        { error: "Could not download the image. Make sure the URL is a direct image link." },
                        { status: 400 }
                    );
                }
                const arrayBuffer = await imgRes.arrayBuffer();
                base64Image = Buffer.from(arrayBuffer).toString("base64");
                imageMimeType = imgRes.headers.get("content-type") || "image/jpeg";
            }
        }

        if (!base64Image) {
            return NextResponse.json({ error: "No image found or could not be processed." }, { status: 400 });
        }

        const imageDataUrl = `data:${imageMimeType};base64,${base64Image}`;

        // ─── ÉTAPE 1 : Extraction rapide du texte pour GNews ─
        console.log("[analyze-news] Step 1: Extracting text from image...");
        let extractedQuery = "";
        try {
            const extractionRes = await client.chat.completions.create({
                model: "gpt-4.1",
                messages: [{
                    role: "user",
                    content: [
                        { type: "text", text: "Extract only the main headline or key text from this news image. Return the text only, no explanation, max 100 characters." },
                        { type: "image_url", image_url: { url: imageDataUrl } }
                    ]
                }],
                max_tokens: 150,
            });
            extractedQuery = extractionRes.choices[0].message.content.trim();
            console.log(`[analyze-news] Extracted query: "${extractedQuery}"`);
        } catch (e) {
            console.error("[analyze-news] Extraction failed, continuing without context:", e);
        }

        // ─── ÉTAPE 2 : Recherche GNews ────────────────────────
        const recentArticles = extractedQuery ? await searchRecentNews(extractedQuery) : [];
        const newsContext = buildNewsContext(recentArticles);
        console.log(`[analyze-news] Found ${recentArticles.length} articles.`);

        // ─── ÉTAPE 3 : Analyse complète avec contexte ─────────
        const response = await client.chat.completions.create({
            model: "gpt-4.1",
            messages: [
                {
                    role: "system",
                    content: `You are an expert fact-checking assistant with access to real-time news.
Analyze the news image and return ONLY a valid JSON object:
{
  "isLikelyFake": boolean,
  "confidence": number (0-100),
  "analysis": "2-3 sentences explaining verdict",
  "extractedText": "text extracted from the image",
  "bias": "Neutral/Left-leaning/Right-leaning",
  "tone": "Neutral/Alarmist/Sensationalist/Informative",
  "sensationalism": "Low/Medium/High",
  "mainClaims": ["claim1", "claim2"],
  "logicalFallacies": [],
  "sources": [{"url": "", "title": ""}]
}
IMPORTANT: If real-time context is provided, USE IT to verify claims.
If context CONFIRMS → isLikelyFake: false.
If context CONTRADICTS → isLikelyFake: true.
No text outside the JSON.`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: `Analyze this news image for fake news indicators.${newsContext}` },
                        { type: "image_url", image_url: { url: imageDataUrl } }
                    ]
                }
            ],
            max_tokens: 2000,
        });

        const raw = response.choices[0].message.content;
        const result = JSON.parse(cleanJsonString(raw));

        if (recentArticles.length > 0) {
            result.contextSources = recentArticles.slice(0, 3).map(a => ({
                title: a.title,
                source: a.source?.name || "Unknown",
                date: a.publishedAt?.substring(0, 10),
                url: a.url,
            }));
        }

        try {
            const client2 = await clientPromise;
            const db = client2.db("fake-news-detector");
            const doc = {
                userEmail: session?.user?.email || null,
                source: "image",
                result,
                createdAt: new Date(),
            };
            const inserted = await db.collection("analyses").insertOne(doc);
            result.id = inserted.insertedId.toString();
        } catch (dbErr) {
            console.error("DB save error:", dbErr);
        }

        return NextResponse.json(result);

    } catch (error) {
        console.error("[analyze-news] error:", error);
        const msg = error.message || "";
        if (msg.includes("filtered") || msg.includes("content management")) {
            return NextResponse.json(
                { error: "This image was blocked by the content filter. Try with a different image." },
                { status: 400 }
            );
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";

const client = new OpenAI({
  baseURL: "https://models.inference.ai.azure.com",
  apiKey: process.env.GITHUB_TOKEN,
});

const cleanJsonString = (str) => str ? str.replace(/```json\n?|```/g, "").trim() : "{}";

export async function POST(request) {
  const session = await getServerSession(authOptions);
  try {
    let base64Image = null;
    let imageMimeType = "image/jpeg";
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const imageFile = formData.get("image");
      if (imageFile && typeof imageFile === "object") {
        const bytes = await imageFile.arrayBuffer();
        base64Image = Buffer.from(bytes).toString("base64");
        imageMimeType = imageFile.type || "image/jpeg";
      }
    } else {
      const body = await request.json();
      if (body.imageUrl) {
        const imgRes = await fetch(body.imageUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        if (!imgRes.ok) {
          return NextResponse.json(
            { error: "Could not download the image. Make sure the URL is a direct image link (.jpg, .png, .webp...)" },
            { status: 400 }
          );
        }
        const arrayBuffer = await imgRes.arrayBuffer();
        base64Image = Buffer.from(arrayBuffer).toString("base64");
        imageMimeType = imgRes.headers.get("content-type") || "image/jpeg";
      }
    }

    if (!base64Image) {
      return NextResponse.json({ error: "No image found or could not be processed." }, { status: 400 });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4.1",
      messages: [
        {
          role: "system",
          content: `You are an expert fact-checking assistant that analyzes images containing news headlines or articles.
You MUST return ONLY a valid JSON object with NO markdown, NO backticks, NO extra text.
The JSON must have EXACTLY these fields:
{
  "isLikelyFake": boolean,
  "confidence": number (0-100),
  "analysis": string (2-3 sentences explaining your verdict),
  "extractedText": string (text extracted from the image),
  "bias": string (e.g. "Neutral", "Left-leaning", "Right-leaning"),
  "tone": string (e.g. "Neutral", "Alarmist", "Sensationalist", "Informative"),
  "sensationalism": string (e.g. "Low", "Medium", "High"),
  "mainClaims": array of strings (key claims found in the image),
  "logicalFallacies": array of strings (any fallacies detected, empty array if none),
  "sources": array of objects with { "url": string, "title": string } (relevant verification sources)
}`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this image for fake news indicators and return the JSON as specified." },
            { type: "image_url", image_url: { url: `data:${imageMimeType};base64,${base64Image}` } }
          ]
        }
      ],
      max_tokens: 2000,
    });

    const raw = response.choices[0].message.content;
    const result = JSON.parse(cleanJsonString(raw));

    // Save to MongoDB
    try {
      const client2 = await clientPromise;
      const db = client2.db("fake-news-detector");
      const doc = {
        userEmail: session?.user?.email || null,
        source: "image",
        result,
        createdAt: new Date(),
      };
      const inserted = await db.collection("analyses").insertOne(doc);
      result.id = inserted.insertedId.toString();
    } catch (dbErr) {
      console.error("DB save error:", dbErr);
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error("[analyze-news] error:", error);
    const msg = error.message || "";
    if (msg.includes("filtered") || msg.includes("content management")) {
      return NextResponse.json(
        { error: "⚠️ This image was blocked by the content filter. Try with a different image." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
