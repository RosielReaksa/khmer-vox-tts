#!/bin/bash
echo "=== Web pods ==="
kubectl -n khmer-vox get pods -l app=khmer-vox-web -o custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[0].image,STATUS:.status.phase,READY:.status.containerStatuses[0].ready
echo ""
echo "=== Worker pods ==="
kubectl -n khmer-vox get pods -l app=khmer-vox-worker -o custom-columns=NAME:.metadata.name,IMAGE:.spec.containers[0].image,STATUS:.status.phase,READY:.status.containerStatuses[0].ready
echo ""
echo "=== Recent events ==="
kubectl -n khmer-vox get events --sort-by=.lastTimestamp | tail -8