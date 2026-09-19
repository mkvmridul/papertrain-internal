Forge the Future 2026 — LedgerLens Context Pack
17 Sept 2026 · @Mridul · updated the evening of 17 Sept with the finalist briefing deck (know-before-you-build.pdf) and the first local build
Single source of truth for the Elastic and AWS Forge the Future 2026 grand finale. Facts are marked CONFIRMED (stated by organisers), INFERRED (my reasoning) or UNVERIFIED (needs checking before you say it out loud).
Status and countdown
CONFIRMED: shortlisted as a finalist, and a member of the finalists Slack channel. AMA 1 said Top 15; the later finalist briefing deck lists twenty teams, so it is twenty.
When
What
Fri 18 Sep, 9:00 AM
Build day starts
Fri 18 Sep, 5:00 PM
Hard submission deadline: code, presentation, sources
Fri 18 Sep, evening
Judges evaluate submissions
Sat 19 Sep, 9:00 AM to 6:00 PM (briefing deck: runs through to 6:00 pm)
Presentation round, top 3 announced
The real deadline is 5:00 PM Friday, not Saturday. What sits in the repo at that moment is the judges' first impression, before anyone speaks.
Logistics
All CONFIRMED by organisers in the finalists Slack channel.
Venue. Elastic Technologies (India) Private Limited, 11/1 Sunriver building, A wing, 1st floor, 12/1 Embassy Golf Links Business Park, Domlur, Bengaluru 560071.
Hours. Slack said 9:00 AM to 5:00 PM on both days. The finalist briefing deck says doors from around 8:00 AM on the 18th, programme from 9:00 AM, and the 19th runs through to 6:00 PM. Plan for the longer day.
Attendance. Every team member must attend in person on both days. No hybrid format: Elastic refused it for a team whose members were in different cities, and refused a repeat request. Participation is teams only, no individuals.
Accommodation. Not provided and not covered. Each member arranges their own stay. A finalist asked whether teams could remain at the venue overnight between the two days; that thread has replies not yet read.
Travel. No mention of reimbursement anywhere.
First hour on build day, as instructed by Som: sign up for Elastic Cloud, create an API key, index your test dataset, and confirm the client connects to the server before writing application code. Doing this the night before frees an hour.
Rules
All three CONFIRMED by organisers, the first two answered on 17 September.
Pre-written code is allowed. Organisers framed it as warming up before build day. So the eight hours on Friday are for integrating, extending and polishing, not for starting from zero. This only helps if the week before is used.
Declare pre-existing work. CONFIRMED from the finalist briefing deck: "If you have already built something, say so. Tell us what existed before and what you built during the event. Everyone starts from the same line on the 18th. Be honest with us and we will work with you. The repository will tell the story either way." PRIOR_WORK.md in the repo is that declaration, file by file. Commit it before 9:00 AM on the 18th so the timestamp supports it, and fill its build-day log during the day.
Fresh repository on the day. CONFIRMED from the briefing deck: Elastic creates a new private GitHub repository per team on 18 September, every member is added by GitHub username, and all work across both days is pushed there. Have every teammate's GitHub username written down before arriving. Copy everything from this repo except context.md, CLAUDE.md, CLAUDE.local.md, resources/, .claude/ and .env.
Dataset prep beforehand is allowed, with a condition. You must share the exact sources you fetched or scraped the data from. This is a provenance requirement and it has two consequences:
• Real CheQ production data is out of the question. It is regulated, it is not yours to remove, and this rule would force you to name its origin in front of Elastic, AWS and fourteen other teams.
• Synthetic data is the clean answer. The source is your generator script, which lives in the repo. Add a short DATA.md stating what the generator produces, which break types it seeds, and one explicit line that no production or customer data was used.
• Any genuinely public data used (a sample statement format, a public transactions dataset) needs its URL recorded.
• The briefing deck adds, CONFIRMED: "If it is synthetic, say it is synthetic. That is fine, and hiding it is not." It also says live scraped data "is harder and the effort shows". For regulated reconciliation data there is nothing legitimate to scrape, so say that plainly rather than apologise for synthetic data. DATA.md already does.
The idea is locked to the Round 1 submission. Organisers said to stick to the idea or proposal that got shortlisted. No pivoting on the day. The submitted PDF is the specification.
Elastic is mandatory in the architecture, stated twice in the AMA. Which Elastic features you use is up to your use case. AWS, Sarvam and the rest are optional but were strongly encouraged, and the AMA said using the combination carries weight in evaluation.
What they are judging on
The four parameters, stated in the AMA
CONFIRMED, from Ashish Davari, Principal Solutions Architect and Search and GenAI Specialist at Elastic. He said these are not strictly mandatory, but they make your story good at judging time.
1. Grounded, not guessed. Use the LLM's reasoning, not its knowledge. Answers must come from your data, because a model's training data is not always true and your data keeps refreshing.
2. Not just conversational. His words: chat is solved, RAG is solved, even having an agent is solved. The question is whether your agent can take action.
3. Measurable impact. Show business value to the panel, and measure it where you can.
4. Built on Elastic and AWS.
Parameter 2 is the one LedgerLens must consciously satisfy. An agent that explains and stops falls in the category he called solved. The Elastic Workflow that opens a case is what answers this.
The rubric weights
CONFIRMED. The finalist briefing deck (know-before-you-build.pdf, "Rule 6 · Judging criteria") reproduces the rubric "exactly as it is published on the event page. Nothing added, nothing hidden." 100 points, five criteria, each with two sub-weights. Judges' decisions are final and binding.
Criterion
Weight
Breakdown
Innovation
25
Originality 10 · AI Implementation 15
Technical Implementation
30
Elasticsearch Integration 15 · Technology Stack 15
Impact
20
Problem Solving 10 · Market Potential 10
User Experience
15
Interface Design 8 · Usability 7
Presentation
10
Demo Quality 5 · Pitch Effectiveness 5
What Technical Implementation means to them, from the same deck: "Ingestion alone is not integration." Show how data arrives (streams, pipelines, index and mapping decisions). Show the retrieval (which queries and why). Connect it to the LLM (the path from a question to a grounded answer). Use Agent Builder if it fits and show the workflow you built. Reach for the wider platform (webhooks, email actions, integrations). "We want to see how differently you can use it, not that you used it."
Consequences for LedgerLens, INFERRED. Technology Stack is 15 points on its own, so AWS must actually run (the Bedrock inference endpoint), not sit in the diagram. User Experience is 15 points, more than Presentation, so the console is not optional. AI Implementation is 15 points, so the trace waterfall and the live traceability check are worth showing slowly.
A separate HackerEarth version of the same event words the five blocks as: novelty and use of generative AI, effective use of Elasticsearch and how well the solution is architected and built, practical real-world application, simplicity and usability, and clarity of the demo and pitch.
Two direct answers from the AMA
Originality versus execution. He said they are trying to find the right balance, that a very good idea you cannot execute or show is not ideal, and that the idea does not need to be rocket science. Picking a basic problem, solving it with the stack and demonstrating it is good. This is permission to stop worrying that reconciliation sounds unglamorous.
Production use cases are welcome. A participant asked whether a real production problem was acceptable and he said absolutely, submit it. Mridul ships this class of system at work, which is credibility no other team can fake.
What to say to the jury. He gave a direct instruction: explain the nuances of how you are solving search, for example hybrid search through a single search API. So hybrid search is something Elastic has explicitly asked finalists to talk about on stage.
Tracks, partners, credits, prizes
Tracks
Four, CONFIRMED from the AMA.
Track
Focus
1. Search and AI Platform
Chat, AI agents, search, vector search
2. Observability
Monitoring use cases, including monitoring scripts and agents
3. Security and AI SOC
Attack discovery, AI-based SIEM, triage and threat-hunting workflows
4. Industry Vertical Demo
Customer-facing, reusable, for a named industry: BFSI, e-commerce, public sector, healthcare
LedgerLens was submitted under Track 4, named in the submission as Industry Solutions and Vertical Experiences (BFSI).
Partners
• Elastic and AWS: organising and technology partners.
• NASSCOM AI: industry partner.
• Sarvam: AI partner. Recommended in the AMA for Indian-native and multilingual use cases, including voice.
• HackCulture: innovation partner, runs the platform.
Credits
CONFIRMED that AWS, Elastic Cloud and Sarvam credits exist. Issued per team, not per individual, because credits carry a cost and are meant to be used carefully. The AMA said the team would follow up with amounts.
Mechanism, CONFIRMED from the briefing deck. Elastic: start on Elastic Cloud Serverless now and integrate against it before the 18th, "so you are not learning the console on day one". AWS: test enrolments and a sandbox environment are provided on the finale; the specific services are announced on the 18th, to everyone at once. Sarvam: a signup link per team is shared on the finale; signing up through it gets the team credits. Amounts still unknown.
ACTION: create the Serverless project tonight and do not wait for credits.
Without credits, the fallback is the free Elastic Cloud trial at cloud.elastic.co/registration: 14 days, no card needed, full access to Search, Observability and Security. Som recommended creating a Serverless project as the fastest option.
Prizes
Total pool ₹7.5 lakh including Sarvam credits, CONFIRMED from the briefing deck. First ₹3,00,000 plus ₹75,000 Sarvam AI credits and a showcase at Elastic{ON} Mumbai. Second ₹2,00,000 plus ₹50,000 Sarvam credits. Third ₹1,00,000 plus ₹25,000 Sarvam credits. AMA 1 also mentioned mentorship from Elastic and AWS and a feature on Elastic's global blog. The showcase date is still open (see Open questions).
Twenty teams are competing for three places. The deck lists them: juzzt builders, fovea, kaapi and commit, ai hero academia, sandboxed, winner, han solo, tyr, defcon1, vinsforge, theants, outliers, techno crackers, saikrishna, pie square, copilotverse, eden ai labs, syndicate smashers, frustrated engineers, calyirex. ACTION: know which one is ours before Friday.
Who to ask what
Person
Organisation
Ask them about
Som (som@elastic.co)
Elastic
Technical mentor. Architecture, Elastic setup, demo format, anything about the build
Ashish Tiwari
Elastic
Technical mentor. Principal Solutions Architect, Search
Komal Prabhakar (komal.prabhakar@elastic.co)
Elastic
Event logistics, presentation format. Regional Marketer, APJ; event coordination
Manish Raj Kunwar (manish.kunwar@elastic.co)
Elastic
Posted the venue details. Head of Marketing, India; leads Forge the Future. Event questions, not technical ones
Vinayak Gavariya
Sarvam
Mentor. AI Engineer, Developer Relations. Sarvam API, models, the signup link and credits
Udayasimha Theepireddy
Elastic
Mentor. Director, Cloud and AI Ecosystem. The deck says: bring AWS questions here
Ashish Davari
Elastic
Principal Solutions Architect, ran the AMA. The rubric thinking comes from him
Kishore S R, Manvendra Singh, Shreyas Aradhya, Mekhala R
HackCulture
Platform and event operations
Judges, CONFIRMED from the briefing deck. One per partner; they score against the published rubric and their decisions are final.
Ravindra Ramnani, Head of Field Engineering, India, Elastic.
Sehaj Virk, Head of Strategy and GTM, Model APIs, Sarvam.
Ankit Bose, Head of AI, Nasscom.
Srinivas Pendyala, Senior Solutions Architect, WW Data and AI, AWS.
INFERRED: one judge each from Sarvam and AWS means a Sarvam feature that runs and a Bedrock path that runs are each worth a quarter of the panel's attention. The Nasscom judge is the one most likely to care about the business number and the regulated-industry posture.
Behaviour observed in the channel: mentors reply, usually within hours, and two finalists got same-day answers. One participant who chased across several routes waited days and grew visibly frustrated. Ask early, and ask in the channel rather than by direct message.
Resources already posted in the channel, both on 7 September:
• know-before-you-build.pdf, the finalist briefing deck by Som. Read on 17 September; its facts are folded into this document (rubric with sub-weights, fairness and disclosure rule, fresh repo per team, environments and credits mechanism, judges, mentors, day-two hours, presentation and data guidance).
• AMA 2 recording.mp4, the finalists-only session. Still not reviewed. The transcript in resources/ is AMA 1 (pre-shortlisting). Worth watching for anything the deck left out, but the deck has answered the big questions.
Som also pointed finalists at npx skills add elastic/agent-skills, which installs official Elastic skills for Claude Code, Cursor and Copilot covering Elasticsearch APIs, Kibana, Fleet, Beats and observability patterns. Install before build day, not during it.
The submitted idea: LedgerLens
This is what was shortlisted, so this is what must be built. Summarised from the submission PDF.
One line. An explainable reconciliation-break investigation agent for lending and payments operations.
The problem. Three systems must agree about money: the internal event-sourced ledger, the PSP or bank settlement file, and the disbursal pipeline that pushed the funds. When they disagree, that is a reconciliation break. A disbursal marked success with no settlement credit. A double debit. A fee mismatch. A stuck mandate. Today an analyst investigates each by hand, pulling ledger entries, cross-checking the statement, tracing payment logs, and writing a root cause. It takes hours per break, does not scale on high-volume days, and the write-up is only as good as one tired human at 11pm. Breaks tie up settlement cash, delay refunds and create audit exposure.
The solution. A multi-step agent on Elastic Agent Builder that investigates a break end to end and produces an audit-ready explanation a finance or compliance reviewer signs off in seconds. It reconstructs what happened from the ledger, matches against the settlement file, correlates the disbursal traces, classifies the break, and narrates the finding with every figure and document ID attached.
The core principle, and the sentence a judge should remember. The model explains, ES|QL decides, and every number is traceable. The LLM never touches a number: every amount, count and match decision is computed by a deterministic ES|QL tool and passed through verbatim. The model only selects tools, orders the investigation, and explains the result.
The five-step demo flow, as submitted
1. Show a day's settlement containing a seeded break: a disbursal marked success with no matching credit in the bank file.
2. Trigger LedgerLens. It runs the ES|QL match tool, computes the exact missing amount, classifies the break type by rule.
3. It correlates the disbursal APM trace and finds the failure point in the pipeline.
4. It returns the audit-ready report: root cause in plain language, every figure cited to a source event ID.
5. Open the Agent Builder trace waterfall to prove the model computed nothing. Then approve the workflow that opens the case.
Declared scope
In scope: ingestion of synthetic ledger, settlement file and disbursal traces into one Elasticsearch index; an Agent Builder agent with three to four custom ES|QL tools for match, delta and rule-based classification; one Elastic Workflow that opens a case and notifies, gated by human approval; a retrieval tool over past resolved breaks; a Kibana ops console with embedded chat.
Deliberately out of scope, and worth saying out loud on stage: live bank or PSP connections, because seeded data keeps results reproducible for judging; and automated remediation of funds, because every write stays behind human approval, which is the correct posture for regulated money movement.
The three headline numbers promised
• Hours to seconds: per-break investigation time, analyst manual versus agent.
• 100% of reported figures traceable to a source event ID.
• Zero numbers generated by the LLM, by construction.
The third is the strongest claim in the submission, because most agent projects cannot make it.
Glossary
Every term in the submission, in plain language. Any term you cannot say out loud is a term to cut from the pitch.
Elasticsearch fundamentals
Elasticsearch. A database built for searching text fast. Usually not your source of truth: your ledger stays in Postgres and you copy data in so you can search it. Also called Elastic or ES.
Inverted index. The trick that makes it fast. A normal index says "given a row, here is its content". An inverted index says "given a word, here is every document containing it", like the index at the back of a textbook. Searching becomes a few lookups instead of scanning every row, and stays fast as data grows.
Analysis. The step where text is broken into words when it is stored. It lowercases, strips word endings, drops filler words. Defaults are fine.
BM25. The default scoring algorithm. It is why results come back ranked by how well they match, with a score, which a normal database does not give you.
Document, field, index, mapping. A document is one record stored as JSON, roughly a row. A field is one key inside it, roughly a column. An index is a collection of documents of the same kind, roughly a table. A mapping is the definition of what type each field is, roughly a schema.
text versus keyword. The mapping decision that trips people up. text means analyse it and break it into words: use for human-written descriptions. keyword means store it whole and match exactly: use for UTRs, IDs, status codes. Getting this wrong costs an hour of confusion on build day.
Node, cluster, shard, replica. A node is one running Elasticsearch process; a cluster is a group of them. An index is split into shards spread across nodes so searches run in parallel; replicas are copies. Elastic Cloud manages all of this, so you will not touch it.
Query DSL. The original way to query: a nested JSON object sent over HTTP. Verbose. Most older tutorials use it.
ES|QL. Elastic's newer piped query language, and the one to learn. Operations chain left to right like a shell pipeline: FROM breaks | WHERE break_type == "timing" | STATS count = COUNT(*) BY partner | SORT count DESC. It filters, aggregates and computes. Your reconciliation checks are written as ES|QL queries.
Aggregations. Grouping and summarising, the equivalent of GROUP BY.
Kibana. Elastic's web UI. You browse data, write queries, build dashboards and configure agents here. You will live in it on build day.
Beats, Logstash, Elastic Agent. Tools that pull data from somewhere and push it into Elasticsearch. Probably not needed if you index from your own code.
Search that understands meaning
Keyword search. Matches the words. Fails when people write the same thing differently: a ticket saying "the NBFC sent their statement a day late" never matches a search for "UTR mismatch".
Semantic search. Matches the meaning, so differently-worded descriptions of the same problem still come back. Fails on exact identifiers, because a UTR string has no meaning.
Hybrid search. Running both at once and merging the two result lists into one ranking. Elastic does the merging for you. Break investigation needs both halves: exact matching for IDs, meaning matching for human descriptions. The AMA explicitly asked finalists to explain this on stage.
Embeddings and vectors. Converting text into numbers that represent its meaning, which is what makes semantic search possible. Elastic stores these as dense vectors, sparse vectors or rank vectors.
semantic_text. An Elasticsearch field type that handles the conversion for you. You index plain English; Elastic splits it and runs it through the model itself, at index time and at query time. A few lines of mapping instead of an afternoon of pipeline work.
ELSER. Elastic's own built-in model for semantic search, running inside your cluster. The name stands for Elastic Learned Sparse EncodeR and the name does not matter. What matters is that it is the in-house default, and using the vendor's own model scores well with vendor judges.
Inference endpoint. A connection you create once, pointing Elastic at a model. With a Bedrock API key, Elastic then generates embeddings for you without custom code.
Three-phase retrieval. Elastic's re-ranking, similarity ranking and rescoring, available through a single search API. Worth one sentence on stage.
The agent layer
Agent Builder. Elastic's built-in way to make an agent, configured in Kibana rather than written in code. It is the reasoning loop: it selects which tool to run next based on the last result, keeps context across steps, and can pause for a clarifying question. The AMA called it the brain.
Tool. A function the agent is allowed to call. Yours are parameterised ES|QL queries: match, delta, classify.
Trace waterfall. Agent Builder's visual timeline of every step the agent took in one run. This is the artefact you open on stage to prove the model computed nothing. Do not confuse it with an APM trace.
Elastic Workflows. The action layer, written in YAML with triggers, inputs, steps and loops. The AMA called it the hands, paired with Agent Builder as the brain. The AMA example was a trip planner: the agent finds hotels, the user says book it, and workflows fire in sequence.
MCP. Model Context Protocol, a standard way for an AI tool like Claude Code to call your agent or your indices as tools. Kibana runs an MCP server by default.
A2A. Agent-to-agent protocol, for multi-agent systems. Not needed here.
AWS and the rest
Amazon Bedrock. AWS's service for calling large language models. Your narration model runs through it.
Bedrock Guardrails. Bedrock's content and safety filtering layer.
S3 and Lambda. AWS file storage, and small functions that run on a trigger. In the submission they ingest raw PSP and bank files.
APM and traces. APM means application performance monitoring. A trace is the recorded path of one request through your services, with timings and errors. In LedgerLens, disbursal pipeline traces are the evidence that shows where the payment actually failed. This is what lets the agent say why, not just what.
Sarvam. The Indian AI partner. The submission names it for plain-language and Indic explanations so Indian ops and compliance teams can read the report in their own language.
Reconciliation terms, for judges who are not from fintech
Reconciliation break. Two or more systems disagreeing about the same transaction.
UTR. Unique Transaction Reference, the identifier a bank gives a transfer.
PSP. Payment Service Provider.
Mandate. A customer's standing authorisation for a lender to debit their account.
Event-sourced ledger. A ledger stored as a sequence of events rather than as current balances, so the full history of what happened to the money is reconstructable.
Scope triage for build day
INFERRED, not from organisers. The submission names eleven technologies and the build window is eight hours ending in a hard 5 PM cutoff. Judges see fifteen teams: the one whose four core things work flawlessly beats the one whose eleven things half-run. Agree this cut list with other team member
Must exist, or there is no demo
1. One Elasticsearch index holding synthetic ledger, settlement and trace data.
2. Two or three ES|QL tools: match, delta, classify.
3. An Agent Builder agent that calls them in sequence and narrates the result.
4. The trace waterfall, open and visible.
That is demo steps 1 to 4 from the submission. Protect these above everything.
Strongly worth having
5. One Elastic Workflow that opens a case, gated by human approval. This is demo step 5 and it is what answers the AMA's demand that agents take action. Without it the project sits in the category the AMA called solved.
Cut or fake if time runs short
Item
What to do instead
What to say if asked
Retrieval over past resolved breaks
Built on 17 Sep: one hybrid ES|QL query (FORK a BM25 branch and a semantic_text branch, FUSE with RRF), verified locally, same-type precedent at rank 1 for all five types. If the cloud project rejects FORK/FUSE, setup:agent falls back to Agent Builder's index_search tool
One ES|QL query, exact IDs and fuzzy descriptions in one search API; this is the hybrid-search nuance the AMA asked for
Kibana ops console with embedded chat
Built on 17 Sep as a standalone console (src/console): break queue, report, live traceability check, approve/dismiss. Fallback remains Agent Builder's own chat window
The console is where the traceability check lives; the investigation is the product
Sarvam narration
Built on 17 Sep as a Hindi/Kannada toggle through Sarvam Translate (sarvam-translate:v1); needs the key issued on the 18th. Hidden when no key
Sponsor fit and Indic readability; the traceability check re-runs on the translation
Real S3 and Lambda ingest
Load files directly
Ingest is plumbing; the time went into investigation logic
Real APM instrumentation
Index synthetic trace documents shaped like traces
The correlation is what matters, not how traces were produced
Build status, evening of 17 September
INFERRED from running it. Everything below was verified against a local Elasticsearch 9.5.4 + Kibana 9.5.4 in Docker, nothing yet against a cloud project or a real language model.
Done: generator and answer key (14 seeded breaks, five types including one UNRESOLVED), four strict mappings, ingest, five ES|QL tools, verify scorecard (14/14 detected, 0 false positives, written to BENCHMARKS.md), Agent Builder tools and agent created through the Kibana API with a passing smoke execution, workflow that creates a Kibana case and an audit record (executed), console with live traceability check (exercised in mock mode), 14 unit tests, README, DATA.md, DEMO.md, PRIOR_WORK.md, six-slide deck.
Not done, needs the 18th: cloud project connection and ingest; first run of the agent against a real model and tuning of elastic/agent/instructions.md; Bedrock inference endpoint on the AWS sandbox; Sarvam key; recorded video; BENCHMARKS.md, README numbers and slides 4 and 5 refreshed from the cloud run.
Timing
Hard feature freeze at 3:00 PM. The last two hours are for the README, the recorded video, and the submission itself. Teams lose finals in the last two hours far more often than they win them there.
Team split
Three people, three lanes, fixed at 9 AM and not renegotiated.
Lane
Owns
Elastic
Mappings, ingest, ES
Agent
Agent Builder loop, Bedrock, the workflow
Demo
Screen, README, demo script, and presents on the 19th
Presentation and demo
Format, CONFIRMED by Komal on 10 September. Five to seven minutes. A fancy slide deck is not wanted. One or two intro slides for context, the problem and the solution, then the rest is demo. The story they want: what problem are you solving, how does it work, why does it matter. Her framing was that the product is the star, and a compelling demo with confident storytelling beats a slide-heavy deck.
From the finalist briefing deck, CONFIRMED: "Say less, and be able to back all of it. Every claim technically correct. If you cannot defend it in the Q and A, take it out. Cite your numbers. Benchmarks, latencies, accuracy figures. Tell us where they came from. Your slides, your diagram and your repository should describe the same system." BENCHMARKS.md exists for the numbers; the manual-time baseline is labelled everywhere as Mridul's own estimate from production, not a benchmark.
The recorded video option, CONFIRMED by Som on 10 September. Another team said part of their flow was too slow to demo live. Som told them to simulate it, record a demo video, put it in the GitHub repo, and share it with judges to watch at end of day on the 18th. He added that a demo could stretch to around 10 minutes if walking through things one at a time, but said he would rather have the video so everyone is aligned, and left it to the judges whether they watch.
Take this regardless. Record a clean full investigation and commit it before 5 PM Friday. It removes venue wifi risk, covers a live run misbehaving, and means judges see the work twice. Do not plan on getting 10 minutes: build for 5 to 7.
Run of show
Time
Content
0:00 to 0:30
The problem, with one number attached
0:30 to 1:00
Why current tooling fails: rules match or they do not, then a human starts hunting
1:00 to 4:00
Live demo: the seeded break, the investigation, the trace waterfall, one honest failure
4:00 to 4:30
Architecture slide: mappings, ES
4:30 to 5:00
The three numbers, and what production would need
Rules for the demo
• Rehearse ten times, out loud, standing, with a timer.
• Preload all seed data before presenting.
• Assume the venue wifi fails at some point.
• Lead with the money, not the architecture. LedgerLens sounds unglamorous next to flashier projects; the defence is being the only team with a number a CFO would care about.
• Include one break the agent cannot resolve, where it says so and escalates with what it ruled out. Admitting uncertainty buys more credibility than it costs.
• The line to land: the model explains, ES|QL decides, and every number is traceable.
The README is part of the submission
Judges evaluate on the evening of the 18th, before anyone presents. Their first impression is the repo. Write the README as if it is the only thing they read: the problem, the architecture, how to run it, the numbers, and DATA.md for provenance.
Open questions and unverified claims
Nothing in this section should be stated as fact on stage or in the repo until checked.
Date conflict on the top-3 showcase
Two sources disagree and both cannot be right.
Source
Claim
AMA 1 (recorded before shortlisting)
Top 3 present in person at Elastic{ON} Mumbai on 30 September
Public hackathon listing
Top 3 showcased at Elastic{ON} Bengaluru on 24 September
Finalist briefing deck (7 September)
First place showcases at Elastic{ON} Mumbai. No date given
Two organiser sources now say Mumbai; only the public listing says Bengaluru. The date, 24 or 30 September, is still unconfirmed. Ask in the channel.
Claims inside the submission PDF that need checking
Sarvam-105B (Indus). VERIFIED on 17 September from docs.sarvam.ai: sarvam-105b is a real chat model on Sarvam's API (128K context; sarvam-105b-conversations is the 32K variant; sarvam-m is deprecated). "Indus" is Sarvam's consumer chat app, not a model name. Say Sarvam-105B if asked; never say Indus. What LedgerLens actually runs is Sarvam Translate (sarvam-translate:v1) for Hindi and Kannada reports, so that is what to show and claim.
The PHAROS reference. The submission claims a previous Elastic Agent Builder hackathon winner scored by keeping all statistical computation inside ES|QL and using the model only to narrate. If this cannot be sourced, do not mention it. An Elastic judge may know the real story.
"I can defend every technical claim in the Grand Finale." The submission says this. Make it true by walking the architecture box by box out loud before Saturday. Any box where you stall is a box to cut, not a box to bluff.
Not yet known
• RESOLVED: the official judging weights, with sub-weights, are in the finalist briefing deck. See The rubric weights.
• PARTLY RESOLVED: know-before-you-build.pdf is read and folded in. AMA 2 recording.mp4 is still not reviewed.
• PARTLY RESOLVED: the credit mechanism is known (see Credits); the amounts are not.
• Whether teams can stay at the venue overnight between the two days. A thread exists with unread replies.
• Food, wifi, desk setup or dress code at the venue. Nothing posted.
• Whether team have read the submission PDF. If the three of you arrive with different mental models, the first two hours go to arguing instead of building.
Checklist before 9 AM on 18 September
In priority order. Stop when time runs out, not when the list ends.
[ ] Confirm team are both physically in Bengaluru for both days. Nothing else matters if this fails.
[ ] Send both of them the submission PDF and agree the cut list.
[ ] Reread the submission PDF twice. Say the problem, the solution and the core principle out loud from memory.
[ ] Ask in the channel about the showcase date conflict and the credits.
[ ] Create the Elastic Cloud account and a Serverless project. Get an API key. Connect from code once. Recommended type: Observability, which has Agent Builder, Workflows and Cases in one project. Then cp .env.example .env, fill it, and run npm run all.
[ ] Run the agent once against a real model as soon as the project exists: open Agent Builder, type "Investigate DSB-20260916-00297." and tune elastic/agent/instructions.md until the report format holds. This is the one thing not yet exercised.
[ ] Collect every teammate's GitHub username for the repository Elastic creates on the 18th.
[ ] Commit PRIOR_WORK.md and BENCHMARKS.md before 9:00 AM on the 18th so the timestamps support the disclosure.
[x] Write the synthetic data generator: ledger, settlement file, traces, seeded break types, answer key. Done 17 Sep: src/generate.js.
[x] Write DATA.md stating the generator is the source and no production data was used. Done 17 Sep.
[x] Index the data and run one ES|QL query against it, however trivial. Done 17 Sep against local Elasticsearch 9.5.4; npm run verify passes. Repeat on the cloud project.
[x] Decide the text versus keyword mapping for every field. Done 17 Sep: elastic/mappings, dynamic strict, every identifier keyword, money in integer paise.
[~] Run npx skills add elastic/agent-skills and read the semantic search docs Som linked. Not installed (it writes into .claude/); the API shapes were verified from the official docs and the agent-skills repository instead, and confirmed against local Kibana 9.5.4. Optional now.
[x] Spend an hour in Agent Builder and decide whether to use it or hand-roll the agent loop. Decided 17 Sep: Agent Builder. Tools, agent and workflow are created by src/setup-agent.js and were verified on local Kibana; only the model run is outstanding.
[x] Verify the Sarvam model name, or drop it. Done 17 Sep: sarvam-105b exists; Indus is the app, not the model.
[ ] Sleep. Arriving tired costs more than one more feature.