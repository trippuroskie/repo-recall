# RepoRecall: Unit Economics & Benchmarking Strategy

## Table of Contents
1. [Unit Economics Analysis](#unit-economics-analysis)
2. [Benchmarking Strategy](#benchmarking-strategy)

---

## Unit Economics Analysis

### Current Architecture Costs

RepoRecall uses **OpenRouter** to call LLMs (defaulting to Google Gemini models) and the **GitHub API** for code retrieval. There are no embeddings or vector DB costs — the system uses agentic exploration + direct file fetching rather than RAG.

#### Cost Per Analysis (Codebase Brief Generation)

The analysis pipeline has two LLM-heavy phases:

**Phase 1: Exploration** (via `google/gemini-3-flash-preview`)
- Up to 20 LLM iterations, each with tool calls
- System prompt: ~2-5K tokens (file tree, README excerpt, package.json)
- Each iteration: ~500-2K tokens input (tool results) + ~200-800 tokens output (reasoning + tool calls)
- Conversation grows cumulatively — later iterations include all prior context

Estimated token usage per analysis:
| Component | Input Tokens | Output Tokens |
|-----------|-------------|---------------|
| Exploration (20 iterations, cumulative context) | ~80K-150K | ~8K-15K |
| Synthesis (1 call with all findings) | ~15K-30K | ~3K-8K |
| **Total per analysis** | **~100K-180K** | **~12K-23K** |

**OpenRouter pricing for these models (as of April 2026):**

| Model | Input/MTok | Output/MTok |
|-------|-----------|-------------|
| google/gemini-3-flash-preview (exploration + fast chat) | ~$0.10 | ~$0.40 |
| google/gemini-3.1-pro-preview (synthesis) | ~$1.25 | ~$5.00 |
| google/gemini-2.5-pro-preview (deep chat) | ~$1.25 | ~$5.00 |

**Cost per analysis:**
| Phase | Model | Input Cost | Output Cost | Total |
|-------|-------|-----------|-------------|-------|
| Exploration | Gemini 3 Flash | $0.01-$0.015 | $0.003-$0.006 | ~$0.013-$0.021 |
| Synthesis | Gemini 3.1 Pro | $0.019-$0.038 | $0.015-$0.040 | ~$0.034-$0.078 |
| **Total LLM cost per analysis** | | | | **~$0.05-$0.10** |

> Note: Gemini models via OpenRouter are exceptionally cheap. If we switch to Claude or GPT-4, costs increase ~10-30x. For reference, the same analysis with Claude Sonnet 4.6 would cost ~$0.80-$1.50 per analysis.

#### Cost Per Chat Message

**Fast mode** (Gemini 3 Flash):
- System prompt + brief context + source files: ~5K-15K input tokens
- Response: ~500-2K output tokens
- **Cost: ~$0.001-$0.006** per message (~0.1-0.6 cents)

**Deep mode** (Gemini 2.5 Pro):
- Multiple iterations, more files fetched
- ~20K-40K input tokens, ~2K-5K output tokens
- **Cost: ~$0.035-$0.075** per message

#### Infrastructure Costs (Fixed Monthly)

| Service | Plan | Monthly Cost |
|---------|------|-------------|
| Supabase | Pro | $25 (may need ~$125 with Large compute at scale) |
| Vercel | Pro | $20 |
| Domain | Annual | ~$1/mo |
| **Total fixed** | | **~$46-$146/mo** |

---

### Per-User Economics

#### Free Tier User (3 analyses + 20 chat messages/month)

| Activity | Quantity | Unit Cost | Total |
|----------|----------|-----------|-------|
| Analyses | 3 | $0.075 avg | $0.225 |
| Chat (fast) | 18 | $0.003 avg | $0.054 |
| Chat (deep) | 2 | $0.055 avg | $0.110 |
| **Total cost per free user** | | | **~$0.39/mo** |

Revenue: $0. **Loss: ~$0.39/user/mo** (acceptable for conversion funnel)

#### Pro User ($9/month) — Light Usage

Assumption: 5 analyses + 40 chat messages/month (80% fast, 20% deep)

| Activity | Quantity | Unit Cost | Total |
|----------|----------|-----------|-------|
| Analyses | 5 | $0.075 avg | $0.375 |
| Chat (fast) | 32 | $0.003 avg | $0.096 |
| Chat (deep) | 8 | $0.055 avg | $0.440 |
| **Total cost per light Pro user** | | | **~$0.91/mo** |

**Gross margin: ~$8.09/user = 89.9%**

#### Pro User — Heavy Usage

Assumption: 15 analyses + 150 chat messages/month (70% fast, 30% deep)

| Activity | Quantity | Unit Cost | Total |
|----------|----------|-----------|-------|
| Analyses | 15 | $0.075 avg | $1.125 |
| Chat (fast) | 105 | $0.003 avg | $0.315 |
| Chat (deep) | 45 | $0.055 avg | $2.475 |
| **Total cost per heavy Pro user** | | | **~$3.92/mo** |

**Gross margin: ~$5.08/user = 56.4%**

#### Pro User — Extreme Power User

Assumption: 30 analyses + 500 chat messages/month (60% fast, 40% deep)

| Activity | Quantity | Unit Cost | Total |
|----------|----------|-----------|-------|
| Analyses | 30 | $0.075 avg | $2.25 |
| Chat (fast) | 300 | $0.003 avg | $0.90 |
| Chat (deep) | 200 | $0.055 avg | $11.00 |
| **Total cost per extreme user** | | | **~$14.15/mo** |

**Gross margin: -$5.15/user = -57.2%** (losing money)

> Deep mode is the cost risk. A power user doing 200 deep chats/month would cost us $11 in LLM alone. This is worth watching — may need a deep chat quota or separate pricing.

---

### Revenue Scenarios

#### Scenario: 1,000 Users (5% Pro Conversion)

| Segment | Users | Revenue | LLM Cost | Margin |
|---------|-------|---------|----------|--------|
| Free users | 950 | $0 | $370 | -$370 |
| Light Pro | 35 | $315 | $32 | $283 |
| Heavy Pro | 12 | $108 | $47 | $61 |
| Extreme Pro | 3 | $27 | $42 | -$15 |
| **Total** | **1,000** | **$450** | **$491** | **-$41** |
| Infrastructure | | | $146 | -$146 |
| **Net** | | **$450** | **$637** | **-$187** |

At 1,000 users with 5% conversion, we're **roughly breakeven on variable costs** but underwater including infrastructure. Need either higher conversion or more users.

#### Scenario: 5,000 Users (8% Pro Conversion)

| Segment | Users | Revenue | LLM Cost |
|---------|-------|---------|----------|
| Free users | 4,600 | $0 | $1,794 |
| Light Pro | 280 | $2,520 | $255 |
| Heavy Pro | 95 | $855 | $372 |
| Extreme Pro | 25 | $225 | $354 |
| **Total** | **5,000** | **$3,600** | **$2,775** |
| Infrastructure | | | ~$250 |
| **Net profit** | | | | **~$575/mo** |

#### Breakeven point: ~2,500 users at 7% conversion rate

---

### Key Risks & Levers

**Risks:**
1. **Deep chat abuse** — unlimited deep chat at $0.055/msg is the biggest cost risk
2. **Model price changes** — Gemini is currently very cheap; if Google raises prices or we need to switch models for quality, costs could jump 10-30x
3. **Large repos** — repos with huge file trees could push exploration to max iterations consistently
4. **OpenRouter dependency** — single point of failure and pricing intermediary

**Cost Optimization Levers:**
1. **Add deep chat quota** — e.g., 50 deep chats/month on Pro, $0.10/msg after
2. **Cache briefs aggressively** — if a user re-analyzes the same repo, skip or partially reuse prior analysis
3. **Prompt caching** — Gemini and Claude both support context caching (~75-90% savings on repeated prefixes)
4. **Model tiering** — use Flash for everything except the final synthesis call
5. **Reduce exploration iterations** — tune the agent to be more efficient (currently caps at 20, most finish in 8-12)
6. **Switch to direct API** — bypass OpenRouter markup by using Google AI Studio / Vertex AI directly

**Revenue Levers:**
1. **Higher price point** — $9/mo is aggressive; $15-19/mo is more standard for dev tools
2. **Team plan** — shared analyses across a team at $29-49/mo per seat
3. **Usage-based component** — charge for analyses beyond a base (e.g., 10 analyses included, $0.50 each after)
4. **Enterprise** — self-hosted / SSO / private deployment

---

## Benchmarking Strategy

### Why Benchmark?

RepoRecall's core value proposition is "understand a codebase quickly." We need to measure:
1. **How well does the agent explore?** (retrieval quality)
2. **How accurate are the generated briefs?** (analysis quality)
3. **How useful are chat answers?** (Q&A quality)
4. **How do changes to models/prompts affect quality?** (regression testing)

### Existing Benchmarks to Learn From

| Benchmark | What It Tests | Relevance |
|-----------|--------------|-----------|
| **SWE-QA** | Q&A pairs about real repos (576 pairs, 11 repos) | **Most directly relevant** — tests codebase Q&A |
| **DeepCodeBench** (Qodo) | 1,144 questions from PRs across 8 repos | **Highly relevant** — uses "fact recall" scoring |
| **CodeRAG-Bench** | Code retrieval + RAG across 8 task types | Relevant for retrieval evaluation |
| **SWE-bench** | Resolving GitHub issues via code edits | Less relevant (tests code editing, not understanding) |
| **CrossCodeEval** | Cross-file code completion | Somewhat relevant for cross-file reasoning |
| **DependEval** | Multi-language hierarchical repo understanding | Relevant for architecture analysis |

### Our Custom Benchmark: "RepoRecall-Bench"

#### Test Dimensions

We should evaluate three distinct capabilities:

**1. Brief Quality** — Does the generated brief accurately capture the codebase?
- Architecture detection accuracy
- Feature identification completeness
- Business context correctness
- Entry point recommendation quality
- Codemap accuracy and usefulness

**2. Chat Q&A Quality** — Can the chat answer developer questions correctly?
- Factual correctness
- Code citation accuracy
- Cross-file reasoning ability
- Handling of "how does X work" vs "where is X defined" vs "why does X do Y"

**3. Exploration Efficiency** — Does the agent use its API budget wisely?
- Files explored vs files that matter
- Iterations needed vs information gathered
- Redundant tool calls

#### Building the Benchmark Dataset

**Step 1: Select Reference Repositories (5-10 repos)**

Choose repos with known ground truth — ideally repos that team members know well, or well-documented open-source projects:
- Small (< 50 files): e.g., a focused library
- Medium (50-200 files): e.g., a typical web app
- Large (200+ files): e.g., a full-stack framework
- Multiple languages/frameworks for coverage

**Step 2: Create Ground Truth Briefs**

For each reference repo, manually author a "gold standard" brief covering:
- Correct tech stack identification
- Complete feature list with correct file mappings
- Accurate architecture description
- Correct business context
- Best entry points for a new developer

**Step 3: Create Q&A Test Cases (20-50 per repo)**

Question taxonomy:
```
| Category              | Example                                                | Difficulty |
|-----------------------|--------------------------------------------------------|------------|
| Architecture          | "What framework and database does this project use?"   | Easy       |
| Feature location      | "Where is the authentication logic implemented?"       | Easy       |
| Data flow             | "How does data flow from the API to the database?"     | Medium     |
| Cross-file reasoning  | "How do these two modules interact?"                   | Medium     |
| Design rationale      | "Why was this pattern used instead of X?"              | Hard       |
| Multi-hop dependency  | "If I change X, what else would break?"                | Hard       |
| Business context      | "What is the revenue model of this app?"               | Medium     |
```

For each question, create:
- Ground truth answer (detailed, with file references)
- List of verifiable facts extracted from the answer
- Expected retrieval files (which files must be consulted)
- Difficulty rating

**Step 4: Evaluation Metrics**

Use a combination of automated and LLM-as-judge metrics:

```
Brief Quality Metrics:
├── Stack Detection Accuracy    = correct_techs / total_actual_techs
├── Feature Recall              = features_found / total_actual_features
├── Feature Precision           = correct_features / total_reported_features
├── Architecture Accuracy       = LLM-judge score (1-5 rubric)
├── Business Context Accuracy   = LLM-judge score (1-5 rubric)
└── Entry Point Quality         = expert_rank_correlation

Chat Q&A Metrics:
├── Fact Recall                 = ground_truth_facts_in_answer / total_ground_truth_facts
├── Faithfulness                = claims_supported_by_context / total_claims
├── Answer Relevancy            = cosine_sim(generated_q_from_answer, original_q)
├── Citation Accuracy           = correct_citations / total_citations
├── Contextual Precision        = relevant_files_retrieved_rank_weighted
└── Contextual Recall           = relevant_files_retrieved / total_needed_files

Efficiency Metrics:
├── API Calls Used              = actual_calls / budget (lower is better for same quality)
├── Exploration Coverage        = key_files_read / total_key_files
└── Redundancy Rate             = duplicate_reads / total_reads
```

### Implementation Plan

#### Phase 1: Minimal Viable Benchmark (1-2 weeks)

Use **DeepEval** as the test harness — it has pytest integration, supports all RAGAS metrics, and works in CI/CD.

```python
# benchmark/eval_chat.py
from deepeval import assert_test
from deepeval.metrics import (
    AnswerRelevancyMetric,
    FaithfulnessMetric,
    ContextualRecallMetric,
    GEval
)
from deepeval.test_case import LLMTestCase, LLMTestCaseParams

# Custom fact-recall metric
fact_recall = GEval(
    name="FactRecall",
    criteria="Extract verifiable facts from expected_output. "
             "Score = fraction of those facts present in actual_output.",
    evaluation_params=[
        LLMTestCaseParams.ACTUAL_OUTPUT,
        LLMTestCaseParams.EXPECTED_OUTPUT
    ],
    threshold=0.7
)

def test_chat_answer(question, expected_answer, system_answer, retrieved_files):
    test_case = LLMTestCase(
        input=question,
        actual_output=system_answer,
        expected_output=expected_answer,
        retrieval_context=retrieved_files
    )
    assert_test(test_case, [
        AnswerRelevancyMetric(threshold=0.7),
        FaithfulnessMetric(threshold=0.8),
        ContextualRecallMetric(threshold=0.7),
        fact_recall
    ])
```

Start with **3 repos, 15 Q&A pairs each** = 45 test cases. This is enough to detect regressions.

#### Phase 2: Brief Quality Evaluation (2-3 weeks)

Add brief-specific metrics:
- Compare generated briefs against gold-standard briefs
- Use LLM-as-judge with rubric scoring for each brief section
- Track stack detection accuracy as a hard metric (exact match)

#### Phase 3: Continuous Benchmarking (ongoing)

- Run benchmark suite on every prompt change or model switch
- Track scores over time in a dashboard
- Add new test cases from real user feedback / failures
- A/B test model choices with benchmark scores before deploying

### Recommended Tools

| Tool | Purpose | Install |
|------|---------|---------|
| **DeepEval** | Test harness + metrics | `pip install deepeval` |
| **RAGAS** | Additional RAG metrics | `pip install ragas` |
| **CodeRAG-Bench** | Pre-built code RAG benchmark data | github.com/code-rag-bench |
| **pytest** | Test runner | `pip install pytest` |

### How to Improve Performance Based on Benchmarks

Once we have benchmark scores, here's how to systematically improve:

1. **Low fact recall** → Improve exploration prompts to read more relevant files, or increase API budget
2. **Low faithfulness** → Improve chat system prompt to ground answers in retrieved code, reduce hallucination
3. **Low contextual recall** → Improve file selection algorithm (currently keyword-based in `selectRelevantFiles`)
4. **Poor architecture detection** → Add more patterns to static analysis fallback, improve synthesis prompt
5. **Inefficient exploration** → Tune exploration prompt to be more strategic, reduce redundant reads
6. **Citation errors** → Improve citation parsing, add validation that cited lines actually contain relevant code

### Future: Embedding-Based Retrieval

The current system uses keyword matching for chat file selection (`selectRelevantFiles`). Adding vector embeddings would likely improve:
- Contextual recall (semantic search > keyword matching)
- Cross-file reasoning (similar code patterns found via embedding similarity)
- Chat answer quality (better context = better answers)

If we add embeddings, the cost model shifts:
- **One-time per repo**: embed all files (~$0.002-$0.06 per repo depending on size and model)
- **Per query**: vector search is nearly free (~$0.00001 per query with pgvector)
- **Storage**: minimal — pgvector included in Supabase Pro plan

This would be a significant quality improvement at negligible additional cost.
