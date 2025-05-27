/**
 * Main application initialization and entry point
 */
(function() {
  // State variables
  let isProcessing = false;
  
  // Initialize application
  function init() {
    console.log(`Document Reviewer v${DocumentReviewer.Config.get('VERSION')} initializing...`);
    
    // Set up event listeners
    document.getElementById('input-area').addEventListener('submit', handleSubmit);
    document.getElementById('temperature').addEventListener('input', DocumentReviewer.UI.updateTemperatureDisplay);
    document.getElementById('determination').addEventListener('input', DocumentReviewer.UI.updateDeterminationDisplay);
    document.getElementById('pdf-upload').addEventListener('change', DocumentReviewer.DocumentProcessor.handleFileUpload);
    document.getElementById('toggle-document-btn').addEventListener('click', DocumentReviewer.DocumentProcessor.toggleDocumentView);
    
    // Add retry button event listener
    document.getElementById('retry-connection').addEventListener('click', () => DocumentReviewer.APIService.checkServerStatus());
    
    // Setup API configuration modal
    setupConfigModal();
    
    // Update temperature and determination displays
    DocumentReviewer.UI.updateTemperatureDisplay();
    DocumentReviewer.UI.updateDeterminationDisplay();
    
    // Check server status
    DocumentReviewer.APIService.checkServerStatus();
    
    // Add welcome message
    DocumentReviewer.UI.addSystemMessage('Welcome to the Document Reviewer! Upload a document and ask questions about it.');
    
    // Hide document view initially
    document.getElementById('document-view-container').style.display = 'none';
    
    // Set interval for server status check
    setInterval(() => DocumentReviewer.APIService.checkServerStatus(true), 60000);

    // Update status details
    document.getElementById('endpoint-url').textContent = DocumentReviewer.Config.get('API_ENDPOINT');
    document.getElementById('model-name').textContent = DocumentReviewer.Config.get('MODEL_NAME');
    
    // Update file input "accept" attribute to match supported file types
    document.getElementById('pdf-upload').setAttribute('accept', DocumentReviewer.Config.getSupportedFileExtensions());
    
    // Initialize the modular components that need initialization
    if (DocumentReviewer.Segmentation && DocumentReviewer.Segmentation.init) {
      DocumentReviewer.Segmentation.init();
    }
    
    console.log('Document Reviewer initialized successfully');
  }

  // Set up configuration modal
  function setupConfigModal() {
    const configureApiBtn = document.getElementById('configure-api-btn');
    const apiConfigModal = document.getElementById('api-config-modal');
    const closeBtn = document.querySelector('.close-btn');
    const apiConfigForm = document.getElementById('api-config-form');
    const apiEndpointInput = document.getElementById('api-endpoint');
    const apiModelInput = document.getElementById('api-model');
    
    // Set input values to current settings
    apiEndpointInput.value = DocumentReviewer.Config.get('API_ENDPOINT');
    apiModelInput.value = DocumentReviewer.Config.get('MODEL_NAME');
    
    // Open modal when configure button is clicked
    configureApiBtn.addEventListener('click', (e) => {
      e.preventDefault();
      apiConfigModal.style.display = 'block';
    });
    
    // Close modal when X is clicked
    closeBtn.addEventListener('click', () => {
      apiConfigModal.style.display = 'none';
    });
    
    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
      if (e.target === apiConfigModal) {
        apiConfigModal.style.display = 'none';
      }
    });
    
    // Handle form submission
    apiConfigForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Get new values
      const newEndpoint = apiEndpointInput.value.trim();
      const newModel = apiModelInput.value.trim();
      
      // Validate input
      if (!newEndpoint) {
        alert('API Endpoint is required');
        return;
      }
      
      // Update configuration
      DocumentReviewer.Config.save({
        API_ENDPOINT: newEndpoint,
        MODEL_NAME: newModel
      });
      
      // Update global variables for backward compatibility
      API_ENDPOINT = newEndpoint;
      MODEL_NAME = newModel;
      
      // Update UI
      document.getElementById('endpoint-url').textContent = newEndpoint;
      document.getElementById('model-name').textContent = newModel;
      
      // Close modal
      apiConfigModal.style.display = 'none';
      
      // Check server status with new configuration
      DocumentReviewer.APIService.checkServerStatus();
      
      // Log to debug
      DocumentReviewer.UI.updateDebugInfo(`API Configuration updated - Endpoint: ${newEndpoint}, Model: ${newModel}`);
    });
  }

  // Handle form submission
  async function handleSubmit(e) {
    e.preventDefault();
    const query = DocumentReviewer.UI.getUserInput().trim();
    
    // Modified: Allow empty submissions when documents are loaded
    // Check if document is loaded
    if (!DocumentReviewer.DocumentProcessor.getCurrentDocument().hasDocument) {
      DocumentReviewer.UI.addSystemMessage('Please upload at least one document first before asking questions.');
      return;
    }

    // If processing is already happening, prevent submission
    if (isProcessing) return;
    
    // If query is empty, use a default prompt to analyze the document
    const finalQuery = query || "Please analyze this document and provide a comprehensive summary.";
    
    // Add user message to chat - show what was submitted
    DocumentReviewer.UI.addUserMessage(query || "(Document Analysis)");
    DocumentReviewer.UI.clearUserInput();
    
    // Start processing
    isProcessing = true;
    DocumentReviewer.UI.setProcessing(true);
    
    // Check server status before proceeding
    if (!await DocumentReviewer.APIService.checkServerStatus(true)) {
      DocumentReviewer.UI.addSystemMessage('Error: Cannot connect to the LLM server. Please check your connection and try again.');
      isProcessing = false;
      DocumentReviewer.UI.setProcessing(false);
      return;
    }
    
    try {
      // Verify that MetaEngine exists before calling processQuery
      if (!DocumentReviewer.MetaEngine || typeof DocumentReviewer.MetaEngine.processQuery !== 'function') {
        throw new Error('MetaEngine or processQuery function is not available');
      }
      
      // Process the query using the meta-prompt engine, with the final query (original or default)
      await DocumentReviewer.MetaEngine.processQuery(finalQuery);
    } catch (error) {
      console.error('Error during processing:', error);
      DocumentReviewer.UI.addSystemMessage(`Error: ${error.message || 'An error occurred during processing'}`);
      DocumentReviewer.UI.updateDebugInfo(`Error: ${error.message || 'Unknown error'}`);
    }
    
    // Reset processing state
    isProcessing = false;
    DocumentReviewer.UI.setProcessing(false);
  }

  // Ensure DocumentReviewer exists
  if (!window.DocumentReviewer) window.DocumentReviewer = {};

  // Export to namespace
  window.DocumentReviewer.App = {
    init,
    handleSubmit
  };

  // Initialize the application when DOM is loaded
  document.addEventListener('DOMContentLoaded', function() {
    if (window.DocumentReviewer && window.DocumentReviewer.App) {
      window.DocumentReviewer.App.init();
    }
  });
})();
