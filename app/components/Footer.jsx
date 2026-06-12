"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Twitter, Github, Linkedin, MessageCircle, Send, X } from "lucide-react";

export default function Footer() {
    const { data: session } = useSession();
    const [showForm, setShowForm] = useState(false);
    const [opinion, setOpinion] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const googleFormUrl = "https://docs.google.com/forms/d/e/1FAIpQLSeiDWN2iRuXCY8LZId1BQlQt8OUuSe9J7-CYez7hlxzG97alA/viewform?usp=dialog";

    const handleSubmit = async () => {
        if (!opinion.trim() || submitting) return;
        setSubmitting(true);
        try {
            const res = await fetch("/api/app-opinion", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ opinion }),
            });
            if (res.ok) {
                setSubmitted(true);
                setOpinion("");
                setTimeout(() => { setSubmitted(false); setShowForm(false); }, 2500);
            }
        } catch (e) {
            console.error(e);
        }
        setSubmitting(false);
    };

    return (
        <footer className="border-t border-white/10 mt-16 py-12">
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-8">

                    <div>
                        <span className="text-primary font-bold text-lg">AI Fake News Detector</span>
                        <p className="text-sm text-white/60 mt-3">An intelligent tool for analyzing news articles and images to combat the spread of misinformation.</p>
                    </div>

                    <div>
                        <h4 className="font-semibold text-white/90 mb-4">Quick Links</h4>
                        <ul className="space-y-2">
                            <li><Link href="/live" className="text-sm text-white/60 hover:text-white transition-colors">Live Feed</Link></li>
                            <li><Link href="/quiz" className="text-sm text-white/60 hover:text-white transition-colors">News Quiz</Link></li>
                            <li><Link href="/history" className="text-sm text-white/60 hover:text-white transition-colors">Full History</Link></li>
                            <li><Link href="/dashboard" className="text-sm text-white/60 hover:text-white transition-colors">Dashboard</Link></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-semibold text-white/90 mb-4">Legal</h4>
                        <ul className="space-y-2">
                            <li><a href="#" className="text-sm text-white/60 hover:text-white transition-colors">Privacy Policy</a></li>
                            <li><a href="#" className="text-sm text-white/60 hover:text-white transition-colors">Terms of Service</a></li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-semibold text-white/90 mb-4">Connect With Us</h4>
                        <div className="flex items-center gap-4 mb-6">
                            <a href="#" className="text-white/60 hover:text-primary transition-colors"><Twitter size={20} /></a>
                            <a href="#" className="text-white/60 hover:text-primary transition-colors"><Github size={20} /></a>
                            <a href="#" className="text-white/60 hover:text-primary transition-colors"><Linkedin size={20} /></a>
                        </div>

                        <h4 className="font-semibold text-white/90 mb-3">Application Feedback</h4>

                        <a href={googleFormUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-primary transition-colors">
                            <MessageCircle size={16} /><span>Give your opinion</span>
                        </a>

                        {session && (
                            <div className="mt-3">
                                {!showForm ? (
                                    <button onClick={() => setShowForm(true)} className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-primary transition-colors">
                                        <Send size={16} /><span>Write your opinion</span>
                                    </button>
                                ) : (
                                    <div className="mt-2 space-y-2">
                                        {submitted ? (
                                            <p className="text-sm text-green-400 font-medium">Thank you for your opinion!</p>
                                        ) : (
                                            <div className="space-y-2">
                                                <textarea
                                                    value={opinion}
                                                    onChange={(e) => setOpinion(e.target.value)}
                                                    placeholder="Share your thoughts about the app..."
                                                    className="w-full text-sm bg-white/10 border border-white/20 rounded-lg p-2 text-white placeholder-white/40 resize-none focus:outline-none focus:border-primary"
                                                    rows={3}
                                                    maxLength={500}
                                                />
                                                <div className="flex gap-2 items-center">
                                                    <button onClick={handleSubmit} disabled={submitting || !opinion.trim()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary/80 hover:bg-primary text-white rounded-lg transition-colors disabled:opacity-50">
                                                        <Send size={12} /><span>{submitting ? "Sending..." : "Submit"}</span>
                                                    </button>
                                                    <button onClick={() => { setShowForm(false); setOpinion(""); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors">
                                                        <X size={12} /><span>Cancel</span>
                                                    </button>
                                                    <span className="text-xs text-white/40 ml-auto">{opinion.length}/500</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-white/10 text-center text-sm text-white/50">
                    <p>&copy; {new Date().getFullYear()} AI Fake News Detector. All Rights Reserved.</p>
                </div>
            </div>
        </footer>
    );
}
