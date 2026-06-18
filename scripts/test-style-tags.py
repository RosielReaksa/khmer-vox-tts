"""
Test VoxCPM2 Style Tags - 200 Character Test
Tests different style control tags with the official format: (style)text
"""

# Test texts with style tags (200 chars each)
test_cases = [
    {
        "name": "No style tag (baseline)",
        "text": "The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied to the generation process.",
    },
    {
        "name": "Speed: Speaking faster",
        "text": "(speaking faster)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied to the generation process.",
    },
    {
        "name": "Speed: Speaking slower",
        "text": "(speaking slowly)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied to the generation process.",
    },
    {
        "name": "Emotion: Cheerful",
        "text": "(cheerful tone)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied to the generation process.",
    },
    {
        "name": "Emotion: Whispering",
        "text": "(whispering)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied to the generation process.",
    },
    {
        "name": "Voice: Young female",
        "text": "(A young woman, gentle and sweet voice)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags.",
    },
    {
        "name": "Combined: Fast + Cheerful",
        "text": "(speaking faster, cheerful tone)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied.",
    },
    {
        "name": "Combined: Slow + Whisper",
        "text": "(speaking slowly, whispering)The quick brown fox jumps over the lazy dog. This is a simple test of the VoxCPM2 text-to-speech system without any style control tags applied.",
    },
]

print("=" * 60)
print("VoxCPM2 Style Tags Test - 200 Characters")
print("=" * 60)
print()

for i, test in enumerate(test_cases, 1):
    text = test["text"]
    # Extract style tag if present
    if text.startswith("("):
        style_end = text.index(")") + 1
        style_tag = text[:style_end]
        content = text[style_end:]
    else:
        style_tag = "None"
        content = text
    
    print(f"Test {i}: {test['name']}")
    print(f"  Style Tag: {style_tag}")
    print(f"  Content: {content[:80]}...")
    print(f"  Total Length: {len(text)} chars")
    print()

print("=" * 60)
print("Usage in VoxCPM2 Python API:")
print("=" * 60)
print()
print('from voxcpm import VoxCPM')
print('import soundfile as sf')
print()
print('model = VoxCPM.from_pretrained("openbmb/VoxCPM2")')
print()
print('# Example with style tag')
print('wav = model.generate(')
print('    text="(speaking faster, cheerful tone)Hello, welcome to VoxCPM2!",')
print('    cfg_value=2.0,')
print('    inference_timesteps=10,')
print(')')
print('sf.write("output.wav", wav, model.tts_model.sample_rate)')
print()
print("=" * 60)
print("Usage in Modal API (our deployment):")
print("=" * 60)
print()
print('curl -X POST https://your-modal-endpoint/v1/audio/speech \\')
print('  -H "Authorization: Bearer YOUR_TOKEN" \\')
print('  -H "Content-Type: application/json" \\')
print('  -d \'{')
print('    "input": "(speaking faster)Hello, welcome to VoxCPM2!",')
print('    "voice": "female",')
print('    "model": "voxcpm2"')
print('  }\'')
print()
