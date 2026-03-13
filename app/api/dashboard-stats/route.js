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
      .toArray();

    const totalAnalyses = analyses.length;
    const fakeCount = analyses.filter(a => a.result?.isLikelyFake === true).length;
    const authenticCount = totalAnalyses - fakeCount;

    return NextResponse.json({
      totalAnalyses,
      fakeCount,
      authenticCount,
      quizAccuracy: 0,
      totalQuizQuestionsAnswered: 0
    });

  } catch (error) {
    console.error("Dashboard stats error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
