#!/bin/bash
# Disable denoise in production
kubectl -n khmer-vox set env deployment/khmer-vox-web TTS_OUTPUT_DENOISE=false
kubectl -n khmer-vox set env deployment/khmer-vox-worker TTS_OUTPUT_DENOISE=false
echo "Waiting for rollout..."
kubectl -n khmer-vox rollout status deployment/khmer-vox-web --timeout=300s
kubectl -n khmer-vox rollout status deployment/khmer-vox-worker --timeout=300s
echo "Done"