"""
Test Voice Consistency - 10 Khmer Segments with Piseth Male Voice
"""
import requests
import os
import time

# Read API token from production.env at runtime
def get_api_token():
    with open(r'D:\website api seller\deploy\production.env') as f:
        for line in f:
            if 'TTS_UPSTREAM_TOKEN' in line:
                return line.strip().split('=', 1)[1]
    return None

API_URL = "https://reaksabbb3--voxcpm2-nanovllm-tts-api-api.modal.run/v1/audio/speech"

# 10 Khmer sentences
test_texts = [
    "សួស្តី! នេះគឺជាការសាកល្បងសំឡេងខ្មែរថ្មី។",
    "ការអភិវឌ្ឍន៍បច្ចេកវិទ្យាកំពុងរីកចម្រើនយ៉ាងឆាប់រហ័ស។",
    "អនាគតនៃបច្ចេកវិទ្យាសំឡេងគឺភ្លឺស្វាងណាស់។",
    "ខ្ញុំសូមស្វាគមន៍អ្នកមកកាន់ប្រព័ន្ធ Khmer Vox TTS។",
    "សំឡេងរបស់យើងអាចនិយាយបានច្រើនភាសាផ្សេងៗ។",
    "ការសាកល្បងនេះគឺដើម្បីពិនិត្យមើលគុណភាពសំឡេង។",
    "បច្ចេកវិទ្យាក្លូនសំឡេងកំពុងវិវឌ្ឍន៍យ៉ាងលឿន។",
    "យើងអាចបង្កើតសំឡេងធម្មជាតិដូចមនុស្សពិត។",
    "ការប្រើប្រាស់បញ្ញាសិប្បនិម្មិតកំពុងកើនឡើង។",
    "អរគុណសម្រាប់ការប្រើប្រាស់សេវាកម្មរបស់យើង។",
]

# Output directory
output_dir = "test-output-khmer-piseth"
os.makedirs(output_dir, exist_ok=True)

# Get API token
api_token = get_api_token()
if not api_token:
    print("Error: Could not read API token from production.env")
    exit(1)

print("=" * 60)
print("Voice Consistency Test - 10 Khmer Segments (Piseth Male)")
print("=" * 60)
print()

results = []

for i, text in enumerate(test_texts, 1):
    print(f"Segment {i}: {text}")
    
    try:
        start_time = time.time()
        response = requests.post(
            API_URL,
            headers={
                "Authorization": f"Bearer {api_token}",
                "Content-Type": "application/json",
            },
            json={
                "input": text,
                "voice": "piseth",
                "model": "voxcpm2",
            },
            timeout=120,
        )
        elapsed = time.time() - start_time
        
        if response.status_code == 200:
            output_file = os.path.join(output_dir, f"segment_{i:02d}.wav")
            with open(output_file, "wb") as f:
                f.write(response.content)
            
            duration = (len(response.content) - 44) / 96000
            
            results.append({
                "segment": i,
                "text": text,
                "size": len(response.content),
                "duration": duration,
                "time": elapsed,
            })
            
            print(f"  ✓ {len(response.content):,} bytes, {duration:.1f}s, {elapsed:.1f}s")
        else:
            print(f"  ✗ HTTP {response.status_code}: {response.text[:100]}")
    
    except Exception as e:
        print(f"  ✗ {str(e)}")
    print()

# Summary
print("=" * 60)
print("Results Summary")
print("=" * 60)
print()

if results:
    durations = [r['duration'] for r in results]
    avg_duration = sum(durations) / len(durations)
    min_duration = min(durations)
    max_duration = max(durations)
    std_duration = (sum((d - avg_duration)**2 for d in durations) / len(durations)) ** 0.5
    
    print(f"Segments: {len(results)}/10")
    print(f"Average Duration: {avg_duration:.2f}s")
    print(f"Min/Max: {min_duration:.2f}s / {max_duration:.2f}s")
    print(f"Std Dev: {std_duration:.2f}s")
    print(f"Variation: {std_duration/avg_duration*100:.1f}%")
    print()
    
    if std_duration/avg_duration < 0.15:
        print("✓ GOOD: Voice is consistent")
    elif std_duration/avg_duration < 0.25:
        print("⚠ FAIR: Some variation")
    else:
        print("✗ POOR: Inconsistent")
    
    print()
    print("Files saved to: test-output-khmer-piseth/")
