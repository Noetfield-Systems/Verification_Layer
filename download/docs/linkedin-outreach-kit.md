# LinkedIn Outreach Kit — 50 Emails to AI Consultancies

## The goal

Get 5-10 signups → 2-3 POCs → 1 paying customer ($499/mo Pro plan) in 2 weeks.

## Target profile

- AI/ML consultancies (5-50 employees)
- Companies that build AI agents or LLM-powered apps for clients
- Dev shops that use Cursor, Bolt, v0, or custom agents in their workflow
- Compliance-conscious: fintech, healthcare, govtech adjacents

## Search strings (paste into LinkedIn Sales Navigator or LinkedIn search)

```
"AI consultant" OR "AI consultancy" OR "AI agency"
"LLM" OR "large language model" OR "generative AI"
"agent" OR "AI agent" OR "autonomous agent"
"Cursor" OR "Bolt" OR "v0" OR "Replit"
"compliance" OR "SOC 2" OR "audit"
```

Filter: Head of Eng, CTO, Founder, CEO at companies with 5-50 employees.

## The 50-email sequence

Send 10/day over 5 days. Follow up on no-reply after 3 days with Email B.

### Email A — First touch (send Monday)

**Subject:** "verifying your AI-generated code before deploy?"

```
Hi [first_name],

Saw [company] is doing AI agent work — [specific project / case study / blog post you found].

Quick question: when your agents write code for clients, who verifies it's safe to deploy? We're seeing teams ship AI-generated code to production with no gate between "the model wrote it" and "it's live."

Noetfield is a verification API that runs 8 deterministic gates on any AI-generated artifact:
- G0: provenance (which tool generated it?)
- G1: no hardcoded secrets / prod DB URLs
- G2: no leaked AWS/GCP/Stripe keys
- G3: license check
- G4: transform fidelity (wasn't mangled in transit)
- G5: policy immutability (rules weren't tampered with)
- G6: file-order-independent hashing
- G7: 15-min HMAC deploy token bound to the artifact hash

Same input → same verdict hash, every time. SOC 2 / FINTRAC / EU AI Act audit receipts.

Free tier: 100 verifications/month, no credit card. Takes 5 minutes to wire into your agent pipeline.

Worth a 15-minute call this week? I can show you the API + a real verification on your own code.

— [your_name]
noetfield.com

P.S. If you're not the right person, who on your eng team handles deploy safety?
```

### Email B — Follow-up (send Thursday if no reply)

**Subject:** "re: verifying your AI-generated code before deploy?"

```
Hi [first_name],

Following up on my Monday email — did you get a chance to look?

The 30-second version: paste this into your terminal after your agent generates code:

  curl -X POST https://api.noetfield.com/api/v1/verify \
    -H "Authorization: Bearer nf_live_..." \
    -H "Content-Type: application/json" \
    -d '{"artifact":"<your_agent_output>","artifact_type":"code","metadata":{"source":"cursor","project_id":"..."}}'

You get back a verdict (pass/fail) + a verdict_hash + (if pass) a deploy token. Block on fail, deploy on pass.

Free key here: noetfield.com (click "Get API key", enter your email, done.)

— [your_name]
```

### Email C — Breakup (send Monday week 2 if still no reply)

**Subject:** "closing the loop"

```
Hi [first_name],

Last email from me — don't want to clog your inbox.

If deploy safety for AI-generated code ever becomes a priority, I'm at [your_email]. The free tier doesn't expire: noetfield.com.

If there's someone else who should be in this conversation, I'd appreciate an intro.

— [your_name]
```

## The 50 targets — fill in with your research

Below is a template. Replace the placeholders with real companies/people you find on LinkedIn. I've structured this so you can copy-paste each row into your CRM or a spreadsheet.

| # | Company | First name | Role | Why they're a fit | Email status | Sent date | Reply |
|---|---|---|---|---|---|---|---|
| 1 | [AI consultancy 1] | [name] | CTO/Founder | Builds agents for fintech clients | Email A | — | — |
| 2 | [AI consultancy 2] | [name] | Head of Eng | Uses Cursor at scale | Email A | — | — |
| 3 | [AI consultancy 3] | [name] | CEO | Mentioned "deploy safety" in a post | Email A | — | — |
| 4 | [AI consultancy 4] | [name] | CTO | Compliance-focused (SOC 2) | Email A | — | — |
| 5 | [AI consultancy 5] | [name] | Founder | v0 + Bolt user | Email A | — | — |
| 6-10 | [fill in] | | | | Email A | | |
| 11-15 | [fill in] | | | | Email A | | |
| 16-20 | [fill in] | | | | Email A | | |
| 21-25 | [fill in] | | | | Email A | | |
| 26-30 | [fill in] | | | | Email A | | |
| 31-35 | [fill in] | | | | Email A | | |
| 36-40 | [fill in] | | | | Email A | | |
| 41-45 | [fill in] | | | | Email A | | |
| 46-50 | [fill in] | | | | Email A | | |

## Finding the companies

Search LinkedIn for companies matching these patterns:

1. **AI consultancies in your region** (search "AI consultancy [your city]")
2. **Dev shops that mention Cursor/Bolt/v0** in their LinkedIn posts
3. **Companies that posted about "AI agents" in the last 30 days**
4. **Y Combinator AI cohort companies** (check workatastartup.com)
5. **AI consultancies on Clutch.co** (filter by "AI development")
6. **Companies following @cursor_ai, @boltdotnew, @v0 on X/Twitter**
7. **LinkedIn posts with hashtags #AIAgents #LLM #GenerativeAI #AISafety**

## The math

- 50 emails sent
- ~30% open rate → 15 read
- ~20% reply rate of readers → 3 replies
- 1-2 POCs (they sign up, try it on their code)
- 1 converts to $499/mo Pro

That's a $5,988/year customer from 50 emails. If you send 50/week for 4 weeks, that's 4 customers = ~$24k ARR in a month. Enough to be a real company.

## What NOT to do

- **Don't** lead with "Sina" or "autonomous loop" or "domino 2" — investors and customers don't care about your internal architecture yet.
- **Don't** lead with the technical gates (G0-G7) in the first sentence — lead with the problem ("who verifies your AI code is safe to deploy?").
- **Don't** send a calendar link in the first email — ask for a call, then send the link when they reply.
- **Don't** use the word "blockchain" or "cryptographic" in the subject line — it triggers spam filters and sounds hype-y.
- **Don't** send to generic `info@` or `contact@` addresses — find a named human on LinkedIn.

## Tracking

Use a spreadsheet or CRM (Notion, Airtable, Hubspot free tier). Columns:

- Company, Contact, Email, Status (sent / opened / replied / POC / paid)
- Date sent, Date replied
- Notes (what they said, what they're building, next step)

Review every Friday. If you're not getting 3+ replies per 50 emails, your targeting or subject line is wrong — iterate.

## When someone replies

**If they say "interesting, tell me more":**
- Reply within 4 hours
- Send them a Loom (60 sec) of you running a verification on their company's public code (their GitHub repo)
- Offer a 15-min call
- On the call: ask about their current AI workflow, where the deploy gap is, demo the API live on their code

**If they say "not now":**
- Ask "when would be a good time to revisit?"
- Add to a "nurture" list — send them one update per month (new feature, customer case study, etc.)

**If they sign up but don't verify:**
- Email them: "Saw you signed up — anything blocking you from running your first verification? I can hop on a 10-min call to wire it in."

**If they sign up and verify a lot:**
- Email them: "You've run N verifications — how's it going? Want to try the Pro tier (10k/mo, PDF receipts, GitHub Action)? First month free."
