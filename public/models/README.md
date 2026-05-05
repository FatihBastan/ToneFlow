# CREPE-tiny model

CREPE is a deep-learning monophonic pitch tracker. ToneFlow ships the
"tiny" variant (`crepe-tiny.onnx`, 1.9 MB) committed alongside this
README. 360 output bins from ~31.7 Hz to ~2 kHz at 20-cent resolution.
Used by default in instrument-pitch modes (guitar / bass / piano /
free_play / full_performance); vocals/drums/auto_detect stay on the
NSDF autocorrelator because CREPE-tiny is worse on clean monophonic
singing — see `bench/RESULTS.md` for the numbers.

If you ever need to **regenerate** or **swap** the file (e.g. to use
CREPE-medium for higher accuracy at 22 MB), the conversion recipe is
below. The runtime expects:

- Single input named `input_1` (or whatever appears at index 0)
- Shape `[1, 1024]`, dtype `float32`
- Single output of shape `[1, 360]` (probability over pitch bins)

## How to regenerate

The upstream model lives in TensorFlow at https://github.com/marl/crepe.
To produce the ONNX file from scratch:

```bash
python3 -m venv /tmp/crepe-convert && source /tmp/crepe-convert/bin/activate
pip install setuptools wheel
pip install --no-build-isolation crepe "tensorflow~=2.15" "tf2onnx>=1.16"
cd /path/to/ToneFlow
python - <<'PY'
import crepe, tensorflow as tf, tf2onnx
model = crepe.core.build_and_load_model('tiny')
spec = (tf.TensorSpec((1, 1024), tf.float32, name='input_1'),)
tf2onnx.convert.from_keras(model, input_signature=spec, output_path='public/models/crepe-tiny.onnx')
PY
```

If you want a non-default location for the model, set
`NEXT_PUBLIC_CREPE_MODEL_URL` at build time.

## How to disable

CREPE is ON by default for instrument modes. To turn it off on a
specific device:

```js
localStorage.setItem('toneflow.flags', JSON.stringify({crepe: false}))
```

Or build with `NEXT_PUBLIC_TONEFLOW_CREPE=0`.

## What if the model fails to load?

The hook flips to `pitchModelError` and permanently falls back to the
NSDF autocorrelator for the rest of the session. A small toast appears
in the UI to signal the fallback. No frames are dropped and the streak
system keeps working.
