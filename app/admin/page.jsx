"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
    Loader2, Users, BarChart4, ChevronLeft, ChevronRight,
    Trash2, Search, MessageSquare, ThumbsUp, ThumbsDown,
    FileSearch, CheckCircle, XCircle, Link as LinkIcon
} from "lucide-react";
import Link from "next/link";
import StatCard from "@/app/components/StatCard";
import ConfirmationModal from "@/app/components/ConfirmationModal";
import ClientOnlyTimestamp from "@/app/components/ClientOnlyTimestamp";

function FeedbackRow({ feedback }) {
    const analysis = feedback.analysisInfo;
    return (
        <tr className="border-b border-white/10 last:border-b-0">
            <td className="p-3">
                <p className="font-medium text-white">{feedback.userEmail}</p>
            </td>
            <td className="p-3">
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full w-fit ${feedback.feedback === 'helpful' ? 'bg-success/20 text-success-text' : 'bg-danger/20 text-danger-text'}`}>
                    {feedback.feedback === 'helpful' ? <ThumbsUp size={14} /> : <ThumbsDown size={14} />}
                    <span className="capitalize">{feedback.feedback}</span>
                </span>
            </td>
            <td className="p-3 text-white/80 text-sm">
                {analysis ? (
                    <span title={analysis.url || analysis.text}>
                        {analysis.source === 'image' ? '🖼 Image Analysis' : `"${(analysis.url || analysis.text || '').substring(0, 50)}..."`}
                    </span>
                ) : "Original analysis not found"}
            </td>
            <td className="p-3 text-white/80"><ClientOnlyTimestamp timestamp={feedback.createdAt} /></td>
        </tr>
    );
}

function AnalysisRow({ analysis }) {
    const isLikelyFake = analysis.result?.isLikelyFake;
    const confidence = analysis.result?.confidenceScore;
    const headline = analysis.result?.headline;
    const inputPreview = analysis.url || analysis.text || "Image Analysis";

    return (
        <tr className="border-b border-white/10 last:border-b-0">
            <td className="p-3">
                <div className="flex items-center gap-2">
                    {analysis.userInfo?.image ? (
                        <img src={analysis.userInfo.image} alt="" className="w-7 h-7 rounded-full" />
                    ) : (
                        <div className="w-7 h-7 rounded-full bg-primary/30 flex items-center justify-center text-xs text-white font-bold">
                            {(analysis.userEmail || "?")[0].toUpperCase()}
                        </div>
                    )}
                    <div>
                        <p className="text-sm font-medium text-white">{analysis.userInfo?.name || "Anonymous"}</p>
                        <p className="text-xs text-white/50">{analysis.userEmail || "—"}</p>
                    </div>
                </div>
            </td>
            <td className="p-3">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
                    analysis.source === 'image' ? 'bg-purple-500/20 text-purple-300' :
                    analysis.source === 'url' ? 'bg-blue-500/20 text-blue-300' :
                    'bg-gray-500/20 text-gray-300'
                }`}>
                    {analysis.source === 'image' ? '🖼' : analysis.source === 'url' ? <LinkIcon size={10}/> : '📝'}
                    <span className="capitalize">{analysis.source || 'text'}</span>
                </span>
            </td>
            <td className="p-3 text-white/70 text-sm max-w-xs truncate" title={headline || inputPreview}>
                {headline || inputPreview.substring(0, 60)}
            </td>
            <td className="p-3">
                {isLikelyFake !== undefined ? (
                    <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full w-fit ${
                        isLikelyFake ? 'bg-danger/20 text-danger-text' : 'bg-success/20 text-success-text'
                    }`}>
                        {isLikelyFake ? <XCircle size={12}/> : <CheckCircle size={12}/>}
                        {isLikelyFake ? 'Fake' : 'Real'}
                        {confidence !== undefined && ` · ${confidence}%`}
                    </span>
                ) : <span className="text-white/30 text-xs">—</span>}
            </td>
            <td className="p-3 text-white/60 text-sm">
                <ClientOnlyTimestamp timestamp={analysis.createdAt} />
            </td>
        </tr>
    );
}

export default function AdminDashboardPage() {
    const { data: session, status } = useSession();
    const router = useRouter();

    const [stats, setStats] = useState({ totalUsers: 0, totalAnalyses: 0 });
    const [users, setUsers] = useState([]);
    const [userPagination, setUserPagination] = useState({ currentPage: 1, totalPages: 1 });
    const [userPage, setUserPage] = useState(1);

    const [feedbacks, setFeedbacks] = useState([]);
    const [feedbackPagination, setFeedbackPagination] = useState({ currentPage: 1, totalPages: 1 });
    const [feedbackPage, setFeedbackPage] = useState(1);

    const [analyses, setAnalyses] = useState([]);
    const [analysisPagination, setAnalysisPagination] = useState({ currentPage: 1, totalPages: 1 });
    const [analysisPage, setAnalysisPage] = useState(1);

    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [userToDelete, setUserToDelete] = useState(null);
    const [refetchTrigger, setRefetchTrigger] = useState(0);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
            setUserPage(1);
        }, 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    useEffect(() => {
        if (status === "loading") return;
        if (status === "unauthenticated") router.replace("/login");
        else if (!session?.user?.isAdmin) router.replace("/");
        else {
            setIsLoading(true);
            const fetchUrl = `/api/admin/dashboard?userPage=${userPage}&feedbackPage=${feedbackPage}&analysisPage=${analysisPage}&search=${encodeURIComponent(debouncedSearchTerm)}`;
            fetch(fetchUrl)
                .then(res => {
                    if (!res.ok) throw new Error('Failed to fetch admin dashboard data.');
                    return res.json();
                })
                .then(data => {
                    if (data.error) throw new Error(data.error);
                    setStats(data.stats);
                    setUsers(data.users.list);
                    setUserPagination({ currentPage: data.users.currentPage, totalPages: data.users.totalPages });
                    setFeedbacks(data.feedback.list);
                    setFeedbackPagination({ currentPage: data.feedback.currentPage, totalPages: data.feedback.totalPages });
                    setAnalyses(data.analyses.list);
                    setAnalysisPagination({ currentPage: data.analyses.currentPage, totalPages: data.analyses.totalPages });
                })
                .catch(err => setError(err.message))
                .finally(() => setIsLoading(false));
        }
    }, [session, status, router, userPage, feedbackPage, analysisPage, refetchTrigger, debouncedSearchTerm]);

    const handleDeleteUser = async () => {
        if (!userToDelete) return;
        try {
            const res = await fetch(`/api/admin/users/${userToDelete._id}`, { method: 'DELETE' });
            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to delete user.');
            }
            setUserToDelete(null);
            setRefetchTrigger(c => c + 1);
        } catch (err) {
            setError(err.message);
            setUserToDelete(null);
        }
    };

    if (isLoading && users.length === 0) {
        return (
            <div className="flex flex-col justify-center items-center min-h-screen text-center">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="mt-4 text-white/70">Loading Admin Dashboard...</p>
            </div>
        );
    }

    return (
        <>
            <div className="min-h-screen bg-transparent text-foreground">
                <main className="container mx-auto px-4 py-8">
                    <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
                        <h1 className="text-4xl font-bold text-gray-900 dark:text-white">Dashboard Admin</h1>
                        <Link href="/" className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-white dark:bg-neutral/20 hover:bg-gray-100 dark:hover:bg-neutral/30 rounded-lg">
                            Back to Analyzer
                        </Link>
                    </div>

                    {error && <p className="text-danger-text text-center mb-4">{error}</p>}

                    {/* Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <StatCard icon={<Users size={24} className="text-primary"/>} label="Total Users" value={stats.totalUsers} colorClass="bg-primary"/>
                        <StatCard icon={<BarChart4 size={24} className="text-success-text"/>} label="Total Analyses" value={stats.totalAnalyses} colorClass="bg-success"/>
                    </div>

                    {/* All Analyses */}
                    <div className="p-6 rounded-2xl bg-neutral/10 border border-white/20 mb-8">
                        <div className="flex items-center gap-3 mb-4">
                            <FileSearch className="h-8 w-8 text-primary"/>
                            <div>
                                <h2 className="text-xl font-semibold text-white">All Analyses</h2>
                                <p className="text-white/70">Every analysis performed by all users.</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b border-white/20">
                                    <tr>
                                        <th className="p-3 text-sm font-semibold text-white/80">User</th>
                                        <th className="p-3 text-sm font-semibold text-white/80">Type</th>
                                        <th className="p-3 text-sm font-semibold text-white/80">Content</th>
                                        <th className="p-3 text-sm font-semibold text-white/80">Result</th>
                                        <th className="p-3 text-sm font-semibold text-white/80">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analyses.length === 0 ? (
                                        <tr><td colSpan={5} className="p-6 text-center text-white/40">No analyses yet.</td></tr>
                                    ) : (
                                        analyses.map(a => <AnalysisRow key={a._id} analysis={a} />)
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/20">
                            <p className="text-sm text-white/60">Page {analysisPagination.currentPage} of {analysisPagination.totalPages}</p>
                            <div className="flex gap-2">
                                <button onClick={() => setAnalysisPage(p => Math.max(1, p - 1))} disabled={analysisPagination.currentPage === 1} className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium bg-neutral/20 hover:bg-neutral/30 rounded-lg transition-colors disabled:opacity-50">
                                    <ChevronLeft size={16} /> Previous
                                </button>
                                <button onClick={() => setAnalysisPage(p => Math.min(analysisPagination.totalPages, p + 1))} disabled={analysisPagination.currentPage === analysisPagination.totalPages} className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium bg-neutral/20 hover:bg-neutral/30 rounded-lg transition-colors disabled:opacity-50">
                                    Next <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* User Feedback */}
                    <div className="p-6 rounded-2xl bg-neutral/10 border border-white/20 mb-8">
                        <div className="flex items-center gap-3 mb-4">
                            <MessageSquare className="h-8 w-8 text-primary"/>
                            <div>
                                <h2 className="text-xl font-semibold text-white">User Feedback</h2>
                                <p className="text-white/70">Recent feedback on analysis results.</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b border-white/20">
                                    <tr>
                                        <th className="p-3 text-sm font-semibold text-white/80">User</th>
                                        <th className="p-3 text-sm font-semibold text-white/80">Feedback</th>
                                        <th className="p-3 text-sm font-semibold text-white/80">Analyzed Content</th>
                                        <th className="p-3 text-sm font-semibold text-white/80">Date</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {feedbacks.length === 0 ? (
                                        <tr><td colSpan={4} className="p-6 text-center text-white/40">No feedback yet.</td></tr>
                                    ) : (
                                        feedbacks.map(fb => <FeedbackRow key={fb._id} feedback={fb} />)
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/20">
                            <p className="text-sm text-white/60">Page {feedbackPagination.currentPage} of {feedbackPagination.totalPages}</p>
                            <div className="flex gap-2">
                                <button onClick={() => setFeedbackPage(p => Math.max(1, p - 1))} disabled={feedbackPagination.currentPage === 1} className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium bg-neutral/20 hover:bg-neutral/30 rounded-lg transition-colors disabled:opacity-50">
                                    <ChevronLeft size={16} /> Previous
                                </button>
                                <button onClick={() => setFeedbackPage(p => Math.min(feedbackPagination.totalPages, p + 1))} disabled={feedbackPagination.currentPage === feedbackPagination.totalPages} className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium bg-neutral/20 hover:bg-neutral/30 rounded-lg transition-colors disabled:opacity-50">
                                    Next <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* All Users */}
                    <div className="p-6 rounded-2xl bg-neutral/10 border border-white/20">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-4">
                            <div>
                                <h2 className="text-xl font-semibold text-white">All Registered Users</h2>
                                <p className="text-white/70">Browse all users registered on the platform.</p>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" size={18}/>
                                <input type="text" placeholder="Search by name or email..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-64 pl-10 pr-4 py-2 rounded-lg bg-neutral/20 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-primary/50"/>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b border-white/20">
                                    <tr>
                                        <th className="p-3 text-sm font-semibold text-white/80">User</th>
                                        <th className="p-3 text-sm font-semibold text-white/80">Joined On</th>
                                        <th className="p-3 text-sm font-semibold text-white/80 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map(user => (
                                        <tr key={user._id} className="border-b border-white/10 last:border-b-0">
                                            <td className="p-3">
                                                <div className="flex items-center gap-3">
                                                    <img src={user.image || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=2563eb&color=fff`} alt={user.name} className="w-9 h-9 rounded-full bg-primary"/>
                                                    <div>
                                                        <p className="font-medium text-white">{user.name}</p>
                                                        <p className="text-xs text-white/60">{user.email}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="p-3 text-white/80"><ClientOnlyTimestamp timestamp={user.createdAt} /></td>
                                            <td className="p-3 text-right">
                                                <button onClick={() => setUserToDelete(user)} disabled={session.user.id === user._id} className="p-2 text-danger-text hover:bg-danger/20 rounded-full disabled:opacity-30 disabled:cursor-not-allowed" title="Delete User">
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="flex justify-between items-center mt-4 pt-4 border-t border-white/20">
                            <p className="text-sm text-white/60">Page {userPagination.currentPage} of {userPagination.totalPages}</p>
                            <div className="flex gap-2">
                                <button onClick={() => setUserPage(p => Math.max(1, p - 1))} disabled={userPagination.currentPage === 1 || isLoading} className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium bg-neutral/20 hover:bg-neutral/30 rounded-lg transition-colors disabled:opacity-50">
                                    <ChevronLeft size={16} /> Previous
                                </button>
                                <button onClick={() => setUserPage(p => Math.min(userPagination.totalPages, p + 1))} disabled={userPagination.currentPage === userPagination.totalPages || isLoading} className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium bg-neutral/20 hover:bg-neutral/30 rounded-lg transition-colors disabled:opacity-50">
                                    Next <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </main>
            </div>

            <ConfirmationModal isOpen={!!userToDelete} onClose={() => setUserToDelete(null)} onConfirm={handleDeleteUser} title="Delete User">
                Are you sure you want to permanently delete the user **{userToDelete?.email}**? All of their data will be removed. This action cannot be undone.
            </ConfirmationModal>
        </>
    );
}
