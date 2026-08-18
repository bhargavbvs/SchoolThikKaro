// src/submit/faces.js

/** Fail-closed gate. This function is the spec's "never fail open" rule.
 *  If we could not verify the image is safe, submission is refused. */
export function blurGate({ detectorLoaded, facesFound, blurApplied }) {
  if (blurApplied) return { canSubmit: true, reason: null };
  if (!detectorLoaded) {
    return { canSubmit: false,
      reason: 'We could not check this photo for faces. Please blur any people manually before submitting.' };
  }
  if (facesFound > 0) {
    return { canSubmit: false,
      reason: 'Faces were detected. Apply blur before submitting.' };
  }
  return { canSubmit: true, reason: null };
}

let _detector = null;

export async function loadDetector() {
  if (_detector) return _detector;
  try {
    const vision = await import('@mediapipe/tasks-vision');
    const fileset = await vision.FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm');
    _detector = await vision.FaceDetector.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
      },
      runningMode: 'IMAGE',
    });
    return _detector;
  } catch (err) {
    console.error('face detector failed to load', err);
    return null;
  }
}

export async function detectFaces(detector, canvas) {
  if (!detector) return [];
  const res = detector.detect(canvas);
  return (res?.detections ?? []).map((d) => ({
    x: d.boundingBox.originX,
    y: d.boundingBox.originY,
    width: d.boundingBox.width,
    height: d.boundingBox.height,
  }));
}
