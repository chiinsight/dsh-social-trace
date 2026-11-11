"""Local-only SenseVoice worker. Called with fixed arguments by Social Trace."""
import contextlib
import json
import os
import re
import sys
from pathlib import Path

audio, model_path, threads = sys.argv[1:]
if not Path(audio).is_file() or not Path(model_path, 'model.pt').is_file():
    raise SystemExit('Local audio or model is missing')
os.environ['MODELSCOPE_OFFLINE'] = '1'
os.environ['HF_HUB_OFFLINE'] = '1'
with contextlib.redirect_stdout(sys.stderr):
    try:
        import torch
        from funasr import AutoModel
    except ImportError:
        raise SystemExit(78)
    torch.set_num_threads(int(threads))
    model = AutoModel(model=model_path, device='cpu', disable_update=True, trust_remote_code=False)
    result = model.generate(input=audio, language='zh', use_itn=True, batch_size_s=30)
text = ' '.join(item.get('text', '') for item in result or [])
text = re.sub(r'<\|[^|]+\|>', '', text).strip()
if not text:
    raise SystemExit('Empty transcription')
print(json.dumps({'text': text}, ensure_ascii=False))
