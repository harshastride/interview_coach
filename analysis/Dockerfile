FROM python:3.11-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt requirements-emotion.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# Praat pitch analysis — no linux/arm64 wheel exists, so install best-effort;
# main.py falls back to a numpy pitch tracker when it is missing.
RUN pip install --no-cache-dir "praat-parselmouth>=0.4.3" \
    || echo "parselmouth unavailable on this platform; using numpy pitch fallback"
# Uncomment to bake in the optional emotion model deps (ENABLE_EMOTION=1):
# RUN pip install --no-cache-dir -r requirements-emotion.txt

COPY main.py emotion_model.py ./

# Whisper model downloads on first request and is cached in /root/.cache
ENV WHISPER_MODEL=small

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
