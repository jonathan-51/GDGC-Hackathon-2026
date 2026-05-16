import { useRef } from 'react';

// MediaRecorder-produced webm files lack a duration in their metadata, so
// HTMLVideoElement.duration reports Infinity and the seek bar parks the head
// at the far right. Forcing a seek past the end makes Chrome scan the file
// and rewrite a real duration; we then snap back to zero.
export default function InterviewVideo({
  src,
  className,
}: {
  src: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  function onLoadedMetadata() {
    const v = ref.current;
    if (!v) return;
    if (v.duration === Infinity || Number.isNaN(v.duration)) {
      const onTimeUpdate = () => {
        v.removeEventListener('timeupdate', onTimeUpdate);
        v.currentTime = 0;
      };
      v.addEventListener('timeupdate', onTimeUpdate);
      v.currentTime = 1e9;
    }
  }

  return (
    <video
      ref={ref}
      src={src}
      controls
      preload="metadata"
      onLoadedMetadata={onLoadedMetadata}
      className={className}
    />
  );
}
