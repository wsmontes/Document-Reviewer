/**
 * UI Controller - Manages all UI-related operations
 */
(function() {
  // DOM elements
  const elements = {
    chatHistory: document.getElementById('chat-history'),
    userInput: document.getElementById('user-input'),
    submitBtn: document.getElementById('submit-btn'),
    inputForm: document.getElementById('input-area'),
    metaProcessStages: document.getElementById('meta-process-stages'),
    metaProcessTime: document.getElementById('meta-process-time'),
    responseContent: document.getElementById('response-content'),
    debugContent: document.getElementById('debug-content'),
    documentStatus: document.getElementById('document-status'),
    documentContent: document.getElementById('document-content'),
    documentViewContainer: document.getElementById('document-view-container'),
    promptCountDisplay: document.getElementById('prompt-count'),
    tokenUsageDisplay: document.getElementById('token-usage'),
    metaQualityDisplay: document.getElementById('meta-quality'),
    temperatureSlider: document.getElementById('temperature'),
    tempDisplay: document.getElementById('temp-display'),
    complexityDisplay: document.getElementById('complexity-display').querySelector('.complexity-indicator'),
    determinationSlider: document.getElementById('determination'),
    determinationDisplay: document.getElementById('determination-display'),
    determinationBar: document.getElementById('determination-bar'),
    confidenceScoreDisplay: document.getElementById('confidence-score').querySelector('.confidence-indicator'),
    documentsList: document.getElementById('documents-list')
  };

  // State variables
  let messages = [];
  let metaProcessDefinition = [];

  // Add message to chat
  function addMessage(type, content) {
    const message = document.createElement('div');
    message.className = `message ${type}`;
    
    let avatar;
    if (type === 'user') {
      avatar = 'U';
    } else if (type === 'ai') {
      avatar = 'AI';
    } else {
      avatar = '•';
    }
    
    message.innerHTML = `
      <div class="avatar">${avatar}</div>
      <div class="bubble">${content}</div>
    `;
    
    elements.chatHistory.appendChild(message);
    elements.chatHistory.scrollTop = elements.chatHistory.scrollHeight;
    
    // Store in messages array
    messages.push({ type, content });
  }

  // Add system message
  function addSystemMessage(message) {
    addMessage('system', message);
  }

  // Add AI message
  function addAIMessage(message) {
    addMessage('ai', message);
  }

  // Add user message
  function addUserMessage(message) {
    addMessage('user', message);
  }

  // Update debug info
  function updateDebugInfo(info) {
    const timestamp = new Date().toLocaleTimeString();
    elements.debugContent.innerHTML += `<div>[${timestamp}] ${info}</div>`;
    elements.debugContent.scrollTop = elements.debugContent.scrollHeight;
  }

  // Update document status
  function updateDocumentStatus(message, type = 'info') {
    elements.documentStatus.textContent = message;
    
    // Set color based on type
    if (type === 'error') {
      elements.documentStatus.style.color = '#ef4444';
    } else if (type === 'success') {
      elements.documentStatus.style.color = '#22c55e';
    } else if (type === 'warning') {
      elements.documentStatus.style.color = '#f59e0b';
    } else {
      elements.documentStatus.style.color = '#a1a1aa';
    }
  }

  // Clear document content
  function clearDocumentContent() {
    elements.documentContent.innerHTML = '';
  }

  // Show document view
  function showDocumentView() {
    elements.documentViewContainer.style.display = 'block';
  }

  // Show documents list
  function showDocumentsList() {
    elements.documentsList.classList.remove('hidden');
  }

  // Update placeholder
  function updatePlaceholder(text) {
    elements.userInput.placeholder = text;
  }

  // Get temperature value - updated for auto mode
  function getTemperature() {
    // If slider is at 0, return "auto" to let LLM decide temperature
    const tempValue = elements.temperatureSlider.value;
    return tempValue === "0" ? "auto" : tempValue / 100;
  }

  // Update temperature display - updated for auto mode
  function updateTemperatureDisplay() {
    const temp = elements.temperatureSlider.value;
    if (temp === "0") {
      elements.tempDisplay.textContent = "Auto";
      elements.tempDisplay.classList.add("auto-temp");
    } else {
      elements.tempDisplay.textContent = (temp / 100).toFixed(1);
      elements.tempDisplay.classList.remove("auto-temp");
    }
  }

  // Update determination display
  function updateDeterminationDisplay() {
    const value = elements.determinationSlider.value;
    elements.determinationDisplay.textContent = value;
    // Fix: Use window.DocumentReviewer instead of DR
    if (window.DocumentReviewer && window.DocumentReviewer.MetaEngine) {
      window.DocumentReviewer.MetaEngine.setDeterminationLevel(parseInt(value));
    }
  }
  
  // Update complexity display
  function updateComplexityDisplay(complexity, stages) {
    elements.complexityDisplay.textContent = complexity || 'adaptive';
    elements.complexityDisplay.className = 'complexity-indicator complexity-' + (complexity || 'adaptive');
    
    if (stages) {
      elements.complexityDisplay.title = `${stages} stages recommended`;
    }
  }

  // Update confidence display
  function updateConfidenceDisplay(confidence) {
    let confidenceClass, confidenceText;
    
    if (confidence < 0.5) {
      confidenceClass = 'confidence-low';
      confidenceText = 'Low';
    } else if (confidence < 0.8) {
      confidenceClass = 'confidence-medium';
      confidenceText = 'Medium';
    } else {
      confidenceClass = 'confidence-high';
      confidenceText = 'High';
    }
    
    elements.confidenceScoreDisplay.className = `confidence-indicator ${confidenceClass}`;
    elements.confidenceScoreDisplay.textContent = confidenceText;
  }

  // Render meta process stages
  function renderMetaProcessStages() {
    elements.metaProcessStages.innerHTML = '';
    
    metaProcessDefinition.forEach((stage, index) => {
      const stageElement = document.createElement('div');
      stageElement.className = 'meta-process-stage';
      stageElement.id = `stage-${stage.id || index}`;
      
      stageElement.innerHTML = `
        <h3>${stage.title}</h3>
        <p>${stage.description}</p>
        <div class="stage-content">Pending...</div>
      `;
      
      elements.metaProcessStages.appendChild(stageElement);
    });
  }
  
  // Update meta stage content
  function updateMetaStage(index, content, completed = false) {
    const stageElement = document.querySelector(`.meta-process-stage:nth-child(${index + 1})`);
    
    if (!stageElement) return;
    
    // Update content
    const contentElement = stageElement.querySelector('.stage-content');
    if (contentElement) {
      contentElement.innerHTML = content;
    }
    
    // Update stage status
    document.querySelectorAll('.meta-process-stage').forEach((el, i) => {
      el.classList.remove('current-stage');
      if (completed && i === index) {
        el.classList.add('completed-stage');
      } else if (!completed && i === index) {
        el.classList.add('current-stage');
      }
    });
  }

  // Set meta process stages definition
  function setMetaProcessDefinition(stages) {
    metaProcessDefinition = stages;
  }

  // Get user input
  function getUserInput() {
    return elements.userInput.value;
  }

  // Clear user input
  function clearUserInput() {
    elements.userInput.value = '';
  }

  // Set processing state
  function setProcessing(isProcessing) {
    elements.submitBtn.disabled = isProcessing;
  }
  
  // Update UI stats
  function updateStats(promptCount, tokenUsage, quality = null) {
    elements.promptCountDisplay.textContent = `Prompts: ${promptCount}`;
    elements.tokenUsageDisplay.textContent = `Tokens: ${tokenUsage}`;
    if (quality !== null) {
      elements.metaQualityDisplay.textContent = `Quality: ${quality}/10`;
    }
  }

  // Update process time
  function updateProcessTime(seconds) {
    elements.metaProcessTime.textContent = `Completed in: ${seconds}s`;
  }

  // Update determination progress
  function updateDeterminationProgress(percentage) {
    elements.determinationBar.style.width = `${percentage}%`;
  }
  
  // Display content in response area
  function displayResponse(content) {
    if (!window.DocumentReviewer || !window.DocumentReviewer.Helpers) {
      elements.responseContent.innerHTML = content;
      return;
    }
    elements.responseContent.innerHTML = window.DocumentReviewer.Helpers.formatForDisplay(content);
  }

  // Ensure DocumentReviewer exists
  if (!window.DocumentReviewer) window.DocumentReviewer = {};

  // Export to namespace
  window.DocumentReviewer.UI = {
    elements,
    addMessage,
    addSystemMessage,
    addAIMessage,
    addUserMessage,
    updateDebugInfo,
    updateDocumentStatus,
    clearDocumentContent,
    showDocumentView,
    showDocumentsList,
    updatePlaceholder,
    getTemperature,
    updateTemperatureDisplay,
    updateDeterminationDisplay,
    updateComplexityDisplay,
    updateConfidenceDisplay,
    renderMetaProcessStages,
    updateMetaStage,
    setMetaProcessDefinition,
    getUserInput,
    clearUserInput,
    setProcessing,
    updateStats,
    updateProcessTime,
    updateDeterminationProgress,
    displayResponse
  };
})();
