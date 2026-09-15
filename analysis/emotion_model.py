"""
Optional confidence signal from voice via audEERING's published
wav2vec2 dimensional-emotion model (arousal / dominance / valence).
Model: audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim
Loaded only when ENABLE_EMOTION=1; requires requirements-emotion.txt
(torch + transformers, ~1.5 GB of weights on first run).

The RegressionHead/EmotionModel classes below come from the model card —
the checkpoint uses a custom regression head that plain
AutoModelForAudioClassification cannot load.
"""

import wave

import numpy as np
import torch
import torch.nn as nn
from transformers import Wav2Vec2Processor
from transformers.models.wav2vec2.modeling_wav2vec2 import (
    Wav2Vec2Model,
    Wav2Vec2PreTrainedModel,
)

MODEL_NAME = "audeering/wav2vec2-large-robust-12-ft-emotion-msp-dim"

_processor = None
_model = None


class RegressionHead(nn.Module):
    def __init__(self, config):
        super().__init__()
        self.dense = nn.Linear(config.hidden_size, config.hidden_size)
        self.dropout = nn.Dropout(config.final_dropout)
        self.out_proj = nn.Linear(config.hidden_size, config.num_labels)

    def forward(self, features, **kwargs):
        x = self.dropout(features)
        x = torch.tanh(self.dense(x))
        x = self.dropout(x)
        return self.out_proj(x)


class EmotionModel(Wav2Vec2PreTrainedModel):
    def __init__(self, config):
        super().__init__(config)
        self.config = config
        self.wav2vec2 = Wav2Vec2Model(config)
        self.classifier = RegressionHead(config)
        self.init_weights()

    def forward(self, input_values):
        hidden_states = self.wav2vec2(input_values)[0]
        pooled = torch.mean(hidden_states, dim=1)
        return self.classifier(pooled)


def _load():
    global _processor, _model
    if _model is None:
        _processor = Wav2Vec2Processor.from_pretrained(MODEL_NAME)
        _model = EmotionModel.from_pretrained(MODEL_NAME)
        _model.eval()
    return _processor, _model


def analyze_emotion(wav_path: str, max_sec: int = 60) -> dict:
    """Returns arousal/dominance/valence in [0, 1] for a 16 kHz mono wav.
    Dominance is the closest research-grade proxy for vocal confidence."""
    with wave.open(wav_path, "rb") as w:
        rate = w.getframerate()
        frames = w.readframes(min(w.getnframes(), rate * max_sec))
    signal = np.frombuffer(frames, dtype=np.int16).astype(np.float32) / 32768.0

    processor, model = _load()
    inputs = processor(signal, sampling_rate=rate, return_tensors="pt")
    with torch.no_grad():
        logits = model(inputs.input_values)[0].numpy()

    # model output order: arousal, dominance, valence
    return {
        "arousal": float(logits[0]),
        "dominance": float(logits[1]),
        "valence": float(logits[2]),
    }
