/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Phase 19 hardening — baseline security headers on every response.
  //
  // Deliberately NOT including a Content-Security-Policy here: the app
  // loads the Razorpay checkout script client-side (checkout.razorpay.com,
  // which itself pulls in further Razorpay/CDN subresources for the
  // payment UI) and Supabase's realtime/storage clients, and a CSP
  // written without live-testing every one of those flows risks silently
  // breaking checkout or auth in production — exactly what Phase 19's
  // spec warns against ("do not introduce a CSP that breaks the
  // application"). A CSP is worth adding later, but only after it's been
  // verified against a real checkout run and a real signed-in session.
  //
  // The headers below carry no such risk — none of them restrict what
  // this app's own pages can load or do, only how other sites/browsers
  // may treat responses from this app:
  //   - X-Content-Type-Options: stops browsers from MIME-sniffing a
  //     response into executing as something other than its declared type.
  //   - X-Frame-Options: DENY — this is a dashboard app, never meant to be
  //     embedded in an iframe on another site (the lead-capture widget in
  //     public/reelo-widget.js is a script-injected DOM form, not an
  //     iframe, so this doesn't affect it); blocks clickjacking.
  //   - Referrer-Policy: avoids leaking full URLs (which can contain
  //     business/customer identifiers in the path) to third-party
  //     destinations a user might navigate to from this app.
  //   - Permissions-Policy: this app never needs camera/microphone/
  //     geolocation, so explicitly deny them.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
