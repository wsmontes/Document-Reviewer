/**
 * Configuration settings for the Document Reviewer application
 */
(function() {
  // Default configuration
  let config = {
    API_ENDPOINT: 'http://localhost:1234',
    MODEL_NAME: 'google/gemma-3-4b',
    SEGMENTATION_THRESHOLD: 6000, // Character count threshold for segmentation
    MAX_ITERATIONS: 5, // Maximum iterations for determination
    TOKEN_ESTIMATION_RATIO: 4, // Ratio of characters to tokens (estimate)
    MAX_TOKENS_PER_REQUEST: 2048, // Maximum tokens to request from LLM
    SUPPORTED_FILE_TYPES: {
      'pdf': 'application/pdf',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'doc': 'application/msword',
      'epub': 'application/epub+zip',
      'txt': 'text/plain',
      'json': 'application/json',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'xls': 'application/vnd.ms-excel',
      'csv': 'text/csv',
      'zip': 'application/zip'
    },
    DEFAULT_TEMPERATURE: 0.7,
    DEFAULT_DETERMINATION: 3,
    VERSION: '1.0.0'
  };

  // Load saved configuration from localStorage
  const loadSavedConfig = () => {
    try {
      // Try to load the entire saved config
      const savedConfig = localStorage.getItem('document_reviewer_config');
      if (savedConfig) {
        const parsedConfig = JSON.parse(savedConfig);
        // Merge saved config with defaults (keeping defaults for any missing properties)
        config = { ...config, ...parsedConfig };
        return;
      }
      
      // Fall back to individual keys if full config isn't available
      const savedEndpoint = localStorage.getItem('api_endpoint');
      const savedModel = localStorage.getItem('api_model');
      
      if (savedEndpoint) config.API_ENDPOINT = savedEndpoint;
      if (savedModel) config.MODEL_NAME = savedModel;
    } catch (error) {
      console.error("Error loading saved configuration:", error);
      // Continue with default config if loading fails
    }
  };

  // Save configuration to localStorage
  const saveConfig = (newConfig = {}) => {
    try {
      // Update the config with new values
      if (newConfig.API_ENDPOINT) config.API_ENDPOINT = newConfig.API_ENDPOINT;
      if (newConfig.MODEL_NAME) config.MODEL_NAME = newConfig.MODEL_NAME;
      
      // For backwards compatibility
      localStorage.setItem('api_endpoint', config.API_ENDPOINT);
      localStorage.setItem('api_model', config.MODEL_NAME);
      
      // Save the complete config as JSON
      localStorage.setItem('document_reviewer_config', JSON.stringify({
        API_ENDPOINT: config.API_ENDPOINT,
        MODEL_NAME: config.MODEL_NAME,
        // Only save user-configurable options
      }));
      
      return true;
    } catch (error) {
      console.error("Error saving configuration:", error);
      return false;
    }
  };

  // Get file type from extension
  const getFileTypeFromExtension = (filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    return config.SUPPORTED_FILE_TYPES[extension] || 'application/octet-stream';
  };

  // Check if a file type is supported
  const isSupportedFileType = (filename) => {
    const extension = filename.split('.').pop().toLowerCase();
    return !!config.SUPPORTED_FILE_TYPES[extension];
  };

  // Get all supported extensions as a string (for accept attribute)
  const getSupportedFileExtensions = () => {
    return Object.keys(config.SUPPORTED_FILE_TYPES).map(ext => `.${ext}`).join(',');
  };

  // Get readable string of supported file types
  const getSupportedFileTypesString = () => {
    return Object.keys(config.SUPPORTED_FILE_TYPES).join(', ').toUpperCase();
  };

  // Initialize
  loadSavedConfig();

  // Ensure DocumentReviewer exists
  if (!window.DocumentReviewer) window.DocumentReviewer = {};

  // Export to namespace
  window.DocumentReviewer.Config = {
    get: (key) => config[key],
    getAll: () => ({...config}),
    save: saveConfig,
    getFileTypeFromExtension,
    isSupportedFileType,
    getSupportedFileExtensions,
    getSupportedFileTypesString
  };

  // For backwards compatibility
  window.API_ENDPOINT = config.API_ENDPOINT;
  window.MODEL_NAME = config.MODEL_NAME;
})();
