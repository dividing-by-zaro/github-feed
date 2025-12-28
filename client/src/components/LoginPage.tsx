import { useAuth } from '../context/AuthContext';
import { Github, Sparkles, ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Hero Card */}
        <div className="bg-white border-3 border-black rounded-2xl shadow-brutal-lg overflow-hidden animate-bounce-in">
          {/* Header with gradient */}
          <div className="bg-yellow p-8 border-b-3 border-black">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center">
                <Github size={24} className="text-white" />
              </div>
              <h1 className="font-display text-3xl font-bold">GitHub Curator</h1>
            </div>
            <p className="text-gray-700 leading-relaxed">
              Track changes across your favorite GitHub repositories with AI-powered summaries.
            </p>
          </div>

          {/* Features */}
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-mint rounded-lg border-2 border-black flex items-center justify-center shrink-0">
                <Sparkles size={16} />
              </div>
              <div>
                <h3 className="font-display font-semibold text-sm">AI-Powered Summaries</h3>
                <p className="text-xs text-gray-500">Get concise summaries of PRs and releases</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-pink rounded-lg border-2 border-black flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
                </svg>
              </div>
              <div>
                <h3 className="font-display font-semibold text-sm">Change Classification</h3>
                <p className="text-xs text-gray-500">Filter by significance: major, minor, patch</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-lavender rounded-lg border-2 border-black flex items-center justify-center shrink-0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div>
                <h3 className="font-display font-semibold text-sm">Stay Informed</h3>
                <p className="text-xs text-gray-500">Never miss important updates to your deps</p>
              </div>
            </div>
          </div>

          {/* Login Button */}
          <div className="p-6 pt-0">
            <button
              onClick={login}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-black text-white font-display font-semibold rounded-xl border-3 border-black hover:bg-gray-900 transition-all hover:shadow-brutal-sm active:translate-y-0.5"
            >
              <svg viewBox="0 0 24 24" width="20" height="20">
                <path
                  fill="#fff"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#fff"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#fff"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#fff"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Continue with Google
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-500 mt-6">
          By continuing, you agree to let us access your Google profile info.
        </p>
      </div>
    </div>
  );
}
