"""
Test Voice Consistency - 10 Segments with Male Voice
Tests the voice consistency fix by generating 10 segments
"""
import requests
import json
import os
import time

# Read API token from production.env
def get_api_token():
    with open(r'D:\website api seller\deploy\production.env') as f:
        for line in f:
            if 'TTS_UPSTREAM_TOKEN' in line:
                return line.strip().split('=', 1)[1]
    return None

API_URL = "https://reaksabbb3--voxcpm2-nanovllm-tts-api-api.modal.run/v1/audio/speech"
API_TOKEN = get_api_token()

if not API_TOKEN:
    print("Error: Could not read API token from production.env")
    exit(1)

# Test text - 10 different sentences
test_texts = [
    "The quick brown fox jumps over the lazy dog near the river bank.",
    "人工智能技术正在改变我们的生活方式和工作方式。",
    "សួស្តី! នេះគឺជាការសាកល្បងសំឡេងខ្មែរថ្មី។",
    "The weather is beautiful today, perfect for a walk in the park.",
    "Machine learning models can now generate realistic human voices.",
    "ការអភិវឌ្ឍន៍បច្ចេកវិទ្យាកំពុងរីកចម្រើនយ៉ាងឆាប់រហ័ស។",
    "Voice cloning technology has advanced significantly in recent years.",
    "The sunset painted the sky with beautiful shades of orange and pink.",
    "Text-to-speech systems are becoming more natural and expressive.",
    "អនាគតនៃបច្ចេកវិទ្យាសំឡេងគឺភ្លឺស្វាងណាស់។",
]

# Output directory
output_dir = "test-output-consistency"
os.makedirs(output_dir, exist_ok=True)

print("=" * 60)
print("Voice Consistency Test - 10 Segments with Male Voice")
print("=" * 60)
print()

results = []

for i, text in enumerate(test_texts, 1):
    print(f"Segment {i}: {text[:50]}...")
    
    try:
        start_time = time.time()
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {API_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "input": text,
                "voice": "male",
                "model": "voxcpm2",
            },
            timeout=120,
        )
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            # Save audio file
            output_file = os.path.join(output_dir, f"segment_{i:02d}.wav")
            with open(output_file, "wb") as f:
                f.write(response.content)
            
            # Calculate duration (WAV: 44 byte header, 16-bit mono at 48kHz)
            duration = (len(response.content) - 44) / 96000
            
            results.append({
                "segment": i,
                "text": text[:50],
                "size": len(response.content),
                "duration": duration,
                "time": elapsed,
            })
            
            print(f"  ✓ Success: {len(response.content):,} bytes, {duration:.1f}s, {elapsed:.1f}s")
        else:
            print(f"  ✗ Error: HTTP {response.status_code}")
            print(f"    Response: {response.text[:200]}")
    
    except Exception as e:
        print(f"  ✗ Exception: {str(e)}")
    
    print()

# Summary
print("=" * 60)
print("Results Summary")
print("=" * 60)
print()
print(f"{'Seg':<5} {'Size (bytes)':<15} {'Duration':<12} {'Gen Time':<12}")
print("-" * 50)

for r in results:
    print(f"{r['segment']:<5} {r['size']:<15,} {r['duration']:<12.1f}s {r['time']:<12.1f}s")

if results:
    print()
    avg_duration = sum(r['duration'] for r in results) / len(results)
    avg_time = sum(r['time'] for r in results) / len(results)
    total_size = sum(r['size'] for r in results)
    
    print(f"Average Duration: {avg_duration:.1f}s")
    print(f"Average Gen Time: {avg_time:.1f}s")
    print(f"Total Size: {total_size:,} bytes ({total_size/1024/1024:.1f} MB)")
    print()
    print("=" * 60)
    print("Files saved to: test-output-consistency/")
    print("=" * 60)
