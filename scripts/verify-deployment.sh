#!/bin/bash
echo "=== Current image on web deployment ==="
kubectl -n khmer-vox get deployment khmer-vox-web -o jsonpath='{.spec.template.spec.containers[0].image}'
echo ""
echo "=== Current image on worker deployment ==="
kubectl -n khmer-vox get deployment khmer-vox-worker -o jsonpath='{.spec.template.spec.containers[0].image}'
echo ""
echo ""
echo "=== Actual pod images (what's really running) ==="
kubectl -n khmer-vox get pods -o custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[0].image,STATUS:.status.phase
echo ""
echo "=== Web env vars (TTS_*) ==="
kubectl -n khmer-vox get deployment khmer-vox-web -o json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for e in d['spec']['template']['spec']['containers'][0].get('env', []):
    name = e.get('name', '')
    if name.startswith('TTS_'):
        print(f\"{name}={e.get('value', '')}\")"