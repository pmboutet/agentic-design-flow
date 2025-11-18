<!-- 3375f2c1-79a9-4b41-9b24-e9902e3cfbf0 8d7f628d-8eb7-4009-8e36-344ee80dee20 -->
# Semantic Turn Detection Plan

1. Assess Current Voice Pipeline

- Review `src/lib/ai/speechmatics.ts` and `src/lib/ai/speechmatics-transcription.ts` to map where VAD-based end-of-turn events are emitted.
- Inspect `src/components/chat/PremiumVoiceInterface.tsx` to understand how speech events drive agent prompts and interruptions.

2. Design SLM Turn Detector Service

- Add a lightweight SLM inference helper (e.g., local GGUF or remote API) under `src/lib/ai/turn-detection.ts` that formats recent transcript turns into ChatML.
- Implement logic matching the Speechmatics article: compute `<|im_end|>` (and punctuation) token probabilities and expose `getSemanticEotProb(messages) -> number`.

3. Integrate with Streaming Pipeline

- In `speechmatics-transcription.ts`, capture rolling transcript windows and call the turn detector when VAD flags silence; add configurable threshold/grace period.
- Update PremiumVoiceInterface to respect semantic EOT decisions (extend wait time when probability < threshold, dispatch agent call when >= threshold) and surface telemetry.

4. Configuration & Testing

- Introduce env-driven config for model path/provider, probability threshold, and fallback behavior in `src/lib/ai/providers.ts` (or dedicated config module).
- Add unit/integration tests for the turn detector helper (mock tokenizer/logit outputs) and an end-to-end test covering the combined VAD+semantic flow.

## Todos

- assess-pipeline: Map current VAD/EOT flow in Speechmatics + PremiumVoiceInterface
- build-slm-helper: Implement ChatML-based semantic EOT probability helper
- integrate-pipeline: Wire helper into Speechmatics stream + UI logic with configs
- test-config-docs: Add tests, config flags, and brief README/docs note

### To-dos

- [ ] Map current VAD/EOT flow in Speechmatics + PremiumVoiceInterface
- [ ] Implement ChatML-based semantic EOT probability helper
- [ ] Wire helper into Speechmatics stream + UI logic
- [ ] Add tests, config flags, docs for semantic detector