import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export default async function MobileReturnPage() {
  const cookieStore = await cookies();

  // En prod (HTTPS) NextAuth pose __Secure-..., en dev next-auth...
  const secure = cookieStore.get('__Secure-next-auth.session-token');
  const dev = cookieStore.get('next-auth.session-token');
  const found = secure || dev;
  const cookieName = secure ? '__Secure-next-auth.session-token' : 'next-auth.session-token';

  const deepLink = found?.value
    ? `aifakenewsdetector://?session_token=${encodeURIComponent(found.value)}&cookie_name=${encodeURIComponent(cookieName)}`
    : `aifakenewsdetector://?error=no_session`;

  return (
    <html lang="en">
      <head>
        <title>Returning to app…</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta httpEquiv="refresh" content={`0;url=${deepLink}`} />
        <style>{`
          body { font-family: -apple-system, system-ui, sans-serif; background:#0d1117; color:#fff; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
          .card { text-align:center; padding:24px 32px; }
          a { color:#3b82f6; }
        `}</style>
      </head>
      <body>
        <div className="card">
          <h2>Returning to AI Fake News Detector…</h2>
          <p>If nothing happens, <a href={deepLink}>tap here</a>.</p>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){ window.location.href = ${JSON.stringify(deepLink)}; }, 50);`,
          }}
        />
      </body>
    </html>
  );
}
