export class KhmerVoxTTS {
  constructor({ apiKey, baseUrl }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  get headers() {
    return { Authorization: `Bearer ${this.apiKey}` };
  }

  async speech({ text, voice, model = "voxcpm2" }) {
    const payload = { input: text, model };
    if (voice) payload.voice = voice;
    const response = await fetch(`${this.baseUrl}/api/v1/audio/speech`, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    return Buffer.from(await response.arrayBuffer());
  }

  async clone({ text, sampleBase64, sampleMimeType = "audio/wav", voice = "match the reference speaker clearly", model = "voxcpm2" }) {
    const response = await fetch(`${this.baseUrl}/api/v1/audio/clone`, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: text,
        voice,
        model,
        voice_consent: true,
        clone_audio_base64: sampleBase64,
        clone_audio_mime_type: sampleMimeType,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    return Buffer.from(await response.arrayBuffer());
  }

  async batchSpeech({ lines, voice, model = "voxcpm2", webhookUrl, externalId, metadata }) {
    const payload = { input: lines, model };
    if (voice) payload.voice = voice;
    if (webhookUrl) payload.webhook_url = webhookUrl;
    if (externalId) payload.external_id = externalId;
    if (metadata !== undefined) payload.metadata = metadata;
    const response = await fetch(`${this.baseUrl}/api/v1/audio/batch`, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async batchClone({
    lines,
    sampleBase64,
    sampleMimeType = "audio/wav",
    voice = "match the reference speaker clearly",
    model = "voxcpm2",
    webhookUrl,
    externalId,
    metadata,
  }) {
    const payload = {
      input: lines,
      voice,
      model,
      voice_consent: true,
      clone_audio_base64: sampleBase64,
      clone_audio_mime_type: sampleMimeType,
    };
    if (webhookUrl) payload.webhook_url = webhookUrl;
    if (externalId) payload.external_id = externalId;
    if (metadata !== undefined) payload.metadata = metadata;
    const response = await fetch(`${this.baseUrl}/api/v1/audio/batch/clone`, {
      method: "POST",
      headers: { ...this.headers, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  async waitForBatch(jobId, { intervalMs = 2500 } = {}) {
    while (true) {
      const response = await fetch(`${this.baseUrl}/api/v1/audio/batch/jobs/${jobId}`, {
        headers: this.headers,
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      if (["completed", "partial", "failed", "needs_review"].includes(data.job.status)) return data;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  async downloadBatch(jobId) {
    const response = await fetch(`${this.baseUrl}/api/v1/audio/batch/jobs/${jobId}/download`, {
      headers: this.headers,
    });
    if (!response.ok) throw new Error(await response.text());
    return Buffer.from(await response.arrayBuffer());
  }
}
