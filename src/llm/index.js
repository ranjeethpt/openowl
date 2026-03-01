/**
 * LLM abstraction layer for OpenOwl
 * Supports Claude (Anthropic), OpenAI, Google Gemini, and local Ollama
 */

/**
 * Call LLM with streaming support
 * @param {Object} config - { provider, apiKey, model, prompt, systemPrompt, ollamaUrl }
 * @param {Function} onChunk - Callback for streaming chunks
 * @returns {Promise<string>} Full response text
 */
export async function callLLM(config, onChunk = null) {
  const { provider, apiKey, model, prompt, systemPrompt, ollamaUrl } = config;

  switch (provider) {
    case 'claude':
      return callClaude({ apiKey, model, prompt, systemPrompt }, onChunk);
    case 'openai':
      return callOpenAI({ apiKey, model, prompt, systemPrompt }, onChunk);
    case 'gemini':
      return callGemini({ apiKey, model, prompt, systemPrompt }, onChunk);
    case 'ollama':
      return callOllama({ model, prompt, systemPrompt, ollamaUrl }, onChunk);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Call Claude API (Anthropic)
 * @private
 */
async function callClaude({ apiKey, model, prompt, systemPrompt }, onChunk) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
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
    return data.content[0].text;
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
async function callOpenAI({ apiKey, model, prompt, systemPrompt }, onChunk) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
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
    return data.choices[0].message.content;
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
async function callGemini({ apiKey, model, prompt, systemPrompt }, onChunk) {
  const modelName = model || 'gemini-2.0-flash-exp';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:${onChunk ? 'streamGenerateContent' : 'generateContent'}?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${error}`);
  }

  if (onChunk) {
    return handleGeminiStream(response, onChunk);
  } else {
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
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
async function callOllama({ model, prompt, systemPrompt, ollamaUrl }, onChunk) {
  const baseUrl = ollamaUrl || 'http://localhost:11434';
  const response = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: model || 'llama2',
      prompt: prompt,
      system: systemPrompt,
      stream: !!onChunk
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Ollama API error: ${response.status} ${error}`);
  }

  if (onChunk) {
    return handleOllamaStream(response, onChunk);
  } else {
    const data = await response.json();
    return data.response;
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
