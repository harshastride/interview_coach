# Azure reading assessment

The integration is opt-in. Keep `READING_ANALYSIS_PROVIDER` unset until the Speech resource and local analysis service are ready. No Foundry agent or Logic Apps connector is needed.

## Setup

Add these settings locally to `.env` (never commit a key):

```dotenv
READING_ANALYSIS_PROVIDER=azure
AZURE_SPEECH_KEY=<your Speech resource key>
AZURE_SPEECH_REGION=centralindia
AZURE_SPEECH_LOCALE=en-IN
ANALYSIS_URL=http://localhost:8001
```

Create the Speech resource in a supported region such as **Central India**. South India supports Foundry resources but not Speech processing. Changing only the region variable is insufficient: the key must belong to the resource in that region. See [supported Speech regions](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions).

Keep the existing `GEMINI_API_KEY` for text coaching. The adapter uses the Speech resource key and region, not a Foundry project endpoint. For local Node development, install ffmpeg and run the Python service in a separate environment:

```sh
python3 -m venv analysis/.venv
analysis/.venv/bin/pip install -r analysis/requirements.txt
analysis/.venv/bin/uvicorn main:app --app-dir analysis --host 127.0.0.1 --port 8001
```

If port 8001 is occupied by another application, use another free port (for example 8002) in both the service command and `ANALYSIS_URL`. Restart the Python service after reboot; starting Node alone does not start Python.

Then restart `npm run dev`. Alternatively, `docker compose up -d --build` supplies ffmpeg and the analysis service and overrides `ANALYSIS_URL` with its internal address. Ollama is unnecessary in Azure mode. Whisper downloads its model on first use. Startup adds the private analysis ledger; no manual migration command is required.

## Processing and costs

1. Record only the candidate, up to 180 seconds, and submit on Done or the time limit. Question playback is disabled during capture. Azure receives the completed recording through continuous recognition, which supports passages longer than 30 seconds.
2. Decode audio to mono 16 kHz PCM and measure its actual duration on the server. Local transcription and metrics establish a baseline on every attempt; empty speech does not reserve Azure allowance.
3. Within each UTC calendar month, accepted attempts 1, 6, 11, etc. use Azure if their full rounded-up duration fits the remaining 1,800-second allowance. Other attempts use local analysis. A per-user transaction lock prevents concurrent requests overspending the allowance. Pending/failed jobs count toward cadence; uncertain Azure failures retain their reserved seconds. This is a conservative submission allowance, not an Azure billing meter.
4. Gemini receives reference text, current measurements and up to two previous local baselines for the same passage, locale and metric version. It writes coaching only. It never receives audio through this pipeline. Local hosting and Gemini coaching still have costs after Azure allowance is exhausted.

Identical recordings/reference/question/locale reuse completed results. Interrupted duplicates return a retry instruction rather than submitting to Azure twice. The ledger stores transcripts, measurements and coaching, not audio. Temporary decoded files are removed. Ledger access is through the server's database role; RLS and grants block public Data API access.

## Scores and limitations

Azure accuracy and fluency are weighted by spoken word duration across segments. Completeness comes from app-side transcript alignment; overall is an app composite: 40% accuracy, 30% fluency, 30% completeness. Word/phoneme scores and timestamps are retained. This composite is not Azure's native overall score. Continuous recognition does not support automatic miscue detection, so omissions/insertions/substitutions use local alignment.

Indian English is the default. Prosody assessment is not enabled. Local scores are transcript/timing estimates, not pronunciation measurements. Reports identify detailed assessment versus practice feedback and suppress cross-provider improvement deltas. Gemini must not infer technical knowledge, personality, confidence or pronunciation improvement from local transcripts. Changes in transcription quality can affect apparent progress.

Azure failure returns labelled local feedback; local service failure returns a retryable error. Gemini failure keeps template coaching. Missing Azure setup returns a setup error only when Azure mode is explicitly enabled. Without the flag, legacy behaviour is unchanged.

## Verification

Run `npm test`, `npm run lint`, and `npm run build`. Automated coverage includes scoring/alignment, empty speech, allowance boundaries and cadence, provider fallback and existing reading UI flows. Tests use mocks rather than paid Azure requests. Before enabling for candidates, verify a real en-IN recording longer than 30 seconds and its word-level report with your resource credentials.

Reference: [Microsoft pronunciation assessment documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment).
