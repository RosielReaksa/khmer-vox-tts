#!/bin/bash
kubectl -n khmer-vox set env deployment/khmer-vox-web TTS_OUTPUT_DENOISE=true
kubectl -n khmer-vox set env deployment/khmer-vox-worker TTS_OUTPUT_DENOISE=true
kubectl -n khmer-vox rollout status deployment/khmer-vox-web --timeout=300s
kubectl -n khmer-vox rollout status deployment/khmer-vox-worker --timeout=300s
echo "Reverted"