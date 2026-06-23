# CI/CD Setup Guide

## GitHub Actions Workflows

### CI Pipeline (`.github/workflows/ci.yml`) - WORKING
- Runs on every push to `main` and pull requests
- Validates: install, lint, typecheck, build
- **Status: Passing**

### Deploy Pipeline (`.github/workflows/deploy.yml`)
- Manual deployment to staging/production
- Builds Docker image, pushes to GHCR, deploys to K3s

## Required GitHub Secrets

To enable the deploy workflow, add these secrets in your GitHub repo:

**Go to:** https://github.com/RosielReaksa/khmer-vox-tts/settings/secrets/actions

### 1. GHCR_TOKEN
GitHub Container Registry token for pushing Docker images.

**How to create:**
1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name: `khmer-vox-tts-deploy`
4. Expiration: 90 days (or as needed)
5. Select scopes:
   - `write:packages` (to push to GHCR)
   - `read:packages` (to pull from GHCR)
6. Click "Generate token"
7. Copy the token and add it as `GHCR_TOKEN` secret

### 2. VPS_HOST
Your production VPS IP address.

**Value:** `152.42.203.77` (from your PROJECT_MEMORY.md)

### 3. VPS_USER
SSH username for the VPS.

**Value:** `root`

### 4. VPS_SSH_KEY
SSH private key for connecting to the VPS.

**How to generate:**
```bash
# On your local machine
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy_key -N ""

# Copy the private key
cat ~/.ssh/github_deploy_key

# Add the public key to your VPS
ssh-copy-id -i ~/.ssh/github_deploy_key.pub root@152.42.203.77
```

**Value:** The contents of `~/.ssh/github_deploy_key` (the private key)

## Setting Up Secrets

1. Go to https://github.com/RosielReaksa/khmer-vox-tts/settings/secrets/actions
2. Click "New repository secret"
3. Add each secret with the exact name and value:
   - Name: `GHCR_TOKEN`, Value: (your token)
   - Name: `VPS_HOST`, Value: `152.42.203.77`
   - Name: `VPS_USER`, Value: `root`
   - Name: `VPS_SSH_KEY`, Value: (your private key)

## Testing the Deploy Workflow

After adding secrets:

1. Go to https://github.com/RosielReaksa/khmer-vox-tts/actions/workflows/deploy.yml
2. Click "Run workflow"
3. Select "staging" environment
4. Click "Run workflow"

## Workflow Files

- `.github/workflows/ci.yml` - CI pipeline (working)
- `.github/workflows/deploy.yml` - Deploy pipeline (needs secrets)
- `.github/workflows/test.yml` - Test workflow (deleted)
- `.github/workflows/hello.yml` - Hello workflow (deleted)
