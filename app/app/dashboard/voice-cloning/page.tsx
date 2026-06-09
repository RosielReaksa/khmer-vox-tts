import { SpeechWorkspace } from "@/app/app/dashboard/speech-workspace";

export default function VoiceCloningPage() {
  return (
    <SpeechWorkspace
      mode="clone"
      title="Voice Cloning"
      actionLabel="Generate Clone Speech"
    />
  );
}

