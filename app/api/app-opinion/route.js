import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";

// POST : soumettre une opinion
export async function POST(request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    try {
        const { opinion } = await request.json();

        if (!opinion || typeof opinion !== 'string' || opinion.trim().length === 0) {
            return NextResponse.json({ error: "Opinion text is required." }, { status: 400 });
        }

        const client = await clientPromise;
        const db = client.db("fake-news-detector");

        await db.collection("app_opinions").insertOne({
            userEmail: session.user.email,
            userName: session.user.name || "Anonymous",
            opinion: opinion.trim(),
            createdAt: new Date(),
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error("[API/app-opinion] Error:", error);
        return NextResponse.json({ error: "An error occurred." }, { status: 500 });
    }
}

// GET : lire les opinions
// Admin → toutes les opinions | User → seulement les siennes
export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.email) {
        return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    try {
        const client = await clientPromise;
        const db = client.db("fake-news-detector");

        const query = session.user.isAdmin ? {} : { userEmail: session.user.email };

        const opinions = await db.collection("app_opinions")
            .find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .toArray();

        return NextResponse.json({ opinions });

    } catch (error) {
        console.error("[API/app-opinion] Error:", error);
        return NextResponse.json({ error: "An error occurred." }, { status: 500 });
    }
}
