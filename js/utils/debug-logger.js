/**
 * Debug logger utility for diagnosing parsing issues
 */
(function() {
  // Store the last few problematic responses
  const responseLog = [];
  const MAX_LOGGED_RESPONSES = 5;
  
  // Log a problematic API response
  function logResponse(response, context) {
    // Add to the log with timestamp
    const entry = {
      timestamp: new Date().toISOString(),
      context: context || 'API Response',
      response: response,
      truncated: response.length > 500 ? response.substring(0, 500) + '...' : false
    };
    
    responseLog.unshift(entry); // Add to beginning
    
    // Keep only the last MAX_LOGGED_RESPONSES entries
    if (responseLog.length > MAX_LOGGED_RESPONSES) {
      responseLog.pop();
    }
    
    // Log to console for immediate inspection
    console.group(`[DEBUG LOG] ${entry.context}`);
    console.log('Timestamp:', entry.timestamp);
    console.log('Response:', response);
    console.groupEnd();
    
    return entry;
  }
  
  // Get the response log
  function getResponseLog() {
    return responseLog;
  }
  
  // Clear the response log
  function clearResponseLog() {
    responseLog.length = 0;
    return true;
  }
  
  // Format a logged response for display in the debug panel
  function formatLoggedResponseForDisplay(logEntry) {
    if (!logEntry) return '';
    
    return `
      <div class="debug-log-entry">
        <div class="debug-log-header">
          <span class="debug-log-context">${logEntry.context}</span>
          <span class="debug-log-timestamp">${new Date(logEntry.timestamp).toLocaleTimeString()}</span>
        </div>
        <div class="debug-log-content">
          <pre>${logEntry.truncated || logEntry.response}</pre>
          ${logEntry.truncated ? '<button class="debug-view-full">View Full</button>' : ''}
        </div>
      </div>
    `;
  }
  
  // Ensure DocumentReviewer exists
  if (!window.DocumentReviewer) window.DocumentReviewer = {};
  
  // Add to namespace
  window.DocumentReviewer.DebugLogger = {
    logResponse,
    getResponseLog,
    clearResponseLog,
    formatLoggedResponseForDisplay
  };
})();
