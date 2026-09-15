# Reading assessment architecture proposal

Status: research recommendation, not implemented. Reviewed 2026-09-13.

Two independent AI research agents argued the managed-service and local/hybrid positions, exchanged objections, and converged on this proposal. They were not Google employees. No provider has been benchmarked on this application's candidates yet.

## Current application

The active interview combines Gemini TTS, browser MediaRecorder, and a Gemini reading-analysis request. The Python service is optional and was not enabled in the inspected local environment. It combines faster-whisper transcription, SequenceMatcher text matching, rule-based fluency penalties, acoustic pitch features, optional audEERING emotion predictions, and Ollama/template coaching. The browser SpeechRecognition hook exists but is not called by the current interview screen. The camera is a preview; no eye tracking is implemented.

These are components with distinct jobs, not a team of independently validating audio agents. Adding their scores or averaging several language-model judgments would not establish assessment validity.

## Decision

Pilot one dedicated pronunciation engine alongside application-owned quality checks, speech timing, and reference alignment. Azure Pronunciation Assessment with en-IN is the first integration candidate, not a proven accuracy winner. Compare Speechace offline on compatible short clips. Keep Gemini or Ollama optional for wording feedback from measured evidence; use templates when coaching is unavailable.

Azure documents en-IN pronunciation assessment. Prosody assessment remains en-US only: do not substitute en-US prosody as an Indian-English confidence or clarity score. Recordings over 30 seconds require continuous processing, where EnableMiscue is unavailable; independently align recognized words with the reference for omissions and insertions. [Language support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=pronunciation-assessment), [assessment API](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-pronunciation-assessment).

Speechace supports scripted pronunciation/fluency assessment with word, syllable, and phoneme feedback. Its documented audio limits are 15 seconds Basic, 45 seconds Pro, and 2 minutes Premium, below this app's 180-second limit. Use phrase exercises or deliberate chunking; do not silently truncate attempts. [Features](https://api-docs.speechace.com/getting-started/pre-requisites/api-features), [limits](https://api-docs.speechace.com/getting-started/pre-requisites/api-limits).

SpeechSuper is an additional shortlist candidate for detailed pronunciation feedback; confirm current Indian-English support, duration limits, retention, and contract terms before integration. [Official docs](https://docs.speechsuper.com/).

## Data flow

1. Keep one browser microphone owner and one attempt ID. Record audio once. Keep question/reference TTS separate from candidate speech.
2. Submit the completed attempt to the existing Express route. Decode to a canonical mono PCM waveform in a Python worker while preserving the original audio and timeline.
3. Check for insufficient speech, clipping, and poor signal. Return a retry reason instead of a zero score when evidence is inadequate.
4. Run local voice activity detection/timing and the chosen pronunciation service as independent specialist tasks. Silero is a candidate for speech activity detection. [Repository](https://github.com/snakers4/silero-vad).
5. Obtain an independent transcript for reading-error detection, then align recognized tokens against normalized reference tokens using edit distance. faster-whisper already fits the local stack and supports word timestamps; benchmark filler preservation rather than assuming it. Do not feed the entire expected passage as an instruction to the independent recognizer. [Repository](https://github.com/SYSTRAN/faster-whisper).
6. Normalize acronyms, numbers, and accepted domain pronunciations with a reviewed glossary. Keep evidence for substitutions, omissions, insertions, repetitions, and uncertain words. Forced alignment alone is not pronunciation scoring.
7. Merge observations in application code. Each metric records provider/model or algorithm version, locale, availability, quality, evidence spans, and units. Never average scores whose definitions differ.
8. Produce a strength, one or two actionable corrections, and the next phrase to practise. A language model can explain evidence; it cannot invent or alter scores.
9. Save the attempt and practice target. Compare results only under compatible assessment versions and reading conditions. Protect audio with private access and explicit retention/deletion settings; do not store webcam video by default.

## Metric definitions and boundaries

- Reading coverage and word errors: reference/transcript alignment with observable word spans, distinct from acoustic pronunciation.
- Speaking rate: words per elapsed reading time from speech onset to speech end, including internal pauses. Articulation rate: words per detected speaking time. Preserve original timestamps when VAD removes silence from model input.
- Pauses: report timing and phrase context, rather than penalizing every pause equally. Avoid length-dependent fixed penalties without normalization.
- Clarity: provider-labeled pronunciation evidence plus human validation; not a synonym for native-accent similarity or ASR confidence.
- Delivery steadiness: observable restarts, pacing, and volume patterns. Actual confidence: candidate self-rating, not an emotion classifier.
- Technical knowledge: a separate comprehension question after reading, not inferred from verbatim reading success.
- Eye movement: optional future calibration-based camera feedback. No attention, honesty, confidence, or exact-word-reading judgments from ordinary face landmarks. Looking at the reference is expected during reading.

Do not enable the existing optional audEERING checkpoint as a commercial confidence grader. It predicts arousal/dominance/valence and its public model card specifies research/noncommercial restrictions; commercial use requires appropriate rights. [Model card](https://huggingface.co/audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim).

## Failure and learning behavior

Unavailable pronunciation stays unavailable when a provider fails. Do not silently substitute Gemini-generated grades into the same progress series. Return successful independent timing/coverage results as partial feedback. Save timestamps and distinguish cancellation, timeout, insufficient speech, and provider error.

Show complete phrases before assessed reading; typewriter practice remains assisted practice and should not be compared directly with unassisted reading. Start measurement at speech onset. After feedback, allow listen-and-repeat of the exact difficult span, then a full retry and a short comprehension question. Revisit weak terms later and test transfer with a new passage. Do not stop at whole-session scores.

## Pilot before production

Proposed initial study: 100–200 consented clips across 20–30 speakers, multiple accents and microphones, simple and technical passages, accepted acronym pronunciations, deliberate errors, background noise, and no-speech examples. Use two human coaches and a speaker-separated held-out set. These are planning defaults, not a statistically powered validation claim.

Compare false corrections on intelligible speech, missed true errors, repeatability on the same recording, actionable-feedback agreement, failure rate, latency, and measured cost per completed attempt. Evaluate learning on a new passage, not only score improvement after repeating the same text. Define acceptance thresholds with the coaches before running the held-out comparison.

If no pronunciation engine meets the agreed standard, release speech timing, reading coverage, audio replay, and targeted practice without a pronunciation grade. Additional models run for evaluation or uncertain cases, not automatically on every attempt.

Google's agent-systems research finds that more agents are not universally better. Its experiments concern agentic tasks rather than pronunciation; it supports architectural caution, not a speech-scoring accuracy claim. [Google Research](https://research.google/blog/towards-a-science-of-scaling-agent-systems-when-and-why-agent-systems-work/).

Google Cloud Chirp 3 is another transcription candidate with word timestamps, and Google Cloud TTS can supply reference voices. Those documented capabilities do not by themselves constitute validated pronunciation assessment. [Chirp 3](https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3), [Cloud TTS](https://cloud.google.com/text-to-speech).
