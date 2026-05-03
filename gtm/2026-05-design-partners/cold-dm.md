# Cold-DM scripts — AI-built-apps design partners

These are the messages you actually send. Personal voice, specific findings,
short. Customise the bracketed bits before sending. Never paste verbatim.

The wedge is **always the same**: scan their app first, then DM them what you
found. The pitch is the report, not the product.

---

## 0. The pre-flight (do this before you DM anyone)

For every prospect:

1. Find their public app URL (their bio, their pinned tweet, their pinned LinkedIn post).
2. Run `oraclebot scan <url> --packs ai_built_apps,web_classics --json` from your CLI.
3. Open the run in the dashboard; capture two things:
   - The readiness score (e.g. 64/100)
   - The top one or two specific findings with severity (e.g. "Supabase anon
     key in bundle + RLS off on `users` and `posts`")
4. Capture the run URL and the badge SVG URL — these are the artifacts you'll
   share if they ask.

If their app scores 95+ with zero criticals, **don't DM them** — there's no
hook. Move on. Five out of every six AI-codegen apps will have something
worth flagging; that's the conversion math.

---

## Archetype A — Solo founder shipping with Lovable / v0 / Bolt

**Channel:** X (formerly Twitter) DM. LinkedIn if you don't have a mutual
follow on X.

**Sample**

> Hey [first name] — saw [project name] on [Lovable / v0]. I built a scanner
> for the failure modes those tools ship by default and ran it against your
> staging.
>
> Score: **64/100**. Two criticals:
> – Supabase anon key is in your client bundle + RLS is off on `users` and
> `posts` (anyone who opens DevTools can read every row)
> – Hardcoded OpenAI key in `app.js` (sk-…h7Kp)
>
> Read-only, took 3 min. Want the full report? It's free for design
> partners — I'm onboarding the first 10. Reply with a yes and I'll send the
> dashboard link.

**Why this works**

- Line 1 names a specific app they care about
- Line 2 frames you as a peer ("I built a scanner") not a vendor
- Lines 3–6 are the report, not the pitch
- Line 7 closes with a low-friction ask ("reply with a yes")

**Customise per send**

- Swap "Lovable / v0" for whatever they actually used
- Always quote the actual finding strings — never paraphrase
- Lead with the highest-severity finding; supabase + key leak is the
  archetypal pair, but use what your scan actually returned

---

## Archetype B — Funded startup (pre-seed / seed) using Cursor or Claude Code

**Channel:** Email (find via Hunter.io / Clearbit / their about page).
Email is right here because seed founders are inundated on X DMs but check
email.

**Subject**

> [Project] · readiness scan results

**Body**

> [First name],
>
> Quick one. I scanned [project URL] this morning with [OracleBot](https://oraclebot.net)
> — a security/readiness scanner I'm building for AI-built apps.
>
> Top findings:
> 1. **Critical** — `client_side_auth_only`: `/api/users/me` returns user
>    data without a session cookie. Likely gated only by a frontend check.
> 2. **High** — `missing_rate_limit_on_auth`: 30 concurrent requests to
>    `/api/auth/sign-in` all completed; no 429s.
> 3. **Medium** — `default_error_page_leak`: trailing `/_next/static` 404
>    leaks Next.js version 15.0.3.
>
> Full report (no auth required, time-bounded link):
> [oraclebot.net/score/<verificationId>](https://oraclebot.net/score/<verificationId>)
>
> I'm onboarding 10 design partners — free, you keep the badge, you get a
> 20-min walkthrough where I explain each finding + the fix. In exchange:
> 30 min of your honest feedback after you've seen the report.
>
> Worth a reply?
>
> [Your name]
> oraclebot.net · solo founder, building this myself

**Why this works**

- Subject line is the deliverable, not a pitch
- Body has 3 numbered findings — enough to feel substantive, not so many
  it becomes a PDF
- The score-page link is the artifact; they can validate before replying
- "Free / 20 min / your feedback" is a fair trade
- Sign-off humanises ("solo founder, building this myself") — softens the
  cold-email vibe

---

## Archetype C — Agency / consultancy shipping AI-built apps for clients

**Channel:** LinkedIn DM (agencies live there). Optionally email if you
have a warm intro.

**Sample**

> Hi [first name] — I'm building [OracleBot](https://oraclebot.net), a
> readiness scanner for AI-codegen apps (Lovable, v0, Cursor, Claude Code,
> etc).
>
> Saw [agency] ships AI-built MVPs for clients. The probe pack is built
> exactly for the failure modes those clients inherit — exposed Supabase
> keys, missing RLS, dev surfaces in production. 49 probes, read-only.
>
> Two ways this could be useful for [agency]:
> 1. **Pre-handoff scan** — run before client demo, ship a passing badge
>    with the deliverable. Differentiator vs "we built it in Lovable, good
>    luck."
> 2. **CI integration** — our GitHub Action posts a PR comment with
>    findings; useful if you want a recurring readiness gate without
>    building one in-house.
>
> First 5 agency design partners get unlimited scans + a co-branded
> readiness badge for one client project. Want a 20-min walkthrough on a
> recent project?
>
> [Your name]

**Why this works**

- Names their specific business model ("ship AI-built MVPs for clients")
- Two clear use-cases instead of one generic offer
- "Co-branded badge for one client project" is concrete and motivating
- Agency design partners are 5x leverage — they bring 5+ end clients

---

## Archetype D — Builder personality / X-active dev with audience

**Channel:** Public reply OR DM, depending on relationship. **Public
reply** is high-leverage if their tweet is about AI-codegen failure modes
("just shipped my first Lovable app!" / "anyone else seen Supabase keys
in bundles?")

**Sample (DM)**

> Hey [first name] — big fan of [thing they made / wrote]. Quick share:
> I've been building [OracleBot](https://oraclebot.net), a scanner for
> the stuff Lovable/v0/Bolt apps tend to ship broken. 49 probes, free
> for design partners.
>
> Ran it against [their app] just now. Score 78/100, two highs (
> rate-limit gap on `/api/login`, exposed `/_next/static` debug surface).
> Full report: [link to score page].
>
> If it's useful, no ask — feel free to share the badge if it makes
> sense. If you'd ever want to write up the findings, I'd love to give
> you the inside view of how the probes work.
>
> [Your name]

**Why this works**

- Genuinely no ask in line 1 — earned attention
- Score + findings give them something tweetable
- "Inside view of how the probes work" is what content creators want
  (substance) — different from what founders want (their own findings)
- One referrer in this category is worth 50 cold emails

---

## Channel order of operations

For your first 5 design partners — go in this order:

1. **Two warm intros from your network.** People who already trust you.
   Conversion: ~80%. Send a short personal note + link to the report.
2. **One agency DM (Archetype C).** Highest leverage if it lands.
3. **One funded-startup email (Archetype B).** Slowest cycle but most
   credible logo.
4. **One builder personality (Archetype D).** Distribution multiplier
   even if they don't become a customer.

Do not send all 5 in one day. Stagger across a week so you can react to
the first responses before sending the next round.

---

## What NOT to say

- "Synergies", "leverage", "transformation", "partnership opportunity",
  "circle back", "touch base", "thoughts?", "let me know"
- "Just wanted to reach out"
- "I think this could be valuable for you" (let them decide)
- Anything that sounds like a sales template
- Anything before line 1 that delays the finding ("Hope you're well —
  hope you had a great weekend — wanted to introduce myself —")

If you wouldn't say it on the phone to a friend, don't put it in the DM.
