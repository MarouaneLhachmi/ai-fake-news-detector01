import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  try {
    const client = await clientPromise;
    const db = client.db("fake-news-detector");
    const analyses = await db.collection("analyses")
      .find({ userEmail: session.user.email })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    const history = analyses.map(a => ({
      _id: a._id,
      id: a._id.toString(),
      source: a.source || "unknown",
      inputValue: a.url || a.text || "Image analysis",
      inputType: a.source === "image" ? "image" : "text",
      result: a.result || {},
      createdAt: a.createdAt,
    }));
    return NextResponse.json(history);
  } catch (error) {
    console.error("History fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch history" }, { status: 500 });
  }
}

export async function DELETE() {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
        return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    try {
        const client = await clientPromise;
        const db = client.db("fake-news-detector");
        await db.collection("analyses").deleteMany({ userEmail: session.user.email });
        return NextResponse.json({ message: "History cleared" }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ error: "Failed to clear history" }, { status: 500 });
    }
}
