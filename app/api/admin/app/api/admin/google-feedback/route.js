import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

// Parser CSV simple qui gère les champs entre guillemets
function parseCSV(text) {
    const rows = [];
    const lines = text.split('\n');

    for (const line of lines) {
        if (!line.trim()) continue;
        const cells = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                cells.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        cells.push(current.trim());
        rows.push(cells);
    }
    return rows;
}

export async function GET() {
    const session = await getServerSession(authOptions);

    if (!session?.user?.isAdmin) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const sheetUrl = process.env.GOOGLE_FORM_CSV_URL;

        if (!sheetUrl) {
            return NextResponse.json({ responses: [] });
        }

        const res = await fetch(sheetUrl, { cache: 'no-store' });
        if (!res.ok) {
            return NextResponse.json({ responses: [] });
        }

        const csv = await res.text();
        const rows = parseCSV(csv);

        if (rows.length < 2) {
            return NextResponse.json({ responses: [] });
        }

        const headers = rows[0];
        const responses = rows
            .slice(1)
            .filter(row => row.length > 1 && row[0])
            .map(row => {
                const obj = {};
                headers.forEach((h, i) => {
                    obj[h] = row[i] || '';
                });
                return obj;
            })
            .reverse(); // Plus récent en premier

        return NextResponse.json({ responses, headers });

    } catch (e) {
        console.error("[Google Feedback] Error:", e);
        return NextResponse.json({ responses: [] });
    }
}
