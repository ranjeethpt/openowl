/**
 * LLM abstraction layer for OpenOwl
 * Supports Claude (Anthropic), OpenAI, Google Gemini, and local Ollama
 */

import { PROVIDERS, PROVIDER_NAMES } from '../constants.js';

/**
 * Provider API configuration
 * Single source of truth for all provider endpoints and settings
 */
const PROVIDER_CONFIG = {
  [PROVIDERS.CLAUDE]: {
    endpoint: 'https://api.anthropic.com/v1',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    })
  },
  [PROVIDERS.OPENAI]: {
    endpoint: 'https://api.openai.com/v1',
    headers: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    })
  },
  [PROVIDERS.GEMINI]: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    // Gemini uses query param for key, not header
    headers: () => ({
      'Content-Type': 'application/json'
    })
  },
  [PROVIDERS.OLLAMA]: {
    // Ollama endpoint is dynamic (user-configurable)
    endpoint: null,
    headers: () => ({
      'Content-Type': 'application/json'
    })
  }
};

/**
 * Call LLM with streaming support and multi-turn conversations
 * @param {Object} config - { provider, apiKey, model, prompt, systemPrompt, messages, maxTokens, ollamaUrl }
 * @param {Function} onChunk - Callback for streaming chunks
 * @returns {Promise<string|{text: string, usage: Object}>} Response text (streaming) or object with text and usage (non-streaming)
 */
export async function callLLM(config, onChunk = null) {
  const { provider, apiKey, model, prompt, systemPrompt, messages = [], maxTokens, ollamaUrl } = config;

  switch (provider) {
    case PROVIDERS.CLAUDE:
      return callClaude({ apiKey, model, prompt, systemPrompt, messages, maxTokens }, onChunk);
    case PROVIDERS.OPENAI:
      return callOpenAI({ apiKey, model, prompt, systemPrompt, messages, maxTokens }, onChunk);
    case PROVIDERS.GEMINI:
      return callGemini({ apiKey, model, prompt, systemPrompt, messages, maxTokens }, onChunk);
    case PROVIDERS.OLLAMA:
      return callOllama({ model, prompt, systemPrompt, messages, maxTokens, ollamaUrl }, onChunk);
    default:
      throw new Error(`Unsupported provider: ${PROVIDER_NAMES[provider] || provider}`);
  }
}

/**
 * Call Claude API (Anthropic)
 * @private
 */
async function callClaude({ apiKey, model, prompt, systemPrompt, messages = [], maxTokens }, onChunk) {
  // Build messages array: history + current prompt
  const messageHistory = messages
    .slice(-10) // Cap at last 10 messages
    .filter(m => m.role !== 'error' && m.text && m.text.trim()) // Filter errors and empty
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text
    }));

  // Only add prompt if it's not already the last message
  const lastMsg = messages[messages.length - 1];
  const promptAlreadyAdded = lastMsg && lastMsg.role === 'user' && lastMsg.text === prompt;

  if (prompt && prompt.trim() && !promptAlreadyAdded) {
    messageHistory.push({ role: 'user', content: prompt });
  }

  const config = PROVIDER_CONFIG[PROVIDERS.CLAUDE];
  const response = await fetch(`${config.endpoint}/messages`, {
    method: 'POST',
    headers: config.headers(apiKey),
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: maxTokens || 4096,
      system: systemPrompt,
      messages: messageHistory,
      stream: !!onChunk
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} ${error}`);
  }

  if (onChunk) {
    return handleClaudeStream(response, onChunk);
  } else {
    const data = await response.json();
    return {
      text: data.content[0].text,
      usage: {
        input_tokens: data.usage?.input_tokens || 0,
        output_tokens: data.usage?.output_tokens || 0,
        total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      }
    };
  }
}

/**
 * Handle Claude streaming response
 * @private
 */
async function handleClaudeStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

      for (const line of lines) {
        const data = line.replace('data:', '').trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            const text = parsed.delta.text;
            fullText += text;
            onChunk(text);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

/**
 * Call OpenAI API
 * @private
 */
async function callOpenAI({ apiKey, model, prompt, systemPrompt, messages = [], maxTokens }, onChunk) {
  // Build messages array: system + history + current
  const messageHistory = [
    { role: 'system', content: systemPrompt }
  ];

  // Add conversation history (filter out empty and error messages)
  messages
    .slice(-10)
    .filter(m => m.role !== 'error' && m.text && m.text.trim()) // Filter errors and empty
    .forEach(m => {
      messageHistory.push({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text
      });
    });

  // Only add prompt if it's not already the last message
  const lastMsg = messages[messages.length - 1];
  const promptAlreadyAdded = lastMsg && lastMsg.role === 'user' && lastMsg.text === prompt;

  if (prompt && prompt.trim() && !promptAlreadyAdded) {
    messageHistory.push({ role: 'user', content: prompt });
  }

  console.log('[OpenAI] Sending messages:', JSON.stringify(messageHistory, null, 2));

  const config = PROVIDER_CONFIG[PROVIDERS.OPENAI];

  // Reasoning models (o1, o3, o4, gpt-5) use max_completion_tokens
  // Older models (gpt-4, gpt-3.5) use max_tokens
  const modelName = model || 'gpt-4o';
  const usesCompletionTokens = modelName.startsWith('o1') ||
                               modelName.startsWith('o3') ||
                               modelName.startsWith('o4') ||
                               modelName.startsWith('gpt-5');

  const requestBody = {
    model: modelName,
    messages: messageHistory,
    stream: !!onChunk
  };

  // Add the correct token parameter
  if (maxTokens) {
    if (usesCompletionTokens) {
      requestBody.max_completion_tokens = maxTokens;
    } else {
      requestBody.max_tokens = maxTokens;
    }
  }

  const response = await fetch(`${config.endpoint}/chat/completions`, {
    method: 'POST',
    headers: config.headers(apiKey),
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  if (onChunk) {
    return handleOpenAIStream(response, onChunk);
  } else {
    const data = await response.json();
    return {
      text: data.choices[0].message.content,
      usage: {
        input_tokens: data.usage?.prompt_tokens || 0,
        output_tokens: data.usage?.completion_tokens || 0,
        total_tokens: data.usage?.total_tokens || 0
      }
    };
  }
}

/**
 * Handle OpenAI streaming response
 * @private
 */
async function handleOpenAIStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

      for (const line of lines) {
        const data = line.replace('data:', '').trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const text = parsed.choices[0]?.delta?.content;
          if (text) {
            fullText += text;
            onChunk(text);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

/**
 * Call Google Gemini API
 * @private
 */
async function callGemini({ apiKey, model, prompt, systemPrompt, messages = [], maxTokens }, onChunk) {
  // Use v1beta - it's the stable API for Gemini 2.5+ models
  const config = PROVIDER_CONFIG[PROVIDERS.GEMINI];
  const modelName = model || 'gemini-2.5-flash';
  const url = `${config.endpoint}/models/${modelName}:${onChunk ? 'streamGenerateContent' : 'generateContent'}?key=${apiKey}`;

  // Build contents array with history
  const contents = [];

  // Add conversation history (filter errors and empty)
  messages
    .slice(-10)
    .filter(m => m.role !== 'error' && m.text && m.text.trim())
    .forEach(m => {
      contents.push({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      });
    });

  // Only add prompt if it's not already the last message
  const lastMsg = messages[messages.length - 1];
  const promptAlreadyAdded = lastMsg && lastMsg.role === 'user' && lastMsg.text === prompt;

  if (prompt && prompt.trim() && !promptAlreadyAdded) {
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });
  }

  const body = {
    systemInstruction: systemPrompt ? {
      parts: [{ text: systemPrompt }]
    } : undefined,
    contents
  };

  // Add generation config if maxTokens specified
  if (maxTokens) {
    body.generationConfig = { maxOutputTokens: maxTokens };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: config.headers(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${error}`);
  }

  if (onChunk) {
    return handleGeminiStream(response, onChunk);
  } else {
    const data = await response.json();
    return {
      text: data.candidates[0].content.parts[0].text,
      usage: {
        input_tokens: data.usageMetadata?.promptTokenCount || 0,
        output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
        total_tokens: data.usageMetadata?.totalTokenCount || 0
      }
    };
  }
}

/**
 * Handle Gemini streaming response
 * @private
 */
async function handleGeminiStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            fullText += text;
            onChunk(text);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

/**
 * Call local Ollama API
 * @private
 */
async function callOllama({ model, prompt, systemPrompt, messages = [], maxTokens, ollamaUrl }, onChunk) {
  const baseUrl = ollamaUrl || 'http://localhost:11434';

  // Build prompt with history for Ollama (doesn't support messages array)
  const validMessages = messages
    .slice(-10)
    .filter(m => m.role !== 'error' && m.text && m.text.trim());

  // Check if prompt is already in messages
  const lastMsg = messages[messages.length - 1];
  const promptAlreadyAdded = lastMsg && lastMsg.role === 'user' && lastMsg.text === prompt;

  let fullPrompt = '';
  if (validMessages.length > 0) {
    fullPrompt = validMessages.map(m =>
      `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`
    ).join('\n\n');
  }

  // Only add prompt if not already in history
  if (prompt && prompt.trim() && !promptAlreadyAdded) {
    fullPrompt = fullPrompt ? `${fullPrompt}\n\nUser: ${prompt}` : `User: ${prompt}`;
  }

  const body = {
    model: model || 'llama2',
    prompt: fullPrompt,
    system: systemPrompt,
    stream: !!onChunk
  };

  if (maxTokens) {
    body.options = { num_predict: maxTokens };
  }

  const config = PROVIDER_CONFIG[PROVIDERS.OLLAMA];
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: config.headers(),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${error}`);
  }

  if (onChunk) {
    return handleOllamaStream(response, onChunk);
  } else {
    const data = await response.json();
    // Ollama provides token counts in some models
    const inputTokens = data.prompt_eval_count || 0;
    const outputTokens = data.eval_count || 0;

    return {
      text: data.response,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        estimated: inputTokens === 0 && outputTokens === 0 // Flag if we have no data
      }
    };
  }
}

/**
 * Handle Ollama streaming response
 * @private
 */
async function handleOllamaStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.response) {
            fullText += parsed.response;
            onChunk(parsed.response);
          }
        } catch (e) {
          // Skip invalid JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

/**
 * Call LLM using a named prompt from the registry
 * @param {string} promptName - Name of prompt in registry (ask, standup, etc)
 * @param {Object} promptContext - Context for building the prompt
 * @param {string} userMessage - User's message (if empty, uses prompt.user if available)
 * @param {Object} llmConfig - { provider, apiKey, model, ollamaUrl }
 * @param {Function} [onChunk] - Optional streaming callback
 * @returns {Promise<{text: string, promptName: string, tokensUsed: number}>}
 */
export async function callWithPrompt(promptName, promptContext, userMessage, llmConfig, onChunk = null) {
  // Import here to avoid circular dependency
  const { getPrompt } = await import('../prompts/registry.js');

  // Get the built prompt
  const prompt = getPrompt(promptName, promptContext);

  // Use user message if provided, otherwise use prompt.user as fallback
  const finalUserMessage = userMessage || prompt.user || 'Please help.';

  // Call the LLM
  const response = await callLLM({
    provider: llmConfig.provider,
    apiKey: llmConfig.apiKey,
    model: llmConfig.model,
    prompt: finalUserMessage,
    systemPrompt: prompt.system,
    ollamaUrl: llmConfig.ollamaUrl
  }, onChunk);

  // Estimate tokens used (rough approximation: chars / 4)
  const tokensUsed = Math.ceil((prompt.system.length + finalUserMessage.length + response.length) / 4);

  return {
    text: response,
    promptName,
    tokensUsed
  };
}

/**
 * Test LLM connection
 * @param {Object} config - { provider, apiKey, model }
 * @returns {Promise<boolean>} True if connection successful
 */
export async function testConnection(config) {
  try {
    await callLLM({
      ...config,
      prompt: 'Reply with just "OK"',
      systemPrompt: 'You are a helpful assistant.'
    });
    return true;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}

/**
 * Helper: Format bytes to human-readable size
 * @private
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i];
}

/**
 * Fetch available models from a provider
 * @param {Object} params - { provider, apiKey, ollamaUrl }
 * @returns {Promise<{success: boolean, models?: Array, error?: string}>}
 */
export async function fetchModels({ provider, apiKey, ollamaUrl }) {
  try {
    console.log(`[fetchModels] Fetching models for provider: ${provider}`);

    switch (provider) {
      case PROVIDERS.CLAUDE: {
        const config = PROVIDER_CONFIG[PROVIDERS.CLAUDE];
        const response = await fetch(`${config.endpoint}/models`, {
          method: 'GET',
          headers: config.headers(apiKey)
        });

        if (response.status === 401) {
          return { success: false, error: 'invalid_key' };
        }
        if (response.status === 429) {
          return { success: false, error: 'rate_limit' };
        }
        if (!response.ok) {
          console.error('[fetchModels] Claude API error:', response.status);
          return { success: false, error: 'network' };
        }

        const result = await response.json();
        const models = (result.data || []).map(model => ({
          value: model.id,
          label: model.display_name || model.id
        }));

        console.log(`[fetchModels] Fetched ${models.length} Claude models`);
        return { success: true, models };
      }

      case PROVIDERS.OPENAI: {
        const config = PROVIDER_CONFIG[PROVIDERS.OPENAI];
        const response = await fetch(`${config.endpoint}/models`, {
          method: 'GET',
          headers: config.headers(apiKey)
        });

        if (response.status === 401) {
          return { success: false, error: 'invalid_key' };
        }
        if (response.status === 429) {
          return { success: false, error: 'rate_limit' };
        }
        if (!response.ok) {
          console.error('[fetchModels] OpenAI API error:', response.status);
          return { success: false, error: 'network' };
        }

        const result = await response.json();

        // Only keep chat-compatible models that work with /v1/chat/completions
        const CHAT_MODEL_PREFIXES = ['gpt-4', 'gpt-3.5', 'o1', 'o3', 'o4', 'gpt-5'];
        const EXCLUDED_KEYWORDS = [
          'realtime', 'audio', 'transcribe', 'search', 'tts', 'image',
          'codex', 'deep-research', 'instruct', 'sora', 'moderation',
          'embedding', 'davinci', 'babbage'
        ];

        const models = (result.data || [])
          .filter(model => CHAT_MODEL_PREFIXES.some(prefix => model.id.startsWith(prefix)))
          .filter(model => !EXCLUDED_KEYWORDS.some(keyword => model.id.includes(keyword)))
          .sort((a, b) => (b.created || 0) - (a.created || 0)) // Newest first
          .map(model => ({
            value: model.id,
            label: model.id
          }));

        console.log(`[fetchModels] Fetched ${models.length} OpenAI chat models`);
        return { success: true, models };
      }

      case PROVIDERS.GEMINI: {
        const config = PROVIDER_CONFIG[PROVIDERS.GEMINI];
        const response = await fetch(
          `${config.endpoint}/models?key=${apiKey}`,
          { method: 'GET', headers: config.headers() }
        );

        if (response.status === 400 || response.status === 403) {
          return { success: false, error: 'invalid_key' };
        }
        if (response.status === 429) {
          return { success: false, error: 'rate_limit' };
        }
        if (!response.ok) {
          console.error('[fetchModels] Gemini API error:', response.status);
          return { success: false, error: 'network' };
        }

        const result = await response.json();

        // Only keep chat-compatible models - filter out embeddings, image gen, etc
        const EXCLUDED_KEYWORDS = ['embedding', 'aqa', 'imagen'];

        const models = (result.models || [])
          .filter(model =>
            model.supportedGenerationMethods?.includes('generateContent')
          )
          .filter(model => {
            const modelName = model.name.toLowerCase();
            return !EXCLUDED_KEYWORDS.some(keyword => modelName.includes(keyword));
          })
          .map(model => ({
            value: model.name.replace('models/', ''),
            label: model.name.replace('models/', '')
          }));

        console.log(`[fetchModels] Fetched ${models.length} Gemini chat models`);
        return { success: true, models };
      }

      case PROVIDERS.OLLAMA: {
        const baseUrl = ollamaUrl || 'http://localhost:11434';
        const config = PROVIDER_CONFIG[PROVIDERS.OLLAMA];
        const response = await fetch(`${baseUrl}/api/tags`, {
          method: 'GET',
          headers: config.headers()
        });

        if (!response.ok) {
          console.error('[fetchModels] Ollama connection error:', response.status);
          return { success: false, error: 'network' };
        }

        const result = await response.json();
        const models = (result.models || []).map(model => ({
          value: model.name,
          label: model.size
            ? `${model.name} (${formatBytes(model.size)})`
            : model.name
        }));

        console.log(`[fetchModels] Fetched ${models.length} Ollama models`);
        return { success: true, models };
      }

      default:
        return { success: false, error: 'unknown' };
    }
  } catch (error) {
    console.error('[fetchModels] Error:', error);
    return { success: false, error: 'network' };
  }
}
