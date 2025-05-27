/**
 * API Service for communicating with LLM server
 */
(function() {
  let serverOnline = false;
  let promptCount = 0;
  let tokenUsage = 0;

  // Check server status
  async function checkServerStatus(silent = false) {
    const statusIndicator = document.querySelector('#server-status .status-indicator');
    const statusText = document.getElementById('status-text');
    const retryButton = document.getElementById('retry-connection');
    const lastCheckTime = document.getElementById('last-check-time');
    
    if (!silent) {
      statusIndicator.className = 'status-indicator status-checking';
      statusText.textContent = 'Checking server...';
      retryButton.style.display = 'none';
    }
    
    try {
      const endpoint = DocumentReviewer.Config.get('API_ENDPOINT');
      const modelName = DocumentReviewer.Config.get('MODEL_NAME');
      
      // Set a timeout for the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      // Try multiple endpoint paths to improve compatibility
      const endpointPaths = [
        '/v1/models',       // OpenAI compatible format
        '/models',          // Alternative format
        '/api/models',      // Another common format
        ''                  // Root path as fallback
      ];
      
      // Try endpoints in sequence until one works
      for (const path of endpointPaths) {
        try {
          const response = await fetch(`${endpoint}${path}`, { 
            method: 'GET',
            headers: { 
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            signal: controller.signal,
            // Adding mode to handle potential CORS issues
            mode: 'cors',
            cache: 'no-cache'
          });
          
          if (response.ok) {
            clearTimeout(timeoutId); // Clear timeout
            
            // Attempt to parse the response
            const data = await response.json();
            
            // Check for different API response formats
            let modelAvailable = false;
            let availableModels = [];
            
            // Format 1: OpenAI-like format with data.data array
            if (data.data && Array.isArray(data.data)) {
              availableModels = data.data.map(model => model.id || model.name || String(model));
              modelAvailable = availableModels.some(modelId => 
                modelId === modelName || 
                modelId.includes('gemma') || 
                modelId.includes('3-4b')
              );
            } 
            // Format 2: Simple array of models
            else if (Array.isArray(data)) {
              availableModels = data.map(model => model.id || model.name || String(model));
              modelAvailable = availableModels.some(modelId => 
                modelId === modelName || 
                modelId.includes('gemma') || 
                modelId.includes('3-4b')
              );
            }
            // Format 3: Object with models property
            else if (data.models && Array.isArray(data.models)) {
              availableModels = data.models.map(model => model.id || model.name || String(model));
              modelAvailable = availableModels.some(modelId => 
                modelId === modelName || 
                modelId.includes('gemma') || 
                modelId.includes('3-4b')
              );
            }
            // Format 4: Simple health check, consider it working if response is OK
            else {
              // If we got a valid response but unknown format, assume server is online
              modelAvailable = true;
              availableModels = ["API available but model list format unknown"];
            }
            
            const availableModelsStr = availableModels.join(', ');
            
            if (modelAvailable) {
              statusIndicator.className = 'status-indicator status-online';
              statusText.textContent = 'Server online';
              serverOnline = true;
              retryButton.style.display = 'none';
              if (!silent) DocumentReviewer.UI.updateDebugInfo(`Connected to LLM server at ${endpoint}${path} with models: ${availableModelsStr}`);
              lastCheckTime.textContent = new Date().toLocaleTimeString();
              return true;
            } else {
              statusIndicator.className = 'status-indicator status-offline';
              statusText.textContent = 'Model not available';
              serverOnline = false;
              retryButton.style.display = 'inline-block';
              if (!silent) DocumentReviewer.UI.updateDebugInfo(`Connected to server but required model not available. Available models: ${availableModelsStr}`);
              lastCheckTime.textContent = new Date().toLocaleTimeString();
              // Don't return false yet, try other endpoints
            }
          }
        } catch (pathError) {
          console.log(`Path ${path} failed:`, pathError);
          // Continue trying other paths
        }
      }
      
      // If we get here, none of the endpoints worked
      clearTimeout(timeoutId);
      statusIndicator.className = 'status-indicator status-offline';
      statusText.textContent = 'API not found';
      serverOnline = false;
      retryButton.style.display = 'inline-block';
      if (!silent) DocumentReviewer.UI.updateDebugInfo(`Could not connect to server API at ${endpoint} with any known endpoint path`);
      lastCheckTime.textContent = new Date().toLocaleTimeString();
      return false;
      
    } catch (error) {
      console.error("Server status check failed:", error);
      
      // Check if this was an abort error (timeout)
      const errorMessage = error.name === 'AbortError' ? 
        'Connection timeout' : 
        `Connection error: ${error.message}`;
      
      statusIndicator.className = 'status-indicator status-offline';
      statusText.textContent = errorMessage;
      serverOnline = false;
      retryButton.style.display = 'inline-block';
      
      if (!silent) DocumentReviewer.UI.updateDebugInfo(`Failed to connect to server: ${error.message}`);
      lastCheckTime.textContent = new Date().toLocaleTimeString();
      return false;
    }
  }

  // Call LLM with prompt - updated to handle automatic temperature and log responses
  async function callLLM(prompt) {
    // If the server is not online, throw error
    if (!serverOnline) {
      throw new Error('LLM server is not available');
    }
    
    const endpoint = window.DocumentReviewer.Config.get('API_ENDPOINT');
    const modelName = window.DocumentReviewer.Config.get('MODEL_NAME');
    
    window.DocumentReviewer.UI.updateDebugInfo(`Sending prompt to LLM (${prompt.length} chars)`);
    
    // Track token usage (estimate)
    promptCount++;
    const estimatedTokens = Math.ceil(prompt.length / 4);
    tokenUsage += estimatedTokens;
    
    try {
      // Get temperature - may be "auto" or a number
      const temperature = window.DocumentReviewer.UI.getTemperature();
      
      // First try the standard OpenAI-compatible endpoint
      try {
        const requestBody = {
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 2048
        };
        
        // Only add temperature if not auto
        if (temperature !== "auto") {
          requestBody.temperature = temperature;
        }
        
        const response = await fetch(`${endpoint}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
        
        if (response.ok) {
          const data = await response.json();
          let responseText = '';
          
          if (data.choices && data.choices[0] && data.choices[0].message) {
            responseText = data.choices[0].message.content;
          } else if (data.choices && data.choices[0] && data.choices[0].text) {
            responseText = data.choices[0].text;
          } else {
            throw new Error('Unexpected response format from LLM API');
          }
          
          // Log the response if we have a debug logger
          if (window.DocumentReviewer.DebugLogger) {
            window.DocumentReviewer.DebugLogger.logResponse(responseText, 'LLM Response');
          }
          
          return responseText;
        } else if (response.status === 404) {
          // Try alternative endpoint if 404 (not found)
          throw new Error('Endpoint not found');
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
      } catch (openaiError) {
        console.log('Standard endpoint failed, trying alternative:', openaiError);
        
        // Try alternative endpoint format (completions without chat/)
        const requestBody = {
          model: modelName,
          prompt: prompt,
          max_tokens: 2048
        };
        
        // Only add temperature if not auto
        if (temperature !== "auto") {
          requestBody.temperature = temperature;
        }
        
        const response = await fetch(`${endpoint}/v1/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });
        
        if (response.ok) {
          const data = await response.json();
          let responseText = '';
          
          if (data.choices && data.choices[0] && data.choices[0].text) {
            responseText = data.choices[0].text;
          } else {
            throw new Error('Unexpected response format from LLM API');
          }
          
          // Log the response if we have a debug logger
          if (window.DocumentReviewer.DebugLogger) {
            window.DocumentReviewer.DebugLogger.logResponse(responseText, 'LLM Response (Alternative Endpoint)');
          }
          
          return responseText;
        } else {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
      }
    } catch (error) {
      console.error('Error calling LLM:', error);
      throw new Error(`Failed to get response from LLM: ${error.message}`);
    }
  }

  // Reset prompt counters
  function resetCounters() {
    promptCount = 0;
    tokenUsage = 0;
  }

  // Get current state
  function getState() {
    return {
      serverOnline,
      promptCount,
      tokenUsage
    };
  }

  // Ensure DocumentReviewer exists
  if (!window.DocumentReviewer) window.DocumentReviewer = {};

  // Export to namespace
  window.DocumentReviewer.APIService = {
    checkServerStatus,
    callLLM,
    resetCounters,
    getState
  };
})();
