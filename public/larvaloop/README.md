# LarvaLoop landing page

Static page (no build step) that is the front page of the Next.js app: `/` shows it through a rewrite in
`next.config.ts`. "Open the app" (top bar and floating bar) and the closing "Join the pilot" button go to `/log`.

Its CSS, JS and icons use absolute `/larvaloop/...` paths, so open it through the app (`npm run dev`, then
http://localhost:3000/), not by double-clicking the file.
