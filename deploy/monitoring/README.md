# Monitoring Stack — Deployment & Operations Guide

## Quick Deploy

SSH into the VPS and run:

```bash
# 1. Create the monitoring namespace
kubectl apply -f deploy/monitoring/namespace.yaml

# 2. Deploy Prometheus
kubectl apply -f deploy/monitoring/prometheus.yaml

# 3. Deploy Grafana
kubectl apply -f deploy/monitoring/grafana.yaml

# 4. Deploy Node Exporter
kubectl apply -f deploy/monitoring/node-exporter.yaml

# 5. Verify all pods are running
kubectl -n monitoring get pods
```

## Resource Usage

| Component | CPU Request | CPU Limit | Memory Request | Memory Limit |
|-----------|-------------|-----------|----------------|--------------|
| Prometheus | 100m | 200m | 128Mi | 200Mi |
| Grafana | 100m | 200m | 128Mi | 200Mi |
| Node Exporter | 5m | 20m | 16Mi | 32Mi |
| **Total** | **205m** | **420m** | **272Mi** | **432Mi** |

This is lightweight enough for a 2 vCPU / 4 GB RAM VPS.

## Access Grafana

### Option 1: Port-forward (recommended for setup)

```bash
kubectl -n monitoring port-forward svc/grafana 3001:3000
```

Open http://localhost:3001 in your browser.
- **Username**: admin
- **Password**: admin (change on first login!)

### Option 2: Ingress (if you want persistent access)

Add an Ingress resource (requires Cloudflare or a subdomain):

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: grafana-ingress
  namespace: monitoring
spec:
  rules:
    - host: grafana.voxtts.online
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: grafana
                port:
                  number: 3000
```

**Warning**: If you expose Grafana publicly, change the default password
immediately and consider adding authentication.

## Pre-built Dashboard

A basic **"Khmer Vox TTS — Infrastructure Overview"** dashboard is
auto-provisioned. It shows:

- **CPU Usage** — real-time VPS CPU utilization
- **Memory Usage** — RAM utilization percentage
- **Disk Usage** — root filesystem utilization gauge
- **Pod Status** — count of pods in khmer-vox namespace
- **Network I/O** — receive/transmit bandwidth
- **System Load** — 1m / 5m / 15m load averages

## Adding Voxtts App Metrics (Future)

To expose application-level metrics (request latency, error rates, TTS
generation times), add a `/api/metrics` endpoint to the Next.js app that
outputs Prometheus-format metrics. Then annotate the voxtts-web pods:

```yaml
metadata:
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "3000"
    prometheus.io/path: "/api/metrics"
```

Prometheus is already configured to auto-discover pods with these annotations.

## Alerting (Future)

To add alerts (e.g., high CPU, pod restarts, health check failures):

1. Create alert rules in `/etc/prometheus/rules/alerts.yml`
2. Add Alertmanager container (or use Grafana Alerting)
3. Configure webhook to Telegram for notifications

## Maintenance

### Update Prometheus

```bash
kubectl -n monitoring set image deployment/prometheus \
  prometheus=prom/prometheus:v2.54.0
```

### Update Grafana

```bash
kubectl -n monitoring set image deployment/grafana \
  grafana=grafana/grafana:11.2.0
```

### Check Prometheus targets

```bash
kubectl -n monitoring port-forward svc/prometheus 9090:9090
# Open http://localhost:9090/targets
```

### Backup Grafana dashboards

```bash
kubectl -n monitoring exec deploy/grafana -- \
  grafana-cli admin export-dashboard voxtts-overview > voxtts-dashboard.json
```

## Cleanup

```bash
kubectl delete namespace monitoring
# This deletes everything in the monitoring namespace
```
