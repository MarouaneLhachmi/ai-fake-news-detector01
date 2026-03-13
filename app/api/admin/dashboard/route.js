import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import clientPromise from "@/lib/mongodb";

export async function GET(request) {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userPage = parseInt(searchParams.get('userPage') || '1', 10);
    const feedbackPage = parseInt(searchParams.get('feedbackPage') || '1', 10);
    const analysisPage = parseInt(searchParams.get('analysisPage') || '1', 10);
    const searchTerm = searchParams.get('search') || '';

    const usersLimit = 10;
    const feedbackLimit = 5;
    const analysisLimit = 10;

    try {
        const client = await clientPromise;
        const db = client.db("fake-news-detector"); // FIX: explicitly use correct DB

        const userSearchFilter = searchTerm ? {
            $or: [
                { name: { $regex: searchTerm, $options: 'i' } },
                { email: { $regex: searchTerm, $options: 'i' } }
            ]
        } : {};

        const [
            totalUsers,
            totalAnalyses,       // FIX: count from "analyses" collection directly
            pagedUsers,
            pagedFeedbacks,
            totalFeedbacks,
            pagedAnalyses        // NEW: paginated list of all analyses
        ] = await Promise.all([
            db.collection("users").countDocuments(userSearchFilter),

            // FIX: was querying users.$history (wrong), now queries analyses collection
            db.collection("analyses").countDocuments(),

            db.collection("users")
                .find(userSearchFilter)
                .sort({ createdAt: -1 })
                .skip((userPage - 1) * usersLimit)
                .limit(usersLimit)
                .project({ name: 1, email: 1, createdAt: 1, image: 1 })
                .toArray(),

            db.collection("feedbacks").aggregate([
                { $sort: { createdAt: -1 } },
                { $skip: (feedbackPage - 1) * feedbackLimit },
                { $limit: feedbackLimit },
                {
                    $lookup: {
                        from: "analyses",
                        localField: "analysisId",
                        foreignField: "_id",
                        as: "analysisInfo"
                    }
                },
                { $unwind: { path: "$analysisInfo", preserveNullAndEmptyArrays: true } }
            ]).toArray(),

            db.collection("feedbacks").countDocuments(),

            // NEW: fetch paginated analyses with user info
            db.collection("analyses").aggregate([
                { $sort: { createdAt: -1 } },
                { $skip: (analysisPage - 1) * analysisLimit },
                { $limit: analysisLimit },
                {
                    $lookup: {
                        from: "users",
                        localField: "userEmail",
                        foreignField: "email",
                        as: "userInfo"
                    }
                },
                { $unwind: { path: "$userInfo", preserveNullAndEmptyArrays: true } },
                {
                    $project: {
                        source: 1,
                        url: 1,
                        text: 1,
                        createdAt: 1,
                        userEmail: 1,
                        "result.isLikelyFake": 1,
                        "result.confidenceScore": 1,
                        "result.headline": 1,
                        "userInfo.name": 1,
                        "userInfo.image": 1,
                    }
                }
            ]).toArray()
        ]);

        return NextResponse.json({
            stats: {
                totalUsers,
                totalAnalyses,
            },
            users: {
                list: pagedUsers,
                totalPages: Math.max(1, Math.ceil(totalUsers / usersLimit)),
                currentPage: userPage,
            },
            feedback: {
                list: pagedFeedbacks,
                totalPages: Math.max(1, Math.ceil(totalFeedbacks / feedbackLimit)),
                currentPage: feedbackPage,
            },
            analyses: {
                list: pagedAnalyses,
                totalPages: Math.max(1, Math.ceil(totalAnalyses / analysisLimit)),
                currentPage: analysisPage,
            }
        });

    } catch (error) {
        console.error("Admin Dashboard API Error:", error);
        return NextResponse.json({ error: "An error occurred while fetching admin data." }, { status: 500 });
    }
}
