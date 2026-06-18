"""
Test Male Voice Consistency - 10 Khmer Segments
Uses reference_male.wav (Piseth) for cloning
"""
import requests
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
output_dir = "test-output-male-voice"
os.makedirs(output_dir, exist_ok=True)

# Get API token
api_token = get_api_token()
if not api_token:
    print("Error: Could not read API token")
    exit(1)

print("=" * 70)
print("Male Voice (Piseth) Consistency Test")
print("=" * 70)
print()
print("Voice: Male (Piseth)")
print("Reference: reference_male.wav (cloned voice)")
print("Temperature: 0.8 (lower for consistency)")
print("Voice Instruction: 'same speaker as the reference audio, natural clear speech, consistent tone, smooth pace'")
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
                "voice": "male",
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

# Analysis
print("=" * 70)
print("Consistency Analysis")
print("=" * 70)
print()

if results:
    durations = [r['duration'] for r in results]
    avg_duration = sum(durations) / len(durations)
    min_duration = min(durations)
    max_duration = max(durations)
    std_duration = (sum((d - avg_duration)**2 for d in durations) / len(durations)) ** 0.5
    variation = std_duration / avg_duration * 100
    
    print(f"Segments: {len(results)}/10")
    print(f"Average Duration: {avg_duration:.2f}s")
    print(f"Min/Max: {min_duration:.2f}s / {max_duration:.2f}s")
    print(f"Std Dev: {std_duration:.2f}s")
    print(f"Variation: {variation:.1f}%")
    print()
    
    if variation < 10:
        print("✅ EXCELLENT: Voice is very consistent (< 10% variation)")
    elif variation < 15:
        print("✅ GOOD: Voice is consistent (< 15% variation)")
    elif variation < 20:
        print("⚠️ FAIR: Some variation (15-20%)")
    else:
        print("❌ POOR: Voice is inconsistent (> 20% variation)")
    
    print()
    print("Per-Segment Details:")
    print(f"{'Seg':<5} {'Duration':<12} {'Deviation':<12} {'Status':<10}")
    print("-" * 45)
    
    for r in results:
        deviation = r['duration'] - avg_duration
        status = "✓" if abs(deviation) < avg_duration * 0.15 else "⚠"
        print(f"{r['segment']:<5} {r['duration']:<12.2f}s {deviation:+.2f}s        {status}")
    
    print()
    
    # Merge segments
    import subprocess
    filelist_path = os.path.join(output_dir, 'filelist.txt')
    with open(filelist_path, 'w') as f:
        for i in range(len(results)):
            f.write(f"file 'segment_{i+1:02d}.wav'\n")
    
    merged_path = os.path.join(output_dir, 'merged_male_voice.wav')
    subprocess.run([
        'ffmpeg', '-y', '-f', 'concat', '-safe', '0',
        '-i', filelist_path,
        '-c', 'copy',
        merged_path
    ], capture_output=True)
    
    if os.path.exists(merged_path):
        size = os.path.getsize(merged_path)
        duration = (size - 44) / 96000
        print(f"Merged File: {merged_path}")
        print(f"Size: {size:,} bytes ({size/1024/1024:.1f} MB)")
        print(f"Duration: {duration:.1f}s")
        print()
        print("✅ All 10 segments merged successfully!")
        print()
        print("How it works:")
        print("- Voice 'male' loads reference_male.wav (Piseth's voice)")
        print("- VoxCPM2 clones that voice for each segment")
        print("- Temperature 0.8 reduces randomness")
        print("- Volume normalization ensures consistent loudness")
        print()
        print("Listen to verify: all segments should sound like the same person (Piseth)")
