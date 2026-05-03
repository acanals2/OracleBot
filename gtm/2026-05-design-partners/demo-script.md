# 20-minute demo walkthrough

The structure assumes the prospect has already replied to your cold DM
and you've scheduled a 20-min call. They have NOT seen the dashboard
yet — only the public score page from the DM.

## Hard rules

1. **No product tour.** They didn't agree to a product demo. They agreed
   to see their own findings.
2. **They are the protagonist.** You're the technician explaining what
   broke and how to fix it.
3. **Show artefacts, don't talk about them.** When you mention the
   badge, paste the URL. When you mention the GitHub Action, share-screen
   and run it.
4. **The next step is decided by minute 17.** If you reach minute 18
   without naming what happens next, you've lost.
5. **Take notes during the call, not after.** Use the design-partner
   tracker template; type their reactions verbatim while they speak.

---

## Pre-call setup (5 min before)

- Re-run the scan against their staging right before the call — fresh
  findings, fresh badge, fresh score
- Open three browser tabs:
  1. The dashboard run page (`/app/tests/<id>/results`)
  2. The public score page (`/score/<verificationId>`)
  3. The probe catalogue (`/probes.html`)
- Close everything else (no Slack popups, no email)
- Have the design-partner tracker open in a fourth tab to take notes

---

## Minute-by-minute

### 0:00 – 1:00 · Open with the score

> "Thanks for taking the call. I re-scanned [their app] this morning
> — let me share my screen. Here's the result."

Share the **public score page** (not the dashboard). They've seen this
URL in your DM but probably haven't clicked through. Walk them through:

- The score
- The host being scanned
- Pack badges
- Findings list

Don't say anything about your product. Let the artefact speak.

### 1:00 – 8:00 · Walk through the findings

For each of the top **3 findings** (skip lower severity for this part):

1. **Read the title aloud.**
2. **Show the repro.** Click into the finding, show the impactedPath /
   reproJson. Talk through what fired the probe in plain English.
3. **Show the impact.** Half a sentence: "Anyone with DevTools can read
   every row in `users`."
4. **Show the fix.** Read the remediation field aloud.
5. **Pause.** Let them react. Don't fill the silence.

> Listen for: "Wait, really?" / "I didn't know that was even a thing." /
> "I thought Supabase did that automatically." Each of these is gold —
> write it down. It's marketing copy and a feature decision at once.

If they say "yeah I knew about that one" — that's also data. Mark it as
"already known" in your tracker and move to the next finding.

### 8:00 – 12:00 · Show how this becomes part of their workflow

Three artefacts, in this order:

**a. The badge embed** (~90 sec)

- Open the **Publish your score** card on the results page
- Copy the markdown snippet
- Open a notepad, paste it, render it
- "This is what your README looks like with the badge. Click-through
  goes to your live score page — like the one we just looked at."

**b. The GitHub Action** (~90 sec)

- Open `.github/actions/oraclebot-scan/README.md` in a tab
- Show the YAML config (8 lines)
- "This is the PR comment you'd get on every push. Score, finding count,
  delta vs main."
- Don't actually wire it up live. Just show the screenshot in the README.

**c. The CLI for one-off scans** (~30 sec)

- Show `oraclebot scan https://staging.acme.dev --packs ai_built_apps`
  in your terminal (mute your prompt; just the command + output)
- "Useful for local dev loops. Same auth as the Action."

### 12:00 – 17:00 · Stop talking. Listen.

This is the most important section of the call. Ask three open
questions in sequence and DON'T fill silence:

1. "What surprised you in the findings list?"
   → Listen for which probes landed and which didn't.
2. "If this ran every Friday on every project, what would you want it
   to do that it doesn't do today?"
   → This is your roadmap conversation. Take notes verbatim.
3. "Where would you want the findings to show up — email, Slack, GitHub
   PR, a dashboard, something else?"
   → This is your integration roadmap.

If you find yourself talking, stop. Pause for three full seconds. They'll
keep going.

### 17:00 – 20:00 · The design partner ask

If the call has been productive, close with this:

> "Here's what I'd love to do. You become one of our first 10 design
> partners. That means:
>
> – **You get unlimited scans for 90 days.** No per-run cost.
> – **You keep your readiness badge.** It auto-updates as you re-scan.
> – **You get a 20-min check-in with me every two weeks** for the
> 90 days. We walk through new findings together.
>
> What I'd ask in exchange:
>
> – **Your honest feedback.** If something's broken or missing,
> tell me directly.
> – **An optional public testimonial** at the end of the 90 days —
> only if you'd actually recommend it to a friend.
> – **One intro** to someone else shipping AI-built apps who you
> think would benefit.
>
> Sound fair?"

Wait for the answer. If yes:

- Send the design-partner agreement (one-page PDF — keep it short)
- Mint them an org if they don't already have one
- Set a calendar invite for the 2-week check-in

If they hedge ("let me think about it"):

- Don't push. Send a follow-up at day 3 (template in
  [follow-up-templates.md](./follow-up-templates.md))
- Mark them as "warm" in your tracker, not "lost"

If they say no:

- Ask one question: "What would have made it useful?"
- Whatever they say, write it down. That's the most valuable sentence
  from the call.
- Thank them genuinely. They gave you 20 minutes of feedback for free.

---

## What to never do on a demo call

- Pitch features. They didn't ask.
- Compare yourself to a competitor. Stay focused on their findings.
- Apologise for the product being early ("we're just getting started…").
  Confidence is the only asset you have at this stage.
- Negotiate price. There is no price for design partners.
- Promise things you haven't built ("we'll have that next week"). If
  they ask for something missing, say "noted, I'll think about it" and
  add it to the tracker.

---

## After the call (5 min)

While the conversation is fresh:

1. Update the design-partner tracker with: their answers to the three
   open questions, the verbatim "wait, really?" reactions, anything they
   said they'd want, and your gut on whether they'll convert.
2. Send the thank-you email within 30 minutes. Template in
   [follow-up-templates.md](./follow-up-templates.md).
3. If they said yes, send the agreement + onboarding link before EOD.
4. If they said no, one final email at day 14 asking permission to
   share product updates quarterly.
