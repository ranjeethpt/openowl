/**
 * LLM abstraction layer for OpenOwl
 * Supports Claude (Anthropic), OpenAI, Google Gemini, and local Ollama
 */

import { PROVIDERS, PROVIDER_NAMES } from '../constants.js';

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

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
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

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: messageHistory,
      max_tokens: maxTokens,
      stream: !!onChunk
    })
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
  const modelName = model || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:${onChunk ? 'streamGenerateContent' : 'generateContent'}?key=${apiKey}`;

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
    headers: {
      'Content-Type': 'application/json'
    },
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

    // Handle edge cases where Gemini returns no content (e.g., MAX_TOKENS with empty response)
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) {
      throw new Error(`Gemini returned no content: ${data.candidates?.[0]?.finishReason || 'Unknown reason'}`);
    }

    return {
      text: content,
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

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
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
