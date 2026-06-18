"""
Test VoxCPM2 Style Tags via Modal API
Generates actual audio with different style tags
"""
import requests
import json
import base64
import os

# Modal API endpoint
API_URL = "https://reaksabbb3--voxcpm2-nanovllm-tts-api-api.modal.run/v1/audio/speech"
API_TOKEN = "WWsV6bACw5nenJ8qgWe2GT48CqVvF9njDtPe6rOZG9E"

# Test cases with 200 characters
test_cases = [
    {
        "name": "baseline_no_style",
        "input": "The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied to the generation process.",
        "voice": "female",
    },
    {
        "name": "speed_faster",
        "input": "(speaking faster)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied to the generation process.",
        "voice": "female",
    },
    {
        "name": "speed_slower",
        "input": "(speaking slowly)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied to the generation process.",
        "voice": "female",
    },
    {
        "name": "emotion_cheerful",
        "input": "(cheerful tone)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied to the generation process.",
        "voice": "female",
    },
    {
        "name": "emotion_whisper",
        "input": "(whispering)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied to the generation process.",
        "voice": "female",
    },
    {
        "name": "voice_young_female",
        "input": "(A young woman, gentle and sweet voice)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags.",
        "voice": "female",
    },
    {
        "name": "combined_fast_cheerful",
        "input": "(speaking faster, cheerful tone)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied.",
        "voice": "female",
    },
    {
        "name": "combined_slow_whisper",
        "input": "(speaking slowly, whispering)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied.",
        "voice": "female",
    },
]

# Output directory
output_dir = "test-output-style-tags"
os.makedirs(output_dir, exist_ok=True)

print("=" * 60)
print("VoxCPM2 Style Tags API Test")
print("=" * 60)
print()

for i, test in enumerate(test_cases, 1):
    print(f"Test {i}: {test['name']}")
    print(f"  Input: {test['input'][:80]}...")
    
    try:
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {API_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "input": test["input"],
                "voice": test["voice"],
                "model": "voxcpm2",
            },
            timeout=120,
        )
        
        if response.status_code == 200:
            # Save audio file
            output_file = os.path.join(output_dir, f"{test['name']}.wav")
            with open(output_file, "wb") as f:
                f.write(response.content)
            print(f"  ✓ Success: Saved to {output_file} ({len(response.content)} bytes)")
        else:
            print(f"  ✗ Error: HTTP {response.status_code}")
            print(f"    Response: {response.text[:200]}")
    
    except Exception as e:
        print(f"  ✗ Exception: {str(e)}")
    
    print()

print("=" * 60)
print(f"Audio files saved to: {output_dir}/")
print("=" * 60)
