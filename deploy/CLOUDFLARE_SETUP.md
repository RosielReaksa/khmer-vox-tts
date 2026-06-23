# Cloudflare Setup Guide for voxtts.online

## Overview

This guide sets up Cloudflare as the CDN/WAF/DDoS protection layer in front of
your K3s cluster. Cloudflare terminates TLS at the edge, caches static assets,
and blocks malicious traffic before it reaches your VPS.

**What changes:**
- TLS terminates at Cloudflare (not Traefik)
- Your VPS IP is hidden behind Cloudflare
- Static assets are cached at Cloudflare's edge
- DDoS and basic WAF protection is automatic

**What stays the same:**
- K3s + Traefik still runs on your VPS
- Your app code doesn't change
- Database, worker, Modal — all unchanged

---

## Step 1: Add Domain to Cloudflare

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Click **"Add a site"**
3. Enter `voxtts.online`
4. Select **Free** plan (sufficient for now)
5. Cloudflare will scan existing DNS records — review them

## Step 2: Update Nameservers

Cloudflare will show you two nameservers (e.g., `anna.ns.cloudflare.com`).
Go to your domain registrar (where you bought `voxtts.online`) and replace
the current nameservers with Cloudflare's.

**This is the only step that takes time** — DNS propagation can take
1-48 hours, but usually 1-2 hours.

## Step 3: Configure DNS Records

In Cloudflare dashboard → DNS → Records, ensure these exist:

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| A | `@` | `152.42.203.77` | **Proxied** (orange cloud) |
| A | `www` | `152.42.203.77` | **Proxied** (orange cloud) |

The **Proxied** status means traffic goes through Cloudflare (CDN + WAF).
The VPS IP is hidden from public DNS.

## Step 4: SSL/TLS Configuration

Go to SSL/TLS → Overview:

- **Encryption mode**: **Full (Strict)**
  - Cloudflare connects to your VPS over HTTPS
  - Your VPS must have a valid TLS cert (Traefik + Let's Encrypt handles this)

Go to SSL/TLS → Edge Certificates:

- **Always Use HTTPS**: ON
- **Minimum TLS Version**: TLS 1.2
- **Automatic HTTPS Rewrites**: ON
- **Opportunistic Encryption**: ON

## Step 5: Security Settings

Go to Security → Settings:

- **Security Level**: Medium
- **Challenge Passage**: 30 minutes
- **Browser Integrity Check**: ON
- **Privacy Pass Support**: ON

Go to Security → WAF → Managed Rules:

- Enable the **Cloudflare Free Managed Ruleset** (automatic on free plan)

## Step 6: Caching Configuration

Go to Caching → Configuration:

- **Browser Cache TTL**: Respect Existing Headers
- **Caching Level**: Standard

### Page Rules (Free plan: 3 rules)

Create these page rules in Caching → Page Rules:

**Rule 1: Cache static assets**
```
URL: voxtts.online/_next/static/*
Setting: Cache Level → Cache Everything
Setting: Edge Cache TTL → 1 month
```

**Rule 2: Bypass cache for API**
```
URL: voxtts.online/api/*
Setting: Cache Level → Bypass
```

**Rule 3: Bypass cache for app pages**
```
URL: voxtts.online/app/*
Setting: Cache Level → Bypass
```

## Step 7: VPS-Side Configuration

### 7a. Trust Cloudflare IPs in Traefik

Cloudflare connects to your VPS from its own IP ranges. Traefik should
trust these as real client IPs (not the Cloudflare proxy IP).

Create a ConfigMap with Cloudflare's IP ranges:

```bash
# Download Cloudflare IPs
CF_IPS=$(curl -s https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6)

# Create a ConfigMap
kubectl -n khmer-vox create configmap cloudflare-ips \
  --from-literal=ips="$(curl -s https://www.cloudflare.com/ips-v4 https://www.cloudflare.com/ips-v6)" \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 7b. Update Traefik to use X-Forwarded-For

If your Traefik ingress already handles `X-Forwarded-For` headers (default
in K3s Traefik), no change is needed. Cloudflare sends the real client IP
in this header.

### 7c. Optional: Restrict VPS Firewall

To ensure traffic only comes through Cloudflare (not direct IP access):

```bash
# Allow SSH from your IP only
ufw allow from YOUR_IP to any port 22

# Allow HTTP/HTTPS from Cloudflare IPs only
# (This is optional — Cloudflare IPs change, so this needs maintenance)
# Easier: just keep the firewall open and rely on Cloudflare's proxy
```

## Step 8: Verify

After DNS propagates:

```bash
# Check that the site loads through Cloudflare
curl -I https://voxtts.online/api/health

# Look for Cloudflare headers:
# cf-ray: <hash>     ← confirms traffic goes through Cloudflare
# server: cloudflare  ← confirms Cloudflare is the edge server

# Verify the VPS IP is hidden
dig voxtts.online +short
# Should show Cloudflare IPs, NOT 152.42.203.77
```

## Step 9: Enable Cloudflare Features (Optional)

### Rate Limiting (Free: 1 rule)
Go to Security → WAF → Rate limiting rules:
- **Rule**: Block if `voxtts.online/api/*` exceeds 100 requests/minute from same IP
- **Action**: Block for 10 minutes

### Bot Management (Free)
Go to Security → Bots:
- **Bot Fight Mode**: ON (blocks automated bad bots)

### Email Routing (Free)
If you want `@voxtts.online` email:
- Go to Email → Email Routing
- Route `@voxtts.online` to your personal email

---

## Rollback

If something breaks:

1. In Cloudflare DNS, click the **orange cloud** to turn it **gray** (DNS-only)
   - This disables the proxy but keeps DNS working
   - Traffic goes directly to your VPS IP again
2. If nameservers haven't propagated yet, you can cancel the site addition

---

## What This Gives You (Free Tier)

- **DDoS protection**: Automatic L3/L4/L7 mitigation
- **CDN**: Static assets cached at 300+ edge locations globally
- **SSL**: Free edge certificates (auto-renewed)
- **WAF**: Basic managed rules against common attacks
- **Hiding origin**: Your VPS IP is not publicly visible
- **Analytics**: Basic traffic analytics in Cloudflare dashboard

**Cost: $0/month** on the Free plan.
