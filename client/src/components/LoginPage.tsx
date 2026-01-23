import { useAuth } from '../context/AuthContext';
import { ArrowRight } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();

  return (
    <div className="min-h-screen bg-cream">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 md:px-12 md:py-6">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="GitHub Curator" className="w-8 h-8" />
          <span className="font-display text-xl font-bold">GitHub Curator</span>
        </div>
        <button
          onClick={login}
          className="flex items-center gap-2 px-5 py-2.5 bg-black text-white font-display font-semibold text-sm rounded-full border-2 border-black hover:bg-gray-900 transition-all hover:shadow-brutal-sm active:translate-y-0.5 cursor-pointer"
        >
          <svg viewBox="0 0 24 24" width="18" height="18">
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
          Sign in with Google
          <ArrowRight size={16} />
        </button>
      </header>

      {/* Main Content */}
      <main className="px-6 md:px-12 py-4 md:py-8">
        {/* Hero Section */}
        <div className="text-center max-w-4xl mx-auto mb-12 md:mb-20">
          <div className="inline-block px-4 py-1.5 bg-yellow border-2 border-black rounded-full font-display font-semibold text-sm mb-6">
            AI-Powered Repo Tracking
          </div>
          <h1 className="font-display text-4xl md:text-6xl lg:text-7xl font-bold leading-tight mb-6">
            <span
              className="text-pink"
              style={{
                WebkitTextStroke: '4px black',
                paintOrder: 'stroke fill'
              }}
            >Never Miss</span> an Important
            <br />
            Repo Update Again
          </h1>
          <p className="text-lg md:text-xl text-gray-600 max-w-2xl mx-auto">
            Track changes across your favorite GitHub repositories with AI-powered summaries, smart categorization, and custom reports.
          </p>
        </div>

        {/* Feature Videos */}
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 max-w-6xl mx-auto">
          {/* Repo Feature */}
          <div className="flex flex-col">
            <div className="mb-4">
              <h3 className="font-display font-bold text-xl md:text-2xl mb-2">
                Repo updates at a glance
              </h3>
              <p className="text-gray-600">
                No more scanning changelogs. Filter by impact, category, and repo.
              </p>
            </div>
            <div className="flex-1 rounded-2xl border-3 border-black shadow-brutal overflow-hidden bg-white">
              <video
                src="/repo-feature.mov"
                autoPlay
                loop
                muted
                playsInline
                onLoadedData={(e) => {
                  (e.target as HTMLVideoElement).playbackRate = 2;
                }}
                className="w-full h-full object-cover"
              />
            </div>
          </div>

          {/* Report Feature */}
          <div className="flex flex-col">
            <div className="mb-4">
              <h3 className="font-display font-bold text-xl md:text-2xl mb-2">
                Changelog reports on demand
              </h3>
              <p className="text-gray-600">
                Summarize a week, month, or quarter of changes in one click.
              </p>
            </div>
            <div className="flex-1 rounded-2xl border-3 border-black shadow-brutal overflow-hidden bg-white">
              <video
                src="/report-feature.mov"
                autoPlay
                loop
                muted
                playsInline
                onLoadedData={(e) => {
                  (e.target as HTMLVideoElement).playbackRate = 2;
                }}
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 mt-12">
          By signing in, you agree to let us access your Google profile info.
        </p>
      </main>
    </div>
  );
}
