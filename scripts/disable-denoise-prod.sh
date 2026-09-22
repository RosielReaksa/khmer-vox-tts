#!/bin/bash
echo "=== Setting TTS_OUTPUT_DENOISE=false on web ==="
kubectl -n khmer-vox set env deployment/khmer-vox-web TTS_OUTPUT_DENOISE=false
echo "=== Setting TTS_OUTPUT_DENOISE=false on worker ==="
kubectl -n khmer-vox set env deployment/khmer-vox-worker TTS_OUTPUT_DENOISE=false
echo "=== Waiting for rollout ==="
kubectl -n khmer-vox rollout status deployment/khmer-vox-web --timeout=300s
kubectl -n khmer-vox rollout status deployment/khmer-vox-worker --timeout=300s
echo "=== Verifying new env ==="
kubectl -n khmer-vox get deployment khmer-vox-web -o json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for e in d['spec']['template']['spec']['containers'][0].get('env', []):
    name = e.get('name', '')
    if name.startswith('TTS_') and ('DENOISE' in name or 'TEMPERATURE' in name):
        print(f\"{name}={e.get('value', '')}\")"