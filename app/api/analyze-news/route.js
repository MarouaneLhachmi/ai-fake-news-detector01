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
      model: "gpt-4o",
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
