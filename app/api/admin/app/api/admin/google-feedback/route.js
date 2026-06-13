import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

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
        console.log("[google-feedback] Unauthorized - session:", JSON.stringify(session?.user));
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const sheetUrl = process.env.GOOGLE_FORM_CSV_URL;
    console.log("[google-feedback] URL:", sheetUrl ? "SET" : "NOT SET");

    if (!sheetUrl) {
        return NextResponse.json({ responses: [], debug: "GOOGLE_FORM_CSV_URL not set" });
    }

    try {
        const res = await fetch(sheetUrl, { cache: 'no-store' });
        console.log("[google-feedback] Fetch status:", res.status);

        if (!res.ok) {
            console.log("[google-feedback] Fetch failed:", res.status, res.statusText);
            return NextResponse.json({ responses: [], debug: `Fetch failed: ${res.status}` });
        }

        const csv = await res.text();
        console.log("[google-feedback] CSV length:", csv.length);
        console.log("[google-feedback] CSV preview:", csv.substring(0, 300));

        // Enlever le BOM si présent
        const cleanCsv = csv.replace(/^\uFEFF/, '');
        const rows = parseCSV(cleanCsv);

        console.log("[google-feedback] Rows found:", rows.length);

        if (rows.length < 2) {
            return NextResponse.json({ responses: [], debug: `Only ${rows.length} rows found` });
        }

        const headers = rows[0];
        console.log("[google-feedback] Headers:", headers);

        const responses = rows
            .slice(1)
            .filter(row => row.length > 1 && row[0])
            .map(row => {
                const obj = {};
                headers.forEach((h, i) => { obj[h] = row[i] || ''; });
                return obj;
            })
            .reverse();

        console.log("[google-feedback] Responses count:", responses.length);
        return NextResponse.json({ responses });

    } catch (e) {
        console.error("[google-feedback] Error:", e.message);
        return NextResponse.json({ responses: [], debug: e.message });
    }
}
