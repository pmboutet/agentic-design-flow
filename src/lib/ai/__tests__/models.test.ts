/**
 * Unit tests for Models module
 * Tests mapModelRow function for database row to AiModelConfig mapping
 */

import { mapModelRow } from '../models';

// ============================================================================
// TESTS
// ============================================================================

describe('Models', () => {
  describe('mapModelRow', () => {
    test('should map required fields correctly', () => {
      const row = {
        id: 'model-123',
        code: 'anthropic-claude-sonnet',
        name: 'Claude Sonnet',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        api_key_env_var: 'ANTHROPIC_API_KEY',
      };

      const result = mapModelRow(row);

      expect(result.id).toBe('model-123');
      expect(result.code).toBe('anthropic-claude-sonnet');
      expect(result.name).toBe('Claude Sonnet');
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-5-sonnet-20241022');
      expect(result.apiKeyEnvVar).toBe('ANTHROPIC_API_KEY');
    });

    test('should map optional base_url', () => {
      const row = {
        id: 'model-1',
        code: 'openai-gpt4',
        name: 'GPT-4',
        provider: 'openai',
        model: 'gpt-4',
        api_key_env_var: 'OPENAI_API_KEY',
        base_url: 'https://api.openai.com/v1',
      };

      const result = mapModelRow(row);

      expect(result.baseUrl).toBe('https://api.openai.com/v1');
    });

    test('should handle null base_url', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        base_url: null,
      };

      const result = mapModelRow(row);

      expect(result.baseUrl).toBeNull();
    });

    test('should map additional_headers', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        additional_headers: { 'X-Custom-Header': 'value' },
      };

      const result = mapModelRow(row);

      expect(result.additionalHeaders).toEqual({ 'X-Custom-Header': 'value' });
    });

    test('should handle null additional_headers', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        additional_headers: null,
      };

      const result = mapModelRow(row);

      expect(result.additionalHeaders).toBeNull();
    });

    test('should convert is_default to boolean', () => {
      const rowTrue = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        is_default: true,
      };

      const rowFalse = {
        ...rowTrue,
        is_default: false,
      };

      const rowNull = {
        ...rowTrue,
        is_default: null,
      };

      expect(mapModelRow(rowTrue).isDefault).toBe(true);
      expect(mapModelRow(rowFalse).isDefault).toBe(false);
      expect(mapModelRow(rowNull).isDefault).toBe(false);
    });

    test('should convert is_fallback to boolean', () => {
      const rowTrue = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        is_fallback: true,
      };

      const rowFalse = {
        ...rowTrue,
        is_fallback: false,
      };

      expect(mapModelRow(rowTrue).isFallback).toBe(true);
      expect(mapModelRow(rowFalse).isFallback).toBe(false);
    });

    test('should map timestamps', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        created_at: '2024-01-15T10:00:00Z',
        updated_at: '2024-01-15T12:00:00Z',
      };

      const result = mapModelRow(row);

      expect(result.createdAt).toBe('2024-01-15T10:00:00Z');
      expect(result.updatedAt).toBe('2024-01-15T12:00:00Z');
    });

    test('should handle null timestamps', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        created_at: null,
        updated_at: null,
      };

      const result = mapModelRow(row);

      expect(result.createdAt).toBeUndefined();
      expect(result.updatedAt).toBeUndefined();
    });

    test('should map thinking configuration', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        enable_thinking: true,
        thinking_budget_tokens: 10000,
      };

      const result = mapModelRow(row);

      expect(result.enableThinking).toBe(true);
      expect(result.thinkingBudgetTokens).toBe(10000);
    });

    test('should handle null thinking configuration', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        enable_thinking: null,
        thinking_budget_tokens: null,
      };

      const result = mapModelRow(row);

      expect(result.enableThinking).toBeUndefined();
      expect(result.thinkingBudgetTokens).toBeUndefined();
    });

    test('should map voice_agent_provider', () => {
      const rowDeepgram = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        voice_agent_provider: 'deepgram-voice-agent',
      };

      const rowSpeechmatics = {
        ...rowDeepgram,
        voice_agent_provider: 'speechmatics-voice-agent',
      };

      expect(mapModelRow(rowDeepgram).voiceAgentProvider).toBe('deepgram-voice-agent');
      expect(mapModelRow(rowSpeechmatics).voiceAgentProvider).toBe('speechmatics-voice-agent');
    });

    test('should map Deepgram-specific columns', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'deepgram',
        model: 'nova-2',
        api_key_env_var: 'DEEPGRAM_API_KEY',
        deepgram_voice_agent_model: 'aura-asteria-en',
        deepgram_stt_model: 'nova-2',
        deepgram_tts_model: 'aura-asteria-en',
        deepgram_llm_provider: 'anthropic',
      };

      const result = mapModelRow(row);

      expect(result.deepgramLlmModel).toBe('aura-asteria-en');
      expect(result.deepgramSttModel).toBe('nova-2');
      expect(result.deepgramTtsModel).toBe('aura-asteria-en');
      expect(result.deepgramLlmProvider).toBe('anthropic');
    });

    test('should handle null Deepgram columns', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        deepgram_voice_agent_model: null,
        deepgram_stt_model: null,
        deepgram_tts_model: null,
        deepgram_llm_provider: null,
      };

      const result = mapModelRow(row);

      expect(result.deepgramLlmModel).toBeUndefined();
      expect(result.deepgramSttModel).toBeUndefined();
      expect(result.deepgramTtsModel).toBeUndefined();
      expect(result.deepgramLlmProvider).toBeUndefined();
    });

    test('should map Speechmatics-specific columns', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'speechmatics',
        model: 'speechmatics',
        api_key_env_var: 'SPEECHMATICS_API_KEY',
        speechmatics_stt_language: 'fr',
        speechmatics_stt_operating_point: 'enhanced',
        speechmatics_stt_max_delay: 1.0,
        speechmatics_stt_enable_partials: true,
        speechmatics_llm_provider: 'anthropic',
        speechmatics_llm_model: 'claude-3-haiku',
        speechmatics_api_key_env_var: 'SPEECHMATICS_API_KEY',
      };

      const result = mapModelRow(row);

      expect(result.speechmaticsSttLanguage).toBe('fr');
      expect(result.speechmaticsSttOperatingPoint).toBe('enhanced');
      expect(result.speechmaticsSttMaxDelay).toBe(1.0);
      expect(result.speechmaticsSttEnablePartials).toBe(true);
      expect(result.speechmaticsLlmProvider).toBe('anthropic');
      expect(result.speechmaticsLlmModel).toBe('claude-3-haiku');
      expect(result.speechmaticsApiKeyEnvVar).toBe('SPEECHMATICS_API_KEY');
    });

    test('should handle null Speechmatics columns', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        speechmatics_stt_language: null,
        speechmatics_stt_operating_point: null,
        speechmatics_stt_max_delay: null,
        speechmatics_stt_enable_partials: null,
        speechmatics_llm_provider: null,
        speechmatics_llm_model: null,
        speechmatics_api_key_env_var: null,
      };

      const result = mapModelRow(row);

      expect(result.speechmaticsSttLanguage).toBeUndefined();
      expect(result.speechmaticsSttOperatingPoint).toBeUndefined();
      expect(result.speechmaticsSttMaxDelay).toBeUndefined();
      expect(result.speechmaticsSttEnablePartials).toBeUndefined();
      expect(result.speechmaticsLlmProvider).toBeUndefined();
      expect(result.speechmaticsLlmModel).toBeUndefined();
      expect(result.speechmaticsApiKeyEnvVar).toBeUndefined();
    });

    test('should map ElevenLabs-specific columns', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'elevenlabs',
        model: 'eleven_turbo_v2',
        api_key_env_var: 'ELEVENLABS_API_KEY',
        elevenlabs_voice_id: 'rachel-voice-id',
        elevenlabs_model_id: 'eleven_turbo_v2_5',
        elevenlabs_api_key_env_var: 'ELEVENLABS_API_KEY',
      };

      const result = mapModelRow(row);

      expect(result.elevenLabsVoiceId).toBe('rachel-voice-id');
      expect(result.elevenLabsModelId).toBe('eleven_turbo_v2_5');
      expect(result.elevenLabsApiKeyEnvVar).toBe('ELEVENLABS_API_KEY');
    });

    test('should handle null ElevenLabs columns', () => {
      const row = {
        id: 'model-1',
        code: 'test',
        name: 'Test',
        provider: 'anthropic',
        model: 'claude',
        api_key_env_var: 'KEY',
        elevenlabs_voice_id: null,
        elevenlabs_model_id: null,
        elevenlabs_api_key_env_var: null,
      };

      const result = mapModelRow(row);

      expect(result.elevenLabsVoiceId).toBeUndefined();
      expect(result.elevenLabsModelId).toBeUndefined();
      expect(result.elevenLabsApiKeyEnvVar).toBeUndefined();
    });

    test('should map complete row with all fields', () => {
      const row = {
        id: 'complete-model',
        code: 'complete-config',
        name: 'Complete Model Config',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet',
        base_url: 'https://api.anthropic.com',
        api_key_env_var: 'ANTHROPIC_API_KEY',
        additional_headers: { 'X-Custom': 'value' },
        is_default: true,
        is_fallback: false,
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        enable_thinking: true,
        thinking_budget_tokens: 5000,
        voice_agent_provider: 'speechmatics-voice-agent',
        deepgram_voice_agent_model: null,
        deepgram_stt_model: null,
        deepgram_tts_model: null,
        deepgram_llm_provider: null,
        speechmatics_stt_language: 'fr',
        speechmatics_stt_operating_point: 'standard',
        speechmatics_stt_max_delay: 1.5,
        speechmatics_stt_enable_partials: true,
        speechmatics_llm_provider: 'anthropic',
        speechmatics_llm_model: 'claude-3-haiku',
        speechmatics_api_key_env_var: 'SPEECHMATICS_KEY',
        elevenlabs_voice_id: 'voice-123',
        elevenlabs_model_id: 'eleven_turbo_v2',
        elevenlabs_api_key_env_var: 'ELEVENLABS_KEY',
      };

      const result = mapModelRow(row);

      // Basic fields
      expect(result.id).toBe('complete-model');
      expect(result.code).toBe('complete-config');
      expect(result.name).toBe('Complete Model Config');
      expect(result.provider).toBe('anthropic');
      expect(result.model).toBe('claude-3-5-sonnet');
      expect(result.baseUrl).toBe('https://api.anthropic.com');
      expect(result.apiKeyEnvVar).toBe('ANTHROPIC_API_KEY');
      expect(result.additionalHeaders).toEqual({ 'X-Custom': 'value' });
      expect(result.isDefault).toBe(true);
      expect(result.isFallback).toBe(false);

      // Timestamps
      expect(result.createdAt).toBe('2024-01-01T00:00:00Z');
      expect(result.updatedAt).toBe('2024-01-02T00:00:00Z');

      // Thinking
      expect(result.enableThinking).toBe(true);
      expect(result.thinkingBudgetTokens).toBe(5000);

      // Voice provider
      expect(result.voiceAgentProvider).toBe('speechmatics-voice-agent');

      // Speechmatics
      expect(result.speechmaticsSttLanguage).toBe('fr');
      expect(result.speechmaticsSttOperatingPoint).toBe('standard');
      expect(result.speechmaticsSttMaxDelay).toBe(1.5);
      expect(result.speechmaticsSttEnablePartials).toBe(true);
      expect(result.speechmaticsLlmProvider).toBe('anthropic');
      expect(result.speechmaticsLlmModel).toBe('claude-3-haiku');

      // ElevenLabs
      expect(result.elevenLabsVoiceId).toBe('voice-123');
      expect(result.elevenLabsModelId).toBe('eleven_turbo_v2');
    });

    test('should handle minimal required fields only', () => {
      const row = {
        id: 'minimal',
        code: 'min',
        name: 'Minimal',
        provider: 'openai',
        model: 'gpt-4',
        api_key_env_var: 'OPENAI_KEY',
      };

      const result = mapModelRow(row);

      expect(result.id).toBe('minimal');
      expect(result.code).toBe('min');
      expect(result.baseUrl).toBeNull();
      expect(result.additionalHeaders).toBeNull();
      expect(result.isDefault).toBe(false);
      expect(result.isFallback).toBe(false);
    });
  });
});
