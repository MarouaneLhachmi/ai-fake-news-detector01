"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle, BarChart, CheckCircle, Target, Home, MessageSquare } from "lucide-react";
import StatCard from "@/app/components/StatCard";
import AnalysisDonutChart from "@/app/components/AnalysisDonutChart";
import Link from 'next/link';

// ─── NOUVEAU : Mes opinions ──────────────────────────────────────
function MyOpinionsSection() {
    const [opinions, setOpinions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/app-opinion')
            .then(r => r.json())
            .then(data => { setOpinions(data.opinions || []); setLoading(false); })
            .catch(() => setLoading(false));
    }, []);

    return (
        <div className="p-6 rounded-2xl bg-white dark:bg-neutral/10 border border-gray-200 dark:border-white/20">
            <div className="flex items-center gap-3 mb-4">
                <MessageSquare size={22} className="text-primary" />
                <h3 className="font-bold text-lg text-gray-800 dark:text-white/90">My Opinions</h3>
            </div>
            {loading ? (
                <p className="text-sm text-white/50">Loading...</p>
            ) : opinions.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-white/50">
                    You haven't submitted any opinions yet. Use the <strong>"Write your opinion"</strong> button in the footer.
                </p>
            ) : (
                <div className="space-y-3">
                    {opinions.map((op, i) => (
                        <div key={i} className="bg-gray-50 dark:bg-white/5 rounded-xl p-4 border border-gray-200 dark:border-white/10">
                            <p className="text-gray-800 dark:text-white/90 text-sm">{op.opinion}</p>
                            <p className="text-gray-400 dark:text-white/40 text-xs mt-2">
                                {new Date(op.createdAt).toLocaleString()}
                            </p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Page Dashboard principale ───────────────────────────────────
export default function DashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [stats, setStats] = useState(null);
    const [recentHistory, setRecentHistory] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.replace("/login");
            return;
        }
        if (status === "authenticated") {
            Promise.all([
                fetch('/api/dashboard-stats'),
                fetch('/api/history')
            ]).then(async ([statsRes, historyRes]) => {
                if (!statsRes.ok || !historyRes.ok) throw new Error("Failed to load dashboard data.");
                const statsData = await statsRes.json();
                const historyData = await historyRes.json();
                if (statsData.error || historyData.error) throw new Error("An error occurred while fetching data.");
                setStats(statsData);
                setRecentHistory(historyData.slice(0, 5));
            }).catch(err => {
                setError(err.message);
            }).finally(() => {
                setIsLoading(false);
            });
        }
    }, [status, router]);

    if (isLoading || !stats) {
        return (
            <div className="flex justify-center items-center min-h-screen">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-transparent text-foreground">
            <main className="container mx-auto px-4 py-8">
                <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
                    <Link href="/" className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-neutral/20 hover:bg-gray-100 dark:hover:bg-neutral/30 text-gray-800 dark:text-white rounded-lg transition-colors border border-gray-200 dark:border-white/20">
                        <Home size={16} />
                        Back to Analyzer
                    </Link>
                </div>

                {error && <div className="p-4 mb-6 text-center rounded-md bg-danger/20 text-danger-text border border-danger/30">{error}</div>}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                    {/* Colonne gauche : StatCards */}
                    <div className="lg:col-span-1 space-y-6">
                        <StatCard icon={<BarChart size={24} className="text-primary"/>} label="Total Analyses" value={stats.totalAnalyses} colorClass="bg-primary"/>
                        <StatCard icon={<CheckCircle size={24} className="text-success-text"/>} label="Likely Authentic" value={stats.authenticCount} colorClass="bg-success"/>
                        <StatCard icon={<AlertTriangle size={24} className="text-danger-text"/>} label="Likely Fake" value={stats.fakeCount} colorClass="bg-danger"/>
                        {stats.quizAccuracy > 0 && (
                            <StatCard icon={<Target size={24} className="text-yellow-400"/>} label="Quiz Accuracy" value={`${stats.quizAccuracy}%`} colorClass="bg-yellow-400"/>
                        )}
                    </div>

                    {/* Colonne droite : graphique + activité récente */}
                    <div className="lg:col-span-2 space-y-6">
                        <div className="p-6 rounded-2xl bg-white dark:bg-neutral/10 border border-gray-200 dark:border-white/20">
                            <AnalysisDonutChart authenticCount={stats.authenticCount} fakeCount={stats.fakeCount} />
                        </div>

                        {/* Recent Activity */}
                        <div className="p-6 rounded-2xl bg-white dark:bg-neutral/10 border border-gray-200 dark:border-white/20">
                            <h3 className="font-bold text-lg text-gray-800 dark:text-white/90 mb-4">Recent Activity</h3>
                            <div className="space-y-2">
                                {recentHistory && recentHistory.length > 0 ? (
                                    recentHistory.map((item, i) => {
                                        const displayText = item.inputType === 'image'
                                            ? "🖼 Image Analysis"
                                            : (item.inputValue || item.text || item.url || "Analysis");
                                        const dateLabel = item.createdAt
                                            ? new Date(item.createdAt).toLocaleDateString()
                                            : "";
                                        return (
                                            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${item.result?.isLikelyFake ? 'bg-danger' : 'bg-success'}`}/>
                                                    <p className="text-sm text-gray-700 dark:text-white/80 truncate max-w-xs">{displayText}</p>
                                                </div>
                                                <p className="text-xs text-gray-400 dark:text-white/40 flex-shrink-0 ml-4">{dateLabel}</p>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className="text-sm text-gray-500 dark:text-white/50">No recent activity.</p>
                                )}
                            </div>
                            {recentHistory && recentHistory.length > 0 && (
                                <Link href="/history" className="mt-4 inline-block text-sm text-primary hover:underline">
                                    View all history →
                                </Link>
                            )}
                        </div>

                        {/* ✅ NOUVEAU : My Opinions */}
                        <MyOpinionsSection />
                    </div>
                </div>
            </main>
        </div>
    );
}
