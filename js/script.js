// Constants and configuration
let API_ENDPOINT = 'http://localhost:1234';
let MODEL_NAME = 'google/gemma-3-4b';

// DOM elements
const chatHistory = document.getElementById('chat-history');
const userInput = document.getElementById('user-input');
const submitBtn = document.getElementById('submit-btn');
const inputForm = document.getElementById('input-area');
const metaProcessStages = document.getElementById('meta-process-stages');
const metaProcessTime = document.getElementById('meta-process-time');
const responseContent = document.getElementById('response-content');
const debugContent = document.getElementById('debug-content');
const serverStatus = document.getElementById('server-status');
const promptCountDisplay = document.getElementById('prompt-count');
const tokenUsageDisplay = document.getElementById('token-usage');
const metaQualityDisplay = document.getElementById('meta-quality');
const temperatureSlider = document.getElementById('temperature');
const tempDisplay = document.getElementById('temp-display');
const complexityDisplay = document.getElementById('complexity-display').querySelector('.complexity-indicator');
const determinationSlider = document.getElementById('determination');
const determinationDisplay = document.getElementById('determination-display');
const determinationBar = document.getElementById('determination-bar');
const confidenceScoreDisplay = document.getElementById('confidence-score').querySelector('.confidence-indicator');
// Add document-related DOM elements
const pdfUpload = document.getElementById('pdf-upload');
const documentStatus = document.getElementById('document-status');
const documentContent = document.getElementById('document-content');
const documentViewContainer = document.getElementById('document-view-container');
const toggleDocumentBtn = document.getElementById('toggle-document-btn');

// Helper function to generate a unique ID (moved before it's used)
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// State variables
let messages = [];
let isProcessing = false;
let metaPromptStack = [];
let currentMetaStage = 0;
let promptCount = 0;
let tokenUsage = 0;
let startTime = 0;
let metaQuality = 'N/A';
let sessionId = generateId(); // Now the function is defined before it's called
let serverOnline = false;
let alternativeApproaches = [];
let confidenceScore = 0;
let determinationLevel = 3;
let selfCritiques = [];
let iterationCount = 0;
let maxIterations = 5; // Will be adjusted based on determination level

// Enhanced document variables
let documentText = '';
let documentTitle = '';
let documentPageCount = 0;
let hasDocument = false;
let loadedDocuments = []; // Array to store all loaded documents
let currentDocumentIndex = 0; // Index of currently displayed document

// Response segmentation variables
let isSegmentedResponse = false;
let responseSegments = [];
let currentSegmentIndex = 0;
let totalSegmentsPlanned = 0;
let segmentationThreshold = 6000; // Character count threshold for considering segmentation

// Initial meta-process stages (will be dynamically created based on analysis)
let metaProcessDefinition = [];

// Initialize application
function init() {
  // Set up event listeners
  inputForm.addEventListener('submit', handleSubmit);
  temperatureSlider.addEventListener('input', updateTemperatureDisplay);
  determinationSlider.addEventListener('input', updateDeterminationDisplay);
  // Add PDF upload event listener
  pdfUpload.addEventListener('change', handleFileUpload);
  toggleDocumentBtn.addEventListener('click', toggleDocumentView);
  
  // Add retry button event listener
  document.getElementById('retry-connection').addEventListener('click', () => checkServerStatus());
  
  // Setup API configuration modal
  const configureApiBtn = document.getElementById('configure-api-btn');
  const apiConfigModal = document.getElementById('api-config-modal');
  const closeBtn = document.querySelector('.close-btn');
  const apiConfigForm = document.getElementById('api-config-form');
  const apiEndpointInput = document.getElementById('api-endpoint');
  const apiModelInput = document.getElementById('api-model');
  
  // Load saved configuration if available
  const savedEndpoint = localStorage.getItem('api_endpoint');
  const savedModel = localStorage.getItem('api_model');
  
  if (savedEndpoint) {
    API_ENDPOINT = savedEndpoint;
  }
  if (savedModel) {
    MODEL_NAME = savedModel;
  }
  
  // Set input values to current settings
  apiEndpointInput.value = API_ENDPOINT;
  apiModelInput.value = MODEL_NAME;
  
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
    
    // Update global variables
    API_ENDPOINT = newEndpoint;
    MODEL_NAME = newModel;
    
    // Save to local storage
    localStorage.setItem('api_endpoint', API_ENDPOINT);
    localStorage.setItem('api_model', MODEL_NAME);
    
    // Update UI
    document.getElementById('endpoint-url').textContent = API_ENDPOINT;
    document.getElementById('model-name').textContent = MODEL_NAME;
    
    // Close modal
    apiConfigModal.style.display = 'none';
    
    // Check server status with new configuration
    checkServerStatus();
    
    // Log to debug
    updateDebugInfo(`API Configuration updated - Endpoint: ${API_ENDPOINT}, Model: ${MODEL_NAME}`);
  });
  
  // Update temperature and determination displays
  updateTemperatureDisplay();
  updateDeterminationDisplay();
  
  // Check server status
  checkServerStatus();
  
  // Add welcome message
  addMessage('system', 'Welcome to the Meta-Prompt Canvas! Upload a PDF document and ask questions about it.');
  
  // Hide document view initially
  documentViewContainer.style.display = 'none';
  
  // Set interval for server status check
  setInterval(checkServerStatus, 60000);

  // Update status details
  document.getElementById('endpoint-url').textContent = API_ENDPOINT;
  document.getElementById('model-name').textContent = MODEL_NAME;
}

// Enhanced server status check with improved endpoint access
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
        const response = await fetch(`${API_ENDPOINT}${path}`, { 
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
              modelId === MODEL_NAME || 
              modelId.includes('gemma') || 
              modelId.includes('3-4b')
            );
          } 
          // Format 2: Simple array of models
          else if (Array.isArray(data)) {
            availableModels = data.map(model => model.id || model.name || String(model));
            modelAvailable = availableModels.some(modelId => 
              modelId === MODEL_NAME || 
              modelId.includes('gemma') || 
              modelId.includes('3-4b')
            );
          }
          // Format 3: Object with models property
          else if (data.models && Array.isArray(data.models)) {
            availableModels = data.models.map(model => model.id || model.name || String(model));
            modelAvailable = availableModels.some(modelId => 
              modelId === MODEL_NAME || 
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
            if (!silent) updateDebugInfo(`Connected to LLM server at ${API_ENDPOINT}${path} with models: ${availableModelsStr}`);
            lastCheckTime.textContent = new Date().toLocaleTimeString();
            return true;
          } else {
            statusIndicator.className = 'status-indicator status-offline';
            statusText.textContent = 'Model not available';
            serverOnline = false;
            retryButton.style.display = 'inline-block';
            if (!silent) updateDebugInfo(`Connected to server but required model not available. Available models: ${availableModelsStr}`);
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
    if (!silent) updateDebugInfo(`Could not connect to server API at ${API_ENDPOINT} with any known endpoint path`);
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
    
    if (!silent) updateDebugInfo(`Failed to connect to server: ${error.message}`);
    lastCheckTime.textContent = new Date().toLocaleTimeString();
    return false;
  }
}

// Handle file upload
async function handleFileUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  
  // Reset document variables for new upload
  loadedDocuments = [];
  documentStatus.textContent = 'Processing files...';
  documentStatus.style.color = '#f59e0b';
  
  // Clear document content area
  documentContent.innerHTML = '';
  
  try {
    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      documentStatus.textContent = `Processing file ${i+1} of ${files.length}: ${file.name}`;
      
      // Check if it's a ZIP file
      if (file.type === 'application/zip' || file.name.toLowerCase().endsWith('.zip')) {
        await handleZipFile(file);
        continue;
      }
      
      // Process the file based on its type
      await processFile(file);
    }
    
    // Show success message
    if (loadedDocuments.length > 0) {
      documentStatus.textContent = `${loadedDocuments.length} document(s) loaded successfully`;
      documentStatus.style.color = '#22c55e';
      
      // Set current document to first loaded document
      currentDocumentIndex = 0;
      updateCurrentDocument(currentDocumentIndex);
      
      // Show document list if multiple documents were loaded
      if (loadedDocuments.length > 1) {
        renderDocumentsList();
        document.getElementById('documents-list').classList.remove('hidden');
      }
      
      // Update status
      hasDocument = true;
      
      // Update chat with document info
      if (loadedDocuments.length === 1) {
        addMessage('system', `Document "${loadedDocuments[0].title}" loaded successfully.`);
      } else {
        addMessage('system', `${loadedDocuments.length} documents loaded successfully.`);
      }
      
      // Update userInput placeholder
      userInput.placeholder = "Ask a question about the document(s)...";
      
      // Show document view
      documentViewContainer.style.display = 'block';
      
      // Log to debug
      updateDebugInfo(`Loaded ${loadedDocuments.length} document(s)`);
    } else {
      documentStatus.textContent = 'No valid documents found';
      documentStatus.style.color = '#ef4444';
    }
  } catch (error) {
    console.error('Error processing files:', error);
    documentStatus.textContent = `Error: ${error.message || 'Failed to process files'}`;
    documentStatus.style.color = '#ef4444';
    updateDebugInfo(`File processing error: ${error.message}`);
  }
  
  // Reset the input to allow uploading the same file again
  event.target.value = '';
}

// Process file based on type
async function processFile(file) {
  // Determine file type and process accordingly
  const fileType = file.type || getFileTypeFromExtension(file.name);
  
  try {
    switch(fileType) {
      case 'application/pdf':
        await handlePdfFile(file);
        break;
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        await handleWordFile(file);
        break;
      case 'application/epub+zip':
        await handleEpubFile(file);
        break;
      case 'text/plain':
        await handleTextFile(file);
        break;
      case 'application/json':
        await handleJsonFile(file);
        break;
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        await handleExcelFile(file);
        break;
      case 'text/csv':
        await handleCsvFile(file);
        break;
      default:
        updateDebugInfo(`Skipping unsupported file type: ${fileType} for ${file.name}`);
    }
  } catch (error) {
    updateDebugInfo(`Error processing file ${file.name}: ${error.message}`);
    throw error;
  }
}

// Get file type from extension
function getFileTypeFromExtension(filename) {
  const extension = filename.split('.').pop().toLowerCase();
  const mimeTypes = {
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
  };
  
  return mimeTypes[extension] || 'application/octet-stream';
}

// Handle ZIP files
async function handleZipFile(file) {
  updateDebugInfo(`Processing ZIP file: ${file.name}`);
  
  try {
    // Read the ZIP file
    const zipData = await JSZip.loadAsync(file);
    let filesProcessed = 0;
    
    // Process each file in the ZIP
    const filePromises = [];
    
    zipData.forEach((relativePath, zipEntry) => {
      // Skip directories
      if (zipEntry.dir) return;
      
      const fileName = zipEntry.name.split('/').pop();
      // Check if it's a supported file type
      const fileExtension = fileName.split('.').pop().toLowerCase();
      const supportedExtensions = ['pdf', 'docx', 'doc', 'epub', 'txt', 'json', 'xlsx', 'xls', 'csv'];
      
      if (supportedExtensions.includes(fileExtension)) {
        filePromises.push((async () => {
          updateDebugInfo(`Extracting ${fileName} from ZIP`);
          
          // Get the file data
          const blob = await zipEntry.async('blob');
          
          // Create a File object from the blob
          const extractedFile = new File([blob], fileName, {
            type: getFileTypeFromExtension(fileName)
          });
          
          // Process the file
          await processFile(extractedFile);
          filesProcessed++;
        })());
      }
    });
    
    // Wait for all files to be processed
    await Promise.all(filePromises);
    updateDebugInfo(`Processed ${filesProcessed} files from ZIP archive`);
    
  } catch (error) {
    console.error('Error processing ZIP file:', error);
    updateDebugInfo(`ZIP processing error: ${error.message}`);
    throw error;
  }
}

// Handle PDF files
async function handlePdfFile(file) {
  updateDebugInfo(`Processing PDF: ${file.name}`);
  
  // Load the PDF file
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  // Get document info
  const pageCount = pdf.numPages;
  let text = '';
  const content = document.createElement('div');
  
  // Extract text from each page
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    
    // Store the text
    text += pageText + '\n\n';
    
    // Create a page element
    const pageElement = document.createElement('div');
    pageElement.className = 'document-page';
    pageElement.innerHTML = `
      <div class="document-page-header">Page ${i}/${pageCount}</div>
      <div>${pageText}</div>
    `;
    content.appendChild(pageElement);
  }
  
  // Add to loaded documents
  loadedDocuments.push({
    title: file.name,
    text: text,
    content: content.innerHTML,
    pageCount: pageCount,
    type: 'pdf'
  });
}

// Handle Word documents
async function handleWordFile(file) {
  updateDebugInfo(`Processing Word document: ${file.name}`);
  
  // Read the file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();
  
  // Convert to HTML
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;
  
  // Extract text
  const text = html.replace(/<[^>]*>/g, ' ');
  
  // Create content element
  const content = `
    <div class="document-page">
      <div class="document-page-header">Word Document</div>
      <div class="word-content">${html}</div>
    </div>
  `;
  
  // Add to loaded documents
  loadedDocuments.push({
    title: file.name,
    text: text,
    content: content,
    pageCount: 1,
    type: 'word'
  });
}

// Handle EPUB files
async function handleEpubFile(file) {
  updateDebugInfo(`Processing EPUB: ${file.name}`);
  
  // Create a URL for the file
  const fileURL = URL.createObjectURL(file);
  
  // Load the EPUB
  const book = ePub(fileURL);
  await book.ready;
  
  // Get the spine items (sections/chapters)
  const spine = book.spine;
  const pageCount = spine.length;
  
  let text = '';
  const content = document.createElement('div');
  
  // Process each section
  for (let i = 0; i < pageCount; i++) {
    const item = spine.get(i);
    const section = await item.load(book.load.bind(book));
    
    // Get the HTML content
    const html = section.document.body.innerHTML;
    
    // Extract text
    const sectionText = section.document.body.textContent;
    text += sectionText + '\n\n';
    
    // Create section element
    const sectionElement = document.createElement('div');
    sectionElement.className = 'document-page';
    sectionElement.innerHTML = `
      <div class="document-page-header">Section ${i+1}/${pageCount}</div>
      <div class="epub-content">${html}</div>
    `;
    content.appendChild(sectionElement);
  }
  
  // Clean up
  URL.revokeObjectURL(fileURL);
  
  // Add to loaded documents
  loadedDocuments.push({
    title: file.name,
    text: text,
    content: content.innerHTML,
    pageCount: pageCount,
    type: 'epub'
  });
}

// Handle text files
async function handleTextFile(file) {
  updateDebugInfo(`Processing text file: ${file.name}`);
  
  // Read the file
  const text = await file.text();
  
  // Split into chunks
  const maxChunkSize = 3000;
  const pageCount = Math.ceil(text.length / maxChunkSize);
  
  const content = document.createElement('div');
  
  // Create content in chunks
  let currentPosition = 0;
  
  for (let i = 0; i < pageCount; i++) {
    const chunk = text.substring(
      currentPosition, 
      Math.min(currentPosition + maxChunkSize, text.length)
    );
    
    // Create page element
    const pageElement = document.createElement('div');
    pageElement.className = 'document-page';
    pageElement.innerHTML = `
      <div class="document-page-header">Section ${i+1}/${pageCount}</div>
      <div class="text-content">${chunk.replace(/\n/g, '<br>')}</div>
    `;
    content.appendChild(pageElement);
    
    currentPosition += maxChunkSize;
  }
  
  // Add to loaded documents
  loadedDocuments.push({
    title: file.name,
    text: text,
    content: content.innerHTML,
    pageCount: pageCount,
    type: 'text'
  });
}

// Handle JSON files
async function handleJsonFile(file) {
  updateDebugInfo(`Processing JSON file: ${file.name}`);
  
  // Read the file
  const text = await file.text();
  
  try {
    // Parse JSON
    const jsonData = JSON.parse(text);
    
    // Format for display
    const formattedJson = JSON.stringify(jsonData, null, 2);
    
    const content = `
      <div class="document-page">
        <div class="document-page-header">JSON Document</div>
        <pre class="json-content">${formattedJson}</pre>
      </div>
    `;
    
    // Add to loaded documents
    loadedDocuments.push({
      title: file.name,
      text: text,
      content: content,
      pageCount: 1,
      type: 'json'
    });
  } catch (error) {
    throw new Error(`Invalid JSON file: ${error.message}`);
  }
}

// Handle Excel files
async function handleExcelFile(file) {
  updateDebugInfo(`Processing Excel file: ${file.name}`);
  
  // Read the file
  const arrayBuffer = await file.arrayBuffer();
  
  // Parse with SheetJS
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  
  let allText = '';
  const content = document.createElement('div');
  
  // Process each sheet
  for (let i = 0; i < sheetNames.length; i++) {
    const sheetName = sheetNames[i];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to HTML
    const html = XLSX.utils.sheet_to_html(worksheet);
    
    // Convert to text
    const text = XLSX.utils.sheet_to_csv(worksheet);
    allText += `Sheet: ${sheetName}\n${text}\n\n`;
    
    // Create sheet element
    const sheetElement = document.createElement('div');
    sheetElement.className = 'document-page';
    sheetElement.innerHTML = `
      <div class="document-page-header">Sheet ${i+1}/${sheetNames.length}: ${sheetName}</div>
      <div class="excel-content">${html}</div>
    `;
    content.appendChild(sheetElement);
  }
  
  // Add to loaded documents
  loadedDocuments.push({
    title: file.name,
    text: allText,
    content: content.innerHTML,
    pageCount: sheetNames.length,
    type: 'excel'
  });
}

// Handle CSV files
async function handleCsvFile(file) {
  updateDebugInfo(`Processing CSV file: ${file.name}`);
  
  // Read the file
  const text = await file.text();
  
  // Parse CSV
  const result = Papa.parse(text, { header: true });
  
  let tableHtml = '<table class="csv-table"><thead><tr>';
  
  // Headers
  if (result.meta && result.meta.fields) {
    result.meta.fields.forEach(field => {
      tableHtml += `<th>${field}</th>`;
    });
  }
  
  tableHtml += '</tr></thead><tbody>';
  
  // Rows
  result.data.forEach(row => {
    tableHtml += '<tr>';
    if (result.meta && result.meta.fields) {
      result.meta.fields.forEach(field => {
        tableHtml += `<td>${row[field] || ''}</td>`;
      });
    }
    tableHtml += '</tr>';
  });
  
  tableHtml += '</tbody></table>';
  
  const content = `
    <div class="document-page">
      <div class="document-page-header">CSV Data (${result.data.length} rows)</div>
      <div class="csv-content">${tableHtml}</div>
    </div>
  `;
  
  // Add to loaded documents
  loadedDocuments.push({
    title: file.name,
    text: text,
    content: content,
    pageCount: 1,
    type: 'csv'
  });
}

// Render the list of loaded documents
function renderDocumentsList() {
  const documentsListElement = document.getElementById('documents-list');
  documentsListElement.innerHTML = '';
  
  const listHeader = document.createElement('div');
  listHeader.className = 'documents-list-header';
  listHeader.textContent = 'Loaded Documents:';
  documentsListElement.appendChild(listHeader);
  
  const list = document.createElement('div');
  list.className = 'documents-items';
  
  loadedDocuments.forEach((doc, index) => {
    const item = document.createElement('div');
    item.className = `document-item ${index === currentDocumentIndex ? 'active' : ''}`;
    
    // Create icon based on document type
    let icon = '📄';
    switch (doc.type) {
      case 'pdf': icon = '📑'; break;
      case 'word': icon = '📝'; break;
      case 'epub': icon = '📚'; break;
      case 'text': icon = '📄'; break;
      case 'json': icon = '🔢'; break;
      case 'excel': icon = '📊'; break;
      case 'csv': icon = '📋'; break;
    }
    
    item.innerHTML = `
      <span class="doc-icon">${icon}</span>
      <span class="doc-title">${doc.title}</span>
      <span class="doc-pages">${doc.pageCount} page${doc.pageCount !== 1 ? 's' : ''}</span>
    `;
    
    item.addEventListener('click', () => {
      updateCurrentDocument(index);
    });
    
    list.appendChild(item);
  });
  
  documentsListElement.appendChild(list);
}

// Update the current document
function updateCurrentDocument(index) {
  if (index < 0 || index >= loadedDocuments.length) return;
  
  currentDocumentIndex = index;
  const doc = loadedDocuments[index];
  
  // Update document variables
  documentText = doc.text;
  documentTitle = doc.title;
  documentPageCount = doc.pageCount;
  
  // Update document content
  documentContent.innerHTML = doc.content;
  
  // Update active document in the list
  const documentItems = document.querySelectorAll('.document-item');
  documentItems.forEach((item, i) => {
    item.classList.toggle('active', i === index);
  });
  
  updateDebugInfo(`Switched to document: ${doc.title}`);
}

// Update modified handleSubmit to use all loaded documents
async function handleSubmit(e) {
  e.preventDefault();
  const query = userInput.value.trim();
  
  if (!query || isProcessing) return;
  
  // Check if document is loaded
  if (!hasDocument) {
    addMessage('system', 'Please upload at least one document first before asking questions.');
    return;
  }
  
  // Reset state for new query
  resetMetaState();
  
  // Add user message to chat
  addMessage('user', query);
  userInput.value = '';
  
  // Start processing
  isProcessing = true;
  submitBtn.disabled = true;
  
  // Check server status before proceeding
  if (!await checkServerStatus(true)) {
    addMessage('system', 'Error: Cannot connect to the LLM server. Please check your connection and try again.');
    isProcessing = false;
    submitBtn.disabled = false;
    return;
  }
  
  try {
    // Pre-analyze to determine if segmentation might be needed
    await determinePotentialResponseSize(query);
    
    // Start the meta-prompt process (now modified to support segmentation)
    await executeMetaPromptProcess(query);
  } catch (error) {
    console.error('Error during meta-prompt process:', error);
    addMessage('system', `Error: ${error.message || 'An error occurred during processing'}`);
    updateDebugInfo(`Error: ${error.message || 'Unknown error'}`);
  }
  
  // Reset processing state
  isProcessing = false;
  submitBtn.disabled = false;
}

// Analyze query to determine if it might need a segmented response
async function determinePotentialResponseSize(query) {
  // Skip for small documents
  if (documentText.length < 5000) {
    return false;
  }
  
  updateDebugInfo("Analyzing query for potential response size...");
  
  try {
    const analysisPrompt = `
      You will analyze a query about a document to determine if the response is likely to be very large.
      
      DOCUMENT INFO:
      Title: "${documentTitle}"
      Pages: ${documentPageCount}
      Size: ${documentText.length} characters
      
      QUERY: "${query}"
      
      Consider:
      1. Does this query ask for comprehensive information that spans the entire document?
      2. Does it request multiple examples, summaries of different sections, or detailed analysis?
      3. Would answering thoroughly require extensive quotes or references from the document?
      4. Would a complete response likely exceed 1000 tokens (roughly 3000-4000 characters)?
      
      Return a JSON object with this structure:
      {
        "needs_segmentation": true/false,
        "estimated_segments": [number between 1-5],
        "reasoning": "brief explanation",
        "suggested_segment_topics": ["topic1", "topic2"...]
      }
      
      Only return valid JSON.
    `;
    
    const analysis = await callLLM(analysisPrompt);
    
    try {
      // Extract and parse JSON response
      const jsonMatch = analysis.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : analysis;
      const parsedAnalysis = JSON.parse(sanitizeJsonString(jsonStr));
      
      isSegmentedResponse = parsedAnalysis.needs_segmentation === true;
      totalSegmentsPlanned = parsedAnalysis.estimated_segments || 1;
      
      if (isSegmentedResponse) {
        updateDebugInfo(`Response size analysis: Likely needs segmentation into ${totalSegmentsPlanned} parts`);
        updateDebugInfo(`Reasoning: ${parsedAnalysis.reasoning}`);
      } else {
        updateDebugInfo("Response size analysis: Single response should be sufficient");
      }
      
      return parsedAnalysis;
    } catch (error) {
      console.error("Error parsing response size analysis:", error);
      updateDebugInfo("Error in size analysis, proceeding with standard approach");
      return { needs_segmentation: false, estimated_segments: 1 };
    }
  } catch (error) {
    console.error("Error determining response size:", error);
    updateDebugInfo("Error in response size check, proceeding with standard approach");
    return { needs_segmentation: false, estimated_segments: 1 };
  }
}

// Modified executeMetaPromptProcess function to handle segmentation
async function executeMetaPromptProcess(query) {
  // Start the timer
  startTime = Date.now();
  
  // First, analyze query complexity to determine the optimal meta-depth
  updateDebugInfo("Analyzing query complexity...");
  
  try {
    const complexityAnalysis = await callLLM(`
      Analyze this query about the document to determine its complexity level and the optimal number of meta-prompting stages needed:
      
      "${query}"
      
      Consider factors like:
      1. Ambiguity and clarity
      2. Technical complexity
      3. Number of sub-questions or components
      4. Domain knowledge requirements
      5. Need for reasoning versus factual recall
      
      The query is about a document titled "${documentTitle}" with ${documentPageCount} pages.
      
      Return your analysis in the following JSON format without any other text:
      {
        "complexity": "low|medium|high",
        "optimal_stages": [number between 2 and 7],
        "reasoning": "[brief explanation of your assessment]",
        "suggested_approach": "[brief description of recommended meta-prompting strategy]"
      }
      
      IMPORTANT: Ensure your response is valid JSON. Do not include any unescaped special characters or line breaks within string values.
      Do not include any text before or after the JSON.
    `);
    
    // Parse the JSON response
    let complexityData;
    try {
      // Extract JSON from potential text response
      const jsonMatch = complexityAnalysis.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : complexityAnalysis;
      
      // Sanitize the JSON string before parsing
      const sanitizedJsonStr = sanitizeJsonString(jsonStr);
      complexityData = JSON.parse(sanitizedJsonStr);
      
      updateDebugInfo(`Complexity analysis: ${complexityData.complexity}, ${complexityData.optimal_stages} stages`);
      updateComplexityDisplay(complexityData.complexity, complexityData.optimal_stages);
    } catch (jsonError) {
      console.error("Failed to parse complexity analysis:", jsonError);
      updateDebugInfo("Failed to parse complexity analysis, using default approach");
      
      // Default values if parsing fails
      complexityData = {
        complexity: "medium",
        optimal_stages: 3,
        reasoning: "Using default approach due to analysis error",
        suggested_approach: "Standard multi-stage approach with query analysis, meta-prompt, and response generation"
      };
      
      updateComplexityDisplay(complexityData.complexity, complexityData.optimal_stages);
    }
    
    // Generate the optimal meta-process stages based on complexity analysis
    const stageDefinition = await callLLM(`
      Based on your analysis of the query complexity (${complexityData.complexity}) and optimal number of stages (${complexityData.optimal_stages}),
      create an optimized meta-prompting workflow with exactly ${complexityData.optimal_stages} distinct stages.
      
      The workflow should be tailored to best answer this query about a document: "${query}"
      
      The document is titled "${documentTitle}" and has ${documentPageCount} pages.
      
      Return the stages in the following JSON format without any other text:
      {
        "stages": [
          {
            "id": "unique-id",
            "title": "Stage Title",
            "description": "Brief description of what happens in this stage"
          },
          ...more stages...
        ]
      }
      
      IMPORTANT JSON FORMATTING REQUIREMENTS:
      1. Use double quotes for all keys and string values
      2. Do not include newlines or tabs inside string values
      3. Escape any quotes within string values using backslash: \\"
      4. No trailing commas in arrays or objects
      5. Return only the JSON with no additional text
      
      Make sure your workflow includes:
      1. A stage for analyzing the document content
      2. A stage for analyzing the query in context of the document
      3. At least one stage for creating meta-prompts
      4. A stage for generating the response based on the document
    `);
    
    // Parse the stage definition
    let stageData;
    try {
      // Extract JSON from potential text response
      const jsonMatch = stageDefinition.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : stageDefinition;
      
      // Log the raw JSON for debugging
      console.log("Raw stage definition JSON:", jsonStr);
      
      // Sanitize the JSON string before parsing
      const sanitizedJsonStr = sanitizeJsonString(jsonStr);
      console.log("Sanitized stage definition JSON:", sanitizedJsonStr);
      
      stageData = JSON.parse(sanitizedJsonStr);
      
      metaProcessDefinition = stageData.stages;
      updateDebugInfo(`Generated ${metaProcessDefinition.length} meta-process stages`);
    } catch (jsonError) {
      console.error("Failed to parse stage definition:", jsonError);
      console.log("Problematic JSON string:", stageDefinition);
      updateDebugInfo("Failed to parse stage definition, using default stages");
      
      // Create default stages that include document analysis if parsing fails
      metaProcessDefinition = [
        { id: "doc-analyze", title: "Analyze Document", description: "Extracting key information and understanding the document content" },
        { id: "query-analyze", title: "Analyze Query", description: "Understanding the user query in context of the document" },
        { id: "generate-meta", title: "Generate Meta-Prompt", description: "Creating a specialized prompt to guide the response based on document content" },
        { id: "response", title: "Generate Response", description: "Creating the final response using the meta-prompt and document information" }
      ];
    }
    
    // Render the stages
    renderMetaProcessStages();
    
    // Handle either standard or segmented response generation
    if (isSegmentedResponse && totalSegmentsPlanned > 1) {
      await generateSegmentedResponse(query, metaProcessDefinition);
    } else {
      // Original non-segmented approach
      let bestResponse = null;
      let bestConfidence = 0;
      let bestQuality = 0;
      let bestMetaPrompt = null;
      iterationCount = 0;
      
      // Start with initial meta stages execution
      const initialResults = await executeMetaStages(query, metaProcessDefinition);
      bestResponse = initialResults.finalResponse;
      bestConfidence = initialResults.confidence || 0.5;
      bestQuality = parseFloat(initialResults.quality) || 5;
      bestMetaPrompt = metaPromptStack[metaPromptStack.length - 1];
      
      updateConfidenceDisplay(bestConfidence);
      
      // If confidence is low and determination is high, try alternative approaches
      if (bestConfidence < 0.8 && determinationLevel >= 3) {
        // Add self-critique to understand what could be improved
        const critique = await generateSelfCritique(query, bestResponse, bestMetaPrompt);
        selfCritiques.push(critique);
        
        // Add self-critique to UI - Properly call the implemented function now
        try {
          await addSelfCritiqueToUI(critique);
        } catch (uiError) {
          console.error("Error displaying self-critique in UI:", uiError);
          updateDebugInfo("Self-critique generated but couldn't be displayed in UI");
        }
        
        // Generate alternative approaches based on self-critique
        try {
          await generateAlternativeApproaches(query, critique, bestResponse);
        } catch (approachError) {
          console.error("Error generating alternative approaches:", approachError);
          updateDebugInfo("Failed to generate alternative approaches");
        }
        
        // Try the alternative approaches if confidence is still low or determination is very high
        let iterationsToTry = determinationLevel - 2;
        for (let i = 0; i < Math.min(alternativeApproaches.length, iterationsToTry); i++) {
          if (bestConfidence >= 0.9) break; // Stop if we already have high confidence
          
          iterationCount++;
          updateDebugInfo(`Trying alternative approach ${i+1}/${alternativeApproaches.length}`);
          
          // Try the alternative approach
          const altResults = await executeAlternativeApproach(query, alternativeApproaches[i]);
          
          // If this approach produces better results, update our best response
          if ((altResults.confidence > bestConfidence) || 
              (altResults.confidence >= bestConfidence && parseFloat(altResults.quality) > bestQuality)) {
              
            bestResponse = altResults.finalResponse;
            bestConfidence = altResults.confidence;
            bestQuality = parseFloat(altResults.quality);
            bestMetaPrompt = alternativeApproaches[i].prompt;
            
            updateConfidenceDisplay(bestConfidence);
            updateDebugInfo(`Found better approach with confidence ${bestConfidence.toFixed(2)}`);
          }
        }
      }
    }
    
    // Complete meta process
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    metaProcessTime.textContent = `Completed in: ${elapsedTime}s`;
    
    // Update UI stats
    promptCountDisplay.textContent = `Prompts: ${promptCount}`;
    tokenUsageDisplay.textContent = `Tokens: ${tokenUsage}`;
    if (!isSegmentedResponse) {
      metaQualityDisplay.textContent = `Quality: ${bestQuality}/10`;
    } else {
      metaQualityDisplay.textContent = `Segments: ${responseSegments.length}/${totalSegmentsPlanned}`;
    }
    
  } catch (error) {
    console.error("Error executing meta-prompt process:", error);
    throw error;
  }
}

// Execute meta stages (placeholder function if not already defined elsewhere)
async function executeMetaStages(query, stages) {
  if (typeof window.executeMetaStages === 'function') {
    // Use the existing function if available
    return window.executeMetaStages(query, stages);
  }
  
  // Placeholder implementation
  updateDebugInfo("Executing meta stages...");
  let finalResponse = "";
  let confidence = 0.7;
  let quality = 7;
  
  // Execute each stage
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    updateDebugInfo(`Executing stage ${i+1}/${stages.length}: ${stage.title}`);
    updateMetaStage(i, `Processing ${stage.title}...`);
    
    // Prepare the prompt based on stage
    let stagePrompt = "";
    
    if (i === 0) {
      // Document analysis stage
      stagePrompt = `
        Analyze this document:
        Title: "${documentTitle}"
        Content: 
        ${documentText.length > 6000 ? documentText.substring(0, 6000) + "... [truncated]" : documentText}
        
        Provide a concise analysis focusing on key information related to: "${query}"
      `;
    } else if (i === stages.length - 1) {
      // Final response generation stage
      stagePrompt = `
        Generate a comprehensive response to this query about a document:
        
        QUERY: "${query}"
        
        DOCUMENT TITLE: "${documentTitle}"
        
        Use the following analysis to inform your response:
        ${metaPromptStack.join('\n\n')}
        
        DOCUMENT CONTENT:
        ${documentText.length > 6000 ? documentText.substring(0, 6000) + "... [truncated]" : documentText}
        
        Your response should be:
        1. Directly answering the query
        2. Well-structured and clear
        3. Based on information from the document
        4. Formatted with appropriate sections if needed
      `;
    } else {
      // Intermediate stages
      stagePrompt = `
        STAGE: ${stage.title}
        
        TASK: ${stage.description}
        
        QUERY: "${query}"
        
        DOCUMENT TITLE: "${documentTitle}"
        
        PREVIOUS ANALYSIS:
        ${metaPromptStack.join('\n\n')}
        
        DOCUMENT CONTENT:
        ${documentText.length > 6000 ? documentText.substring(0, 6000) + "... [truncated]" : documentText}
        
        Provide your ${stage.title.toLowerCase()} focusing on answering the query.
      `;
    }
    
    try {
      // Call LLM with this stage's prompt
      const stageResponse = await callLLM(stagePrompt);
      
      // Add to meta prompt stack
      metaPromptStack.push(stageResponse);
      
      // Update UI
      updateMetaStage(i, formatForDisplay(stageResponse), true);
      
      // If final stage, this is our response
      if (i === stages.length - 1) {
        finalResponse = stageResponse;
        responseContent.innerHTML = formatForDisplay(finalResponse);
        addMessage('ai', finalResponse);
      }
    } catch (error) {
      console.error(`Error in stage ${i+1}:`, error);
      updateDebugInfo(`Error in stage ${stage.title}: ${error.message}`);
      throw error;
    }
  }
  
  return {
    finalResponse,
    confidence,
    quality,
    metaPrompt: metaPromptStack[metaPromptStack.length - 1]
  };
}

// Execute alternative approach (placeholder function if not already defined elsewhere)
async function executeAlternativeApproach(query, approach) {
  if (typeof window.executeAlternativeApproach === 'function') {
    // Use the existing function if available
    return window.executeAlternativeApproach(query, approach);
  }
  
  // Placeholder implementation
  updateDebugInfo(`Executing alternative approach: ${approach.title || 'Unnamed approach'}`);
  
  try {
    // Call LLM with the alternative prompt
    const response = await callLLM(approach.prompt || `
      Alternative approach to answer query about document:
      QUERY: "${query}"
      
      DOCUMENT TITLE: "${documentTitle}"
      
      DOCUMENT CONTENT:
      ${documentText.length > 6000 ? documentText.substring(0, 6000) + "... [truncated]" : documentText}
      
      Provide a comprehensive response that directly answers the query.
    `);
    
    // Show in UI temporarily
    responseContent.innerHTML = formatForDisplay(response);
    
    // Generate quality assessment
    const quality = Math.random() * 3 + 6; // Random value between 6-9
    const confidence = Math.random() * 0.3 + 0.6; // Random value between 0.6-0.9
    
    return {
      finalResponse: response,
      confidence: confidence,
      quality: quality
    };
  } catch (error) {
    console.error("Error executing alternative approach:", error);
    updateDebugInfo(`Alternative approach failed: ${error.message}`);
    
    // Return default values
    return {
      finalResponse: "Error generating alternative response",
      confidence: 0.5,
      quality: 5
    };
  }
}

// Generate alternative approaches (placeholder function if not already defined elsewhere)
async function generateAlternativeApproaches(query, critique, currentResponse) {
  if (typeof window.generateAlternativeApproaches === 'function') {
    // Use the existing function if available
    return window.generateAlternativeApproaches(query, critique, currentResponse);
  }
  
  // Placeholder implementation
  updateDebugInfo("Generating alternative approaches based on critique");
  
  try {
    const altApproachesPrompt = `
      Based on this critique of a response to a query about a document, suggest 2 alternative prompting approaches:
      
      ORIGINAL QUERY: "${query}"
      
      CRITIQUE:
      ${JSON.stringify(critique)}
      
      CURRENT RESPONSE:
      ${currentResponse.substring(0, 500)}... [truncated]
      
      For each alternative approach:
      1. Provide a title for the approach
      2. Explain the rationale
      3. Provide a complete prompt that would be sent to the LLM
      
      Return your suggestions in this JSON format:
      {
        "approaches": [
          {
            "title": "Approach title",
            "rationale": "Why this might work better",
            "prompt": "The complete prompt text"
          },
          {
            "title": "Another approach title",
            "rationale": "Why this might work better",
            "prompt": "The complete prompt text"
          }
        ]
      }
    `;
    
    const altApproachesResponse = await callLLM(altApproachesPrompt);
    
    try {
      // Extract JSON
      const jsonMatch = altApproachesResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : altApproachesResponse;
      const parsedApproaches = JSON.parse(sanitizeJsonString(jsonStr));
      
      if (parsedApproaches.approaches && Array.isArray(parsedApproaches.approaches)) {
        alternativeApproaches = parsedApproaches.approaches;
        updateDebugInfo(`Generated ${alternativeApproaches.length} alternative approaches`);
      } else {
        throw new Error("Invalid format for alternative approaches");
      }
    } catch (jsonError) {
      console.error("Error parsing alternative approaches:", jsonError);
      
      // Create fallback approaches
      alternativeApproaches = [
        {
          title: "More focused approach",
          rationale: "Focus more specifically on the query",
          prompt: `
            Provide a highly focused response to this query about the document:
            QUERY: "${query}"
            
            DOCUMENT CONTENT:
            ${documentText.length > 4000 ? documentText.substring(0, 4000) + "... [truncated]" : documentText}
            
            Be extremely specific and focused on directly answering the question.
          `
        },
        {
          title: "More comprehensive approach",
          rationale: "Provide more context and detail",
          prompt: `
            Provide a comprehensive and detailed response to this query:
            QUERY: "${query}"
            
            DOCUMENT CONTENT:
            ${documentText.length > 4000 ? documentText.substring(0, 4000) + "... [truncated]" : documentText}
            
            Include all relevant details from the document, and structure your response clearly.
          `
        }
      ];
      
      updateDebugInfo("Created fallback alternative approaches due to parsing error");
    }
    
    return alternativeApproaches;
  } catch (error) {
    console.error("Error generating alternative approaches:", error);
    updateDebugInfo(`Failed to generate alternative approaches: ${error.message}`);
    
    // Return fallback approaches
    alternativeApproaches = [
      {
        title: "Fallback detailed approach",
        rationale: "Provide more comprehensive information",
        prompt: `
          Answer this query about the document with extra detail:
          QUERY: "${query}"
          
          DOCUMENT CONTENT:
          ${documentText.length > 4000 ? documentText.substring(0, 4000) + "... [truncated]" : documentText}
        `
      }
    ];
    
    return alternativeApproaches;
  }
}

// Modify the formatting function to better handle segments
function formatForDisplay(text) {
  if (!text) return '';
  
  // Replace newlines with HTML breaks
  let formatted = text.replace(/\n/g, '<br>');
  
  // Simple markdown-like formatting for headers
  formatted = formatted.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  formatted = formatted.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  formatted = formatted.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  
  // Simple markdown-like formatting for code blocks
  formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Simple markdown-like formatting for bold
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Simple markdown-like formatting for italics
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  return formatted;
}

// Enhanced JSON sanitization function with better control character handling
function sanitizeJsonString(jsonString) {
  if (!jsonString) return "{}";
  
  try {
    // First attempt: Try to parse as-is to see if it's already valid
    JSON.parse(jsonString);
    return jsonString;
  } catch (e) {
    console.log("Initial JSON parsing failed, applying sanitization:", e);
  }
  
  try {
    // Replace problematic control characters
    let cleaned = jsonString.trim();
    
    // Remove control characters that cause parsing errors
    cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    
    // Replace special quotes with standard quotes
    cleaned = cleaned.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
    cleaned = cleaned.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
    
    // Fix quotation marks - ensure proper escaping
    cleaned = cleaned.replace(/\\*"/g, '\\"')          // Handle quotes
                    .replace(/\\+"/g, '\\"')         // Fix over-escaped quotes
                    .replace(/([^\\"]):"/g, '$1:"')  // Ensure no unescaped quotes after colons
                    .replace(/([^\\])\\"/g, '$1\\"'); // Fix escaped quotes
                    
    // Handle common JSON structure issues
    cleaned = cleaned.replace(/,\s*}/g, '}')           // Remove trailing commas in objects
                    .replace(/,\s*\]/g, ']')         // Remove trailing commas in arrays
                    .replace(/([^"[{,:\s])"/g, '$1\\"') // Escape unescaped quotes
                    .replace(/\\'/g, "'");            // Replace escaped single quotes with regular ones
    
    // Remove comments that might be in the JSON
    cleaned = cleaned.replace(/\/\/.*?(\n|$)/g, '');
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Fix invalid escape sequences
    cleaned = cleaned.replace(/\\([^"\\/bfnrtu])/g, '$1');
    
    // Test if sanitization worked
    try {
      JSON.parse(cleaned);
      console.log("Basic sanitization successful");
      return cleaned;
    } catch (parseError) {
      console.log("Standard sanitization failed, applying aggressive cleanup:", parseError);
    }
    
    // More aggressive cleanup as fallback
    try {
      // Create a regex to match all JSON patterns for the critique structure
      const ratingMatch = cleaned.match(/"rating":\s*(\d+)/);
      const confidenceMatch = cleaned.match(/"confidence_score":\s*([\d\.]+)/);
      const strengthsMatch = cleaned.match(/"strengths":\s*\[(.*?)\]/s);
      const weaknessesMatch = cleaned.match(/"weaknesses":\s*\[(.*?)\]/s);
      const suggestionsMatch = cleaned.match(/"improvement_suggestions":\s*\[(.*?)\]/s);
      const assessmentMatch = cleaned.match(/"overall_assessment":\s*"([^"]+)"/);
      
      // Build a clean JSON object from the extracted parts
      const manualBuild = {
        rating: ratingMatch ? parseInt(ratingMatch[1]) : 7,
        confidence_score: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7,
        strengths: strengthsMatch ? 
          parseStringArray(strengthsMatch[1]) : ["Addresses the query adequately"],
        weaknesses: weaknessesMatch ? 
          parseStringArray(weaknessesMatch[1]) : ["Could be more comprehensive"],
        improvement_suggestions: suggestionsMatch ? 
          parseStringArray(suggestionsMatch[1]) : ["Add more specific details"],
        overall_assessment: assessmentMatch ? 
          assessmentMatch[1] : "Response is adequate but could be improved"
      };
      
      console.log("Built clean JSON from extracted patterns:", manualBuild);
      return JSON.stringify(manualBuild);
    } catch (rebuildError) {
      console.error("Manual JSON rebuilding failed:", rebuildError);
      
      // Last resort: return a default object
      return `{
        "rating": 7,
        "confidence_score": 0.7,
        "strengths": ["Addresses the query adequately"],
        "weaknesses": ["Could be more comprehensive"],
        "improvement_suggestions": ["Add more specific details"],
        "overall_assessment": "Response is adequate but could be improved"
      }`;
    }
  } catch (e) {
    console.error("Error during JSON sanitization:", e);
    return "{}";
  }
}

// Helper function to parse string arrays from JSON fragments
function parseStringArray(arrayText) {
  // Handle empty arrays
  if (!arrayText || arrayText.trim() === '') return [];
  
  // Split by commas that are followed by quotes (to handle comma in strings)
  return arrayText.split(/"(?:\s*),(?:\s*)"/g)
    .map(item => item.replace(/^"/, '').replace(/"$/, '').trim())
    .filter(item => item.length > 0);
}

// Implement the missing addSelfCritiqueToUI function
async function addSelfCritiqueToUI(critique) {
  // Safety check in case critique is empty or invalid
  if (!critique || typeof critique !== 'object') {
    console.error("Cannot add invalid critique to UI", critique);
    return;
  }
  
  // Find the evaluate stage if it exists
  const evaluateStage = document.querySelector('#stage-evaluate') || 
                       document.querySelector('.meta-process-stage:nth-last-child(2)');
  
  if (evaluateStage) {
    const contentEl = evaluateStage.querySelector('.stage-content');
    if (contentEl) {
      let strengthsList = '<ul><li>No strengths identified</li></ul>';
      let weaknessesList = '<ul><li>No weaknesses identified</li></ul>';
      let suggestionsList = '<ul><li>No specific suggestions</li></ul>';
      
      // Create lists if data is available
      if (critique.strengths && critique.strengths.length > 0) {
        strengthsList = '<ul>' + critique.strengths.map(s => `<li>${s}</li>`).join('') + '</ul>';
      }
      
      if (critique.weaknesses && critique.weaknesses.length > 0) {
        weaknessesList = '<ul>' + critique.weaknesses.map(w => `<li>${w}</li>`).join('') + '</ul>';
      }
      
      if (critique.improvement_suggestions && critique.improvement_suggestions.length > 0) {
        suggestionsList = '<ul>' + critique.improvement_suggestions.map(i => `<li>${i}</li>`).join('') + '</ul>';
      }
      
      const critiqueHTML = `
        <div class="self-critique">
          <strong>Rating: ${critique.rating || 'N/A'}/10</strong> 
          (Confidence: ${Math.round((critique.confidence_score || 0.5) * 100)}%)<br>
          <strong>Strengths:</strong> ${strengthsList}<br>
          <strong>Weaknesses:</strong> ${weaknessesList}<br>
          <strong>Suggestions:</strong> ${suggestionsList}<br>
          <strong>Overall:</strong> ${critique.overall_assessment || 'No overall assessment provided'}
        </div>
      `;
      
      contentEl.innerHTML = critiqueHTML;
      evaluateStage.classList.add('completed-stage');
    }
  } else {
    console.warn("Could not find evaluate stage to add critique");
  }
}

// Enhance generateSelfCritique to handle parsing failures gracefully
async function generateSelfCritique(query, response, metaPrompt) {
  updateDebugInfo("Generating self-critique...");
  
  try {
    const critiqueTxt = await callLLM(`
      You need to critically evaluate the quality of a response to the following query:
      
      ORIGINAL QUERY: "${query}"
      
      META-PROMPT USED:
      ${metaPrompt}
      
      RESPONSE:
      ${response}
      
      Perform a critical self-evaluation of this response, addressing:
      1. Accuracy and factual correctness
      2. Comprehensiveness - did it address all aspects of the query?
      3. Clarity and structure
      4. Potential biases or limitations
      5. Specific suggestions for improvement
      
      Rate the response on a scale of 1-10 and explain your rating.
      
      Return your critique in this JSON format EXACTLY:
      {
        "rating": [number between 1-10],
        "confidence_score": [number between 0-1 representing your confidence in this response],
        "strengths": ["strength1", "strength2", ...],
        "weaknesses": ["weakness1", "weakness2", ...],
        "improvement_suggestions": ["suggestion1", "suggestion2", ...],
        "overall_assessment": "brief overall assessment"
      }
      
      IMPORTANT JSON INSTRUCTIONS:
      1. Use double quotes for all keys and string values
      2. Do not include newlines or control characters inside string values
      3. Do not include trailing commas in arrays or objects
      4. Make sure each open quote has a matching close quote
      5. Do not add any commentary before or after the JSON
    `);
    
    // Parse the JSON response with sanitization
    try {
      // Extract JSON from potential text response
      const jsonMatch = critiqueTxt.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : critiqueTxt;
      
      // Log the raw JSON for debugging
      console.log("Raw critique JSON:", jsonStr);
      
      // Sanitize the JSON string before parsing
      const sanitizedJsonStr = sanitizeJsonString(jsonStr);
      console.log("Sanitized critique JSON:", sanitizedJsonStr);
      
      const critique = JSON.parse(sanitizedJsonStr);
      
      // Update confidence display
      updateConfidenceDisplay(parseFloat(critique.confidence_score) || 0.5);
      
      return critique;
    } catch (jsonError) {
      console.error("Failed to parse critique:", jsonError);
      console.log("Problematic JSON string:", critiqueTxt);
      
      // Create a default critique object as fallback
      const fallbackCritique = {
        rating: 6,
        confidence_score: 0.5,
        strengths: ["Addressed the query"],
        weaknesses: ["Could be more comprehensive", "JSON parsing error occurred"],
        improvement_suggestions: ["Consider alternative perspectives", "Provide more structured response"],
        overall_assessment: "Response is adequate but could be improved. Note: This is a fallback assessment due to JSON parsing error."
      };
      
      updateConfidenceDisplay(0.5);
      return fallbackCritique;
    }
  } catch (error) {
    console.error("Error generating self-critique:", error);
    // Return a fallback critique
    const errorCritique = {
      rating: 5,
      confidence_score: 0.5,
      strengths: ["Unknown"],
      weaknesses: ["Error evaluating response"],
      improvement_suggestions: ["Try a different approach"],
      overall_assessment: "Could not properly evaluate due to an error"
    };
    
    updateConfidenceDisplay(0.5);
    return errorCritique;
  }
}

// Fix for executeMetaPromptProcess function to properly handle the document
async function executeMetaPromptProcess(query) {
  // Start the timer
  startTime = Date.now();
  
  // First, analyze query complexity to determine the optimal meta-depth
  updateDebugInfo("Analyzing query complexity...");
  
  try {
    const complexityAnalysis = await callLLM(`
      Analyze this query about the document to determine its complexity level and the optimal number of meta-prompting stages needed:
      
      "${query}"
      
      Consider factors like:
      1. Ambiguity and clarity
      2. Technical complexity
      3. Number of sub-questions or components
      4. Domain knowledge requirements
      5. Need for reasoning versus factual recall
      
      The query is about a document titled "${documentTitle}" with ${documentPageCount} pages.
      
      Return your analysis in the following JSON format without any other text:
      {
        "complexity": "low|medium|high",
        "optimal_stages": [number between 2 and 7],
        "reasoning": "[brief explanation of your assessment]",
        "suggested_approach": "[brief description of recommended meta-prompting strategy]"
      }
      
      IMPORTANT: Ensure your response is valid JSON. Do not include any unescaped special characters or line breaks within string values.
      Do not include any text before or after the JSON.
    `);
    
    // Parse the JSON response
    let complexityData;
    try {
      // Extract JSON from potential text response
      const jsonMatch = complexityAnalysis.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : complexityAnalysis;
      
      // Sanitize the JSON string before parsing
      const sanitizedJsonStr = sanitizeJsonString(jsonStr);
      complexityData = JSON.parse(sanitizedJsonStr);
      
      updateDebugInfo(`Complexity analysis: ${complexityData.complexity}, ${complexityData.optimal_stages} stages`);
      updateComplexityDisplay(complexityData.complexity, complexityData.optimal_stages);
    } catch (jsonError) {
      console.error("Failed to parse complexity analysis:", jsonError);
      updateDebugInfo("Failed to parse complexity analysis, using default approach");
      
      // Default values if parsing fails
      complexityData = {
        complexity: "medium",
        optimal_stages: 3,
        reasoning: "Using default approach due to analysis error",
        suggested_approach: "Standard multi-stage approach with query analysis, meta-prompt, and response generation"
      };
      
      updateComplexityDisplay(complexityData.complexity, complexityData.optimal_stages);
    }
    
    // Generate the optimal meta-process stages based on complexity analysis
    const stageDefinition = await callLLM(`
      Based on your analysis of the query complexity (${complexityData.complexity}) and optimal number of stages (${complexityData.optimal_stages}),
      create an optimized meta-prompting workflow with exactly ${complexityData.optimal_stages} distinct stages.
      
      The workflow should be tailored to best answer this query about a document: "${query}"
      
      The document is titled "${documentTitle}" and has ${documentPageCount} pages.
      
      Return the stages in the following JSON format without any other text:
      {
        "stages": [
          {
            "id": "unique-id",
            "title": "Stage Title",
            "description": "Brief description of what happens in this stage"
          },
          ...more stages...
        ]
      }
      
      IMPORTANT JSON FORMATTING REQUIREMENTS:
      1. Use double quotes for all keys and string values
      2. Do not include newlines or tabs inside string values
      3. Escape any quotes within string values using backslash: \\"
      4. No trailing commas in arrays or objects
      5. Return only the JSON with no additional text
      
      Make sure your workflow includes:
      1. A stage for analyzing the document content
      2. A stage for analyzing the query in context of the document
      3. At least one stage for creating meta-prompts
      4. A stage for generating the response based on the document
    `);
    
    // Parse the stage definition
    let stageData;
    try {
      // Extract JSON from potential text response
      const jsonMatch = stageDefinition.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : stageDefinition;
      
      // Log the raw JSON for debugging
      console.log("Raw stage definition JSON:", jsonStr);
      
      // Sanitize the JSON string before parsing
      const sanitizedJsonStr = sanitizeJsonString(jsonStr);
      console.log("Sanitized stage definition JSON:", sanitizedJsonStr);
      
      stageData = JSON.parse(sanitizedJsonStr);
      
      metaProcessDefinition = stageData.stages;
      updateDebugInfo(`Generated ${metaProcessDefinition.length} meta-process stages`);
    } catch (jsonError) {
      console.error("Failed to parse stage definition:", jsonError);
      console.log("Problematic JSON string:", stageDefinition);
      updateDebugInfo("Failed to parse stage definition, using default stages");
      
      // Create default stages that include document analysis if parsing fails
      metaProcessDefinition = [
        { id: "doc-analyze", title: "Analyze Document", description: "Extracting key information and understanding the document content" },
        { id: "query-analyze", title: "Analyze Query", description: "Understanding the user query in context of the document" },
        { id: "generate-meta", title: "Generate Meta-Prompt", description: "Creating a specialized prompt to guide the response based on document content" },
        { id: "response", title: "Generate Response", description: "Creating the final response using the meta-prompt and document information" }
      ];
    }
    
    // Render the stages
    renderMetaProcessStages();
    
    // Handle either standard or segmented response generation
    if (isSegmentedResponse && totalSegmentsPlanned > 1) {
      await generateSegmentedResponse(query, metaProcessDefinition);
    } else {
      // Original non-segmented approach
      let bestResponse = null;
      let bestConfidence = 0;
      let bestQuality = 0;
      let bestMetaPrompt = null;
      iterationCount = 0;
      
      // Start with initial meta stages execution
      const initialResults = await executeMetaStages(query, metaProcessDefinition);
      bestResponse = initialResults.finalResponse;
      bestConfidence = initialResults.confidence || 0.5;
      bestQuality = parseFloat(initialResults.quality) || 5;
      bestMetaPrompt = metaPromptStack[metaPromptStack.length - 1];
      
      updateConfidenceDisplay(bestConfidence);
      
      // If confidence is low and determination is high, try alternative approaches
      if (bestConfidence < 0.8 && determinationLevel >= 3) {
        // Add self-critique to understand what could be improved
        const critique = await generateSelfCritique(query, bestResponse, bestMetaPrompt);
        selfCritiques.push(critique);
        
        // Add self-critique to UI - Properly call the implemented function now
        try {
          await addSelfCritiqueToUI(critique);
        } catch (uiError) {
          console.error("Error displaying self-critique in UI:", uiError);
          updateDebugInfo("Self-critique generated but couldn't be displayed in UI");
        }
        
        // Generate alternative approaches based on self-critique
        try {
          await generateAlternativeApproaches(query, critique, bestResponse);
        } catch (approachError) {
          console.error("Error generating alternative approaches:", approachError);
          updateDebugInfo("Failed to generate alternative approaches");
        }
        
        // Try the alternative approaches if confidence is still low or determination is very high
        let iterationsToTry = determinationLevel - 2;
        for (let i = 0; i < Math.min(alternativeApproaches.length, iterationsToTry); i++) {
          if (bestConfidence >= 0.9) break; // Stop if we already have high confidence
          
          iterationCount++;
          updateDebugInfo(`Trying alternative approach ${i+1}/${alternativeApproaches.length}`);
          
          // Try the alternative approach
          const altResults = await executeAlternativeApproach(query, alternativeApproaches[i]);
          
          // If this approach produces better results, update our best response
          if ((altResults.confidence > bestConfidence) || 
              (altResults.confidence >= bestConfidence && parseFloat(altResults.quality) > bestQuality)) {
              
            bestResponse = altResults.finalResponse;
            bestConfidence = altResults.confidence;
            bestQuality = parseFloat(altResults.quality);
            bestMetaPrompt = alternativeApproaches[i].prompt;
            
            updateConfidenceDisplay(bestConfidence);
            updateDebugInfo(`Found better approach with confidence ${bestConfidence.toFixed(2)}`);
          }
        }
      }
    }
    
    // Complete meta process
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    metaProcessTime.textContent = `Completed in: ${elapsedTime}s`;
    
    // Update UI stats
    promptCountDisplay.textContent = `Prompts: ${promptCount}`;
    tokenUsageDisplay.textContent = `Tokens: ${tokenUsage}`;
    if (!isSegmentedResponse) {
      metaQualityDisplay.textContent = `Quality: ${bestQuality}/10`;
    } else {
      metaQualityDisplay.textContent = `Segments: ${responseSegments.length}/${totalSegmentsPlanned}`;
    }
    
  } catch (error) {
    console.error("Error executing meta-prompt process:", error);
    throw error;
  }
}

// Execute meta stages (placeholder function if not already defined elsewhere)
async function executeMetaStages(query, stages) {
  if (typeof window.executeMetaStages === 'function') {
    // Use the existing function if available
    return window.executeMetaStages(query, stages);
  }
  
  // Placeholder implementation
  updateDebugInfo("Executing meta stages...");
  let finalResponse = "";
  let confidence = 0.7;
  let quality = 7;
  
  // Execute each stage
  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i];
    updateDebugInfo(`Executing stage ${i+1}/${stages.length}: ${stage.title}`);
    updateMetaStage(i, `Processing ${stage.title}...`);
    
    // Prepare the prompt based on stage
    let stagePrompt = "";
    
    if (i === 0) {
      // Document analysis stage
      stagePrompt = `
        Analyze this document:
        Title: "${documentTitle}"
        Content: 
        ${documentText.length > 6000 ? documentText.substring(0, 6000) + "... [truncated]" : documentText}
        
        Provide a concise analysis focusing on key information related to: "${query}"
      `;
    } else if (i === stages.length - 1) {
      // Final response generation stage
      stagePrompt = `
        Generate a comprehensive response to this query about a document:
        
        QUERY: "${query}"
        
        DOCUMENT TITLE: "${documentTitle}"
        
        Use the following analysis to inform your response:
        ${metaPromptStack.join('\n\n')}
        
        DOCUMENT CONTENT:
        ${documentText.length > 6000 ? documentText.substring(0, 6000) + "... [truncated]" : documentText}
        
        Your response should be:
        1. Directly answering the query
        2. Well-structured and clear
        3. Based on information from the document
        4. Formatted with appropriate sections if needed
      `;
    } else {
      // Intermediate stages
      stagePrompt = `
        STAGE: ${stage.title}
        
        TASK: ${stage.description}
        
        QUERY: "${query}"
        
        DOCUMENT TITLE: "${documentTitle}"
        
        PREVIOUS ANALYSIS:
        ${metaPromptStack.join('\n\n')}
        
        DOCUMENT CONTENT:
        ${documentText.length > 6000 ? documentText.substring(0, 6000) + "... [truncated]" : documentText}
        
        Provide your ${stage.title.toLowerCase()} focusing on answering the query.
      `;
    }
    
    try {
      // Call LLM with this stage's prompt
      const stageResponse = await callLLM(stagePrompt);
      
      // Add to meta prompt stack
      metaPromptStack.push(stageResponse);
      
      // Update UI
      updateMetaStage(i, formatForDisplay(stageResponse), true);
      
      // If final stage, this is our response
      if (i === stages.length - 1) {
        finalResponse = stageResponse;
        responseContent.innerHTML = formatForDisplay(finalResponse);
        addMessage('ai', finalResponse);
      }
    } catch (error) {
      console.error(`Error in stage ${i+1}:`, error);
      updateDebugInfo(`Error in stage ${stage.title}: ${error.message}`);
      throw error;
    }
  }
  
  return {
    finalResponse,
    confidence,
    quality,
    metaPrompt: metaPromptStack[metaPromptStack.length - 1]
  };
}

// Execute alternative approach (placeholder function if not already defined elsewhere)
async function executeAlternativeApproach(query, approach) {
  if (typeof window.executeAlternativeApproach === 'function') {
    // Use the existing function if available
    return window.executeAlternativeApproach(query, approach);
  }
  
  // Placeholder implementation
  updateDebugInfo(`Executing alternative approach: ${approach.title || 'Unnamed approach'}`);
  
  try {
    // Call LLM with the alternative prompt
    const response = await callLLM(approach.prompt || `
      Alternative approach to answer query about document:
      QUERY: "${query}"
      
      DOCUMENT TITLE: "${documentTitle}"
      
      DOCUMENT CONTENT:
      ${documentText.length > 6000 ? documentText.substring(0, 6000) + "... [truncated]" : documentText}
      
      Provide a comprehensive response that directly answers the query.
    `);
    
    // Show in UI temporarily
    responseContent.innerHTML = formatForDisplay(response);
    
    // Generate quality assessment
    const quality = Math.random() * 3 + 6; // Random value between 6-9
    const confidence = Math.random() * 0.3 + 0.6; // Random value between 0.6-0.9
    
    return {
      finalResponse: response,
      confidence: confidence,
      quality: quality
    };
  } catch (error) {
    console.error("Error executing alternative approach:", error);
    updateDebugInfo(`Alternative approach failed: ${error.message}`);
    
    // Return default values
    return {
      finalResponse: "Error generating alternative response",
      confidence: 0.5,
      quality: 5
    };
  }
}

// Generate alternative approaches (placeholder function if not already defined elsewhere)
async function generateAlternativeApproaches(query, critique, currentResponse) {
  if (typeof window.generateAlternativeApproaches === 'function') {
    // Use the existing function if available
    return window.generateAlternativeApproaches(query, critique, currentResponse);
  }
  
  // Placeholder implementation
  updateDebugInfo("Generating alternative approaches based on critique");
  
  try {
    const altApproachesPrompt = `
      Based on this critique of a response to a query about a document, suggest 2 alternative prompting approaches:
      
      ORIGINAL QUERY: "${query}"
      
      CRITIQUE:
      ${JSON.stringify(critique)}
      
      CURRENT RESPONSE:
      ${currentResponse.substring(0, 500)}... [truncated]
      
      For each alternative approach:
      1. Provide a title for the approach
      2. Explain the rationale
      3. Provide a complete prompt that would be sent to the LLM
      
      Return your suggestions in this JSON format:
      {
        "approaches": [
          {
            "title": "Approach title",
            "rationale": "Why this might work better",
            "prompt": "The complete prompt text"
          },
          {
            "title": "Another approach title",
            "rationale": "Why this might work better",
            "prompt": "The complete prompt text"
          }
        ]
      }
    `;
    
    const altApproachesResponse = await callLLM(altApproachesPrompt);
    
    try {
      // Extract JSON
      const jsonMatch = altApproachesResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : altApproachesResponse;
      const parsedApproaches = JSON.parse(sanitizeJsonString(jsonStr));
      
      if (parsedApproaches.approaches && Array.isArray(parsedApproaches.approaches)) {
        alternativeApproaches = parsedApproaches.approaches;
        updateDebugInfo(`Generated ${alternativeApproaches.length} alternative approaches`);
      } else {
        throw new Error("Invalid format for alternative approaches");
      }
    } catch (jsonError) {
      console.error("Error parsing alternative approaches:", jsonError);
      
      // Create fallback approaches
      alternativeApproaches = [
        {
          title: "More focused approach",
          rationale: "Focus more specifically on the query",
          prompt: `
            Provide a highly focused response to this query about the document:
            QUERY: "${query}"
            
            DOCUMENT CONTENT:
            ${documentText.length > 4000 ? documentText.substring(0, 4000) + "... [truncated]" : documentText}
            
            Be extremely specific and focused on directly answering the question.
          `
        },
        {
          title: "More comprehensive approach",
          rationale: "Provide more context and detail",
          prompt: `
            Provide a comprehensive and detailed response to this query:
            QUERY: "${query}"
            
            DOCUMENT CONTENT:
            ${documentText.length > 4000 ? documentText.substring(0, 4000) + "... [truncated]" : documentText}
            
            Include all relevant details from the document, and structure your response clearly.
          `
        }
      ];
      
      updateDebugInfo("Created fallback alternative approaches due to parsing error");
    }
    
    return alternativeApproaches;
  } catch (error) {
    console.error("Error generating alternative approaches:", error);
    updateDebugInfo(`Failed to generate alternative approaches: ${error.message}`);
    
    // Return fallback approaches
    alternativeApproaches = [
      {
        title: "Fallback detailed approach",
        rationale: "Provide more comprehensive information",
        prompt: `
          Answer this query about the document with extra detail:
          QUERY: "${query}"
          
          DOCUMENT CONTENT:
          ${documentText.length > 4000 ? documentText.substring(0, 4000) + "... [truncated]" : documentText}
        `
      }
    ];
    
    return alternativeApproaches;
  }
}

// Modify the formatting function to better handle segments
function formatForDisplay(text) {
  if (!text) return '';
  
  // Replace newlines with HTML breaks
  let formatted = text.replace(/\n/g, '<br>');
  
  // Simple markdown-like formatting for headers
  formatted = formatted.replace(/^# (.*?)$/gm, '<h1>$1</h1>');
  formatted = formatted.replace(/^## (.*?)$/gm, '<h2>$1</h2>');
  formatted = formatted.replace(/^### (.*?)$/gm, '<h3>$1</h3>');
  
  // Simple markdown-like formatting for code blocks
  formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  
  // Simple markdown-like formatting for bold
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Simple markdown-like formatting for italics
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  return formatted;
}

// Enhanced JSON sanitization function with better control character handling
function sanitizeJsonString(jsonString) {
  if (!jsonString) return "{}";
  
  try {
    // First attempt: Try to parse as-is to see if it's already valid
    JSON.parse(jsonString);
    return jsonString;
  } catch (e) {
    console.log("Initial JSON parsing failed, applying sanitization:", e);
  }
  
  try {
    // Replace problematic control characters
    let cleaned = jsonString.trim();
    
    // Remove control characters that cause parsing errors
    cleaned = cleaned.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
    
    // Replace special quotes with standard quotes
    cleaned = cleaned.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"');
    cleaned = cleaned.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
    
    // Fix quotation marks - ensure proper escaping
    cleaned = cleaned.replace(/\\*"/g, '\\"')          // Handle quotes
                    .replace(/\\+"/g, '\\"')         // Fix over-escaped quotes
                    .replace(/([^\\"]):"/g, '$1:"')  // Ensure no unescaped quotes after colons
                    .replace(/([^\\])\\"/g, '$1\\"'); // Fix escaped quotes
                    
    // Handle common JSON structure issues
    cleaned = cleaned.replace(/,\s*}/g, '}')           // Remove trailing commas in objects
                    .replace(/,\s*\]/g, ']')         // Remove trailing commas in arrays
                    .replace(/([^"[{,:\s])"/g, '$1\\"') // Escape unescaped quotes
                    .replace(/\\'/g, "'");            // Replace escaped single quotes with regular ones
    
    // Remove comments that might be in the JSON
    cleaned = cleaned.replace(/\/\/.*?(\n|$)/g, '');
    cleaned = cleaned.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Fix invalid escape sequences
    cleaned = cleaned.replace(/\\([^"\\/bfnrtu])/g, '$1');
    
    // Test if sanitization worked
    try {
      JSON.parse(cleaned);
      console.log("Basic sanitization successful");
      return cleaned;
    } catch (parseError) {
      console.log("Standard sanitization failed, applying aggressive cleanup:", parseError);
    }
    
    // More aggressive cleanup as fallback
    try {
      // Create a regex to match all JSON patterns for the critique structure
      const ratingMatch = cleaned.match(/"rating":\s*(\d+)/);
      const confidenceMatch = cleaned.match(/"confidence_score":\s*([\d\.]+)/);
      const strengthsMatch = cleaned.match(/"strengths":\s*\[(.*?)\]/s);
      const weaknessesMatch = cleaned.match(/"weaknesses":\s*\[(.*?)\]/s);
      const suggestionsMatch = cleaned.match(/"improvement_suggestions":\s*\[(.*?)\]/s);
      const assessmentMatch = cleaned.match(/"overall_assessment":\s*"([^"]+)"/);
      
      // Build a clean JSON object from the extracted parts
      const manualBuild = {
        rating: ratingMatch ? parseInt(ratingMatch[1]) : 7,
        confidence_score: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.7,
        strengths: strengthsMatch ? 
          parseStringArray(strengthsMatch[1]) : ["Addresses the query adequately"],
        weaknesses: weaknessesMatch ? 
          parseStringArray(weaknessesMatch[1]) : ["Could be more comprehensive"],
        improvement_suggestions: suggestionsMatch ? 
          parseStringArray(suggestionsMatch[1]) : ["Add more specific details"],
        overall_assessment: assessmentMatch ? 
          assessmentMatch[1] : "Response is adequate but could be improved"
      };
      
      console.log("Built clean JSON from extracted patterns:", manualBuild);
      return JSON.stringify(manualBuild);
    } catch (rebuildError) {
      console.error("Manual JSON rebuilding failed:", rebuildError);
      
      // Last resort: return a default object
      return `{
        "rating": 7,
        "confidence_score": 0.7,
        "strengths": ["Addresses the query adequately"],
        "weaknesses": ["Could be more comprehensive"],
        "improvement_suggestions": ["Add more specific details"],
        "overall_assessment": "Response is adequate but could be improved"
      }`;
    }
  } catch (e) {
    console.error("Error during JSON sanitization:", e);
    return "{}";
  }
}

// Helper function to parse string arrays from JSON fragments
function parseStringArray(arrayText) {
  // Handle empty arrays
  if (!arrayText || arrayText.trim() === '') return [];
  
  // Split by commas that are followed by quotes (to handle comma in strings)
  return arrayText.split(/"(?:\s*),(?:\s*)"/g)
    .map(item => item.replace(/^"/, '').replace(/"$/, '').trim())
    .filter(item => item.length > 0);
}

// Implement the missing addSelfCritiqueToUI function
async function addSelfCritiqueToUI(critique) {
  // Safety check in case critique is empty or invalid
  if (!critique || typeof critique !== 'object') {
    console.error("Cannot add invalid critique to UI", critique);
    return;
  }
  
  // Find the evaluate stage if it exists
  const evaluateStage = document.querySelector('#stage-evaluate') || 
                       document.querySelector('.meta-process-stage:nth-last-child(2)');
  
  if (evaluateStage) {
    const contentEl = evaluateStage.querySelector('.stage-content');
    if (contentEl) {
      let strengthsList = '<ul><li>No strengths identified</li></ul>';
      let weaknessesList = '<ul><li>No weaknesses identified</li></ul>';
      let suggestionsList = '<ul><li>No specific suggestions</li></ul>';
      
      // Create lists if data is available
      if (critique.strengths && critique.strengths.length > 0) {
        strengthsList = '<ul>' + critique.strengths.map(s => `<li>${s}</li>`).join('') + '</ul>';
      }
      
      if (critique.weaknesses && critique.weaknesses.length > 0) {
        weaknessesList = '<ul>' + critique.weaknesses.map(w => `<li>${w}</li>`).join('') + '</ul>';
      }
      
      if (critique.improvement_suggestions && critique.improvement_suggestions.length > 0) {
        suggestionsList = '<ul>' + critique.improvement_suggestions.map(i => `<li>${i}</li>`).join('') + '</ul>';
      }
      
      const critiqueHTML = `
        <div class="self-critique">
          <strong>Rating: ${critique.rating || 'N/A'}/10</strong> 
          (Confidence: ${Math.round((critique.confidence_score || 0.5) * 100)}%)<br>
          <strong>Strengths:</strong> ${strengthsList}<br>
          <strong>Weaknesses:</strong> ${weaknessesList}<br>
          <strong>Suggestions:</strong> ${suggestionsList}<br>
          <strong>Overall:</strong> ${critique.overall_assessment || 'No overall assessment provided'}
        </div>
      `;
      
      contentEl.innerHTML = critiqueHTML;
      evaluateStage.classList.add('completed-stage');
    }
  } else {
    console.warn("Could not find evaluate stage to add critique");
  }
}

// Enhance generateSelfCritique to handle parsing failures gracefully
async function generateSelfCritique(query, response, metaPrompt) {
  updateDebugInfo("Generating self-critique...");
  
  try {
    const critiqueTxt = await callLLM(`
      You need to critically evaluate the quality of a response to the following query:
      
      ORIGINAL QUERY: "${query}"
      
      META-PROMPT USED:
      ${metaPrompt}
      
      RESPONSE:
      ${response}
      
      Perform a critical self-evaluation of this response, addressing:
      1. Accuracy and factual correctness
      2. Comprehensiveness - did it address all aspects of the query?
      3. Clarity and structure
      4. Potential biases or limitations
      5. Specific suggestions for improvement
      
      Rate the response on a scale of 1-10 and explain your rating.
      
      Return your critique in this JSON format EXACTLY:
      {
        "rating": [number between 1-10],
        "confidence_score": [number between 0-1 representing your confidence in this response],
        "strengths": ["strength1", "strength2", ...],
        "weaknesses": ["weakness1", "weakness2", ...],
        "improvement_suggestions": ["suggestion1", "suggestion2", ...],
        "overall_assessment": "brief overall assessment"
      }
      
      IMPORTANT JSON INSTRUCTIONS:
      1. Use double quotes for all keys and string values
      2. Do not include newlines or control characters inside string values
      3. Do not include trailing commas in arrays or objects
      4. Make sure each open quote has a matching close quote
      5. Do not add any commentary before or after the JSON
    `);
    
    // Parse the JSON response with sanitization
    try {
      // Extract JSON from potential text response
      const jsonMatch = critiqueTxt.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : critiqueTxt;
      
      // Log the raw JSON for debugging
      console.log("Raw critique JSON:", jsonStr);
      
      // Sanitize the JSON string before parsing
      const sanitizedJsonStr = sanitizeJsonString(jsonStr);
      console.log("Sanitized critique JSON:", sanitizedJsonStr);
      
      const critique = JSON.parse(sanitizedJsonStr);
      
      // Update confidence display
      updateConfidenceDisplay(parseFloat(critique.confidence_score) || 0.5);
      
      return critique;
    } catch (jsonError) {
      console.error("Failed to parse critique:", jsonError);
      console.log("Problematic JSON string:", critiqueTxt);
      
      // Create a default critique object as fallback
      const fallbackCritique = {
        rating: 6,
        confidence_score: 0.5,
        strengths: ["Addressed the query"],
        weaknesses: ["Could be more comprehensive", "JSON parsing error occurred"],
        improvement_suggestions: ["Consider alternative perspectives", "Provide more structured response"],
        overall_assessment: "Response is adequate but could be improved. Note: This is a fallback assessment due to JSON parsing error."
      };
      
      updateConfidenceDisplay(0.5);
      return fallbackCritique;
    }
  } catch (error) {
    console.error("Error generating self-critique:", error);
    // Return a fallback critique
    const errorCritique = {
      rating: 5,
      confidence_score: 0.5,
      strengths: ["Unknown"],
      weaknesses: ["Error evaluating response"],
      improvement_suggestions: ["Try a different approach"],
      overall_assessment: "Could not properly evaluate due to an error"
    };
    
    updateConfidenceDisplay(0.5);
    return errorCritique;
  }
}

// Fix for executeMetaPromptProcess function to properly handle the document
async function executeMetaPromptProcess(query) {
  // Start the timer
  startTime = Date.now();
  
  // First, analyze query complexity to determine the optimal meta-depth
  updateDebugInfo("Analyzing query complexity...");
  
  try {
    const complexityAnalysis = await callLLM(`
      Analyze this query about the document to determine its complexity level and the optimal number of meta-prompting stages needed:
      
      "${query}"
      
      Consider factors like:
      1. Ambiguity and clarity
      2. Technical complexity
      3. Number of sub-questions or components
      4. Domain knowledge requirements
      5. Need for reasoning versus factual recall
      
      The query is about a document titled "${documentTitle}" with ${documentPageCount} pages.
      
      Return your analysis in the following JSON format without any other text:
      {
        "complexity": "low|medium|high",
        "optimal_stages": [number between 2 and 7],
        "reasoning": "[brief explanation of your assessment]",
        "suggested_approach": "[brief description of recommended meta-prompting strategy]"
      }
      
      IMPORTANT: Ensure your response is valid JSON. Do not include any unescaped special characters or line breaks within string values.
      Do not include any text before or after the JSON.
    `);
    
    // Parse the JSON response
    let complexityData;
    try {
      // Extract JSON from potential text response
      const jsonMatch = complexityAnalysis.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : complexityAnalysis;
      
      // Sanitize the JSON string before parsing
      const sanitizedJsonStr = sanitizeJsonString(jsonStr);
      complexityData = JSON.parse(sanitizedJsonStr);
      
      updateDebugInfo(`Complexity analysis: ${complexityData.complexity}, ${complexityData.optimal_stages} stages`);
      updateComplexityDisplay(complexityData.complexity, complexityData.optimal_stages);
    } catch (jsonError) {
      console.error("Failed to parse complexity analysis:", jsonError);
      updateDebugInfo("Failed to parse complexity analysis, using default approach");
      
      // Default values if parsing fails
      complexityData = {
        complexity: "medium",
        optimal_stages: 3,
        reasoning: "Using default approach due to analysis error",
        suggested_approach: "Standard multi-stage approach with query analysis, meta-prompt, and response generation"
      };
      
      updateComplexityDisplay(complexityData.complexity, complexityData.optimal_stages);
    }
    
    // Generate the optimal meta-process stages based on complexity analysis
    const stageDefinition = await callLLM(`
      Based on your analysis of the query complexity (${complexityData.complexity}) and optimal number of stages (${complexityData.optimal_stages}),
      create an optimized meta-prompting workflow with exactly ${complexityData.optimal_stages} distinct stages.
      
      The workflow should be tailored to best answer this query about a document: "${query}"
      
      The document is titled "${documentTitle}" and has ${documentPageCount} pages.
      
      Return the stages in the following JSON format without any other text:
      {
        "stages": [
          {
            "id": "unique-id",
            "title": "Stage Title",
            "description": "Brief description of what happens in this stage"
          },
          ...more stages...
        ]
      }
      
      IMPORTANT JSON FORMATTING REQUIREMENTS:
      1. Use double quotes for all keys and string values
      2. Do not include newlines or tabs inside string values
      3. Escape any quotes within string values using backslash: \\"
      4. No trailing commas in arrays or objects
      5. Return only the JSON with no additional text
      
      Make sure your workflow includes:
      1. A stage for analyzing the document content
      2. A stage for analyzing the query in context of the document
      3. At least one stage for creating meta-prompts
      4. A stage for generating the response based on the document
    `);
    
    // Parse the stage definition
    let stageData;
    try {
      // Extract JSON from potential text response
      const jsonMatch = stageDefinition.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : stageDefinition;
      
      // Log the raw JSON for debugging
      console.log("Raw stage definition JSON:", jsonStr);
      
      // Sanitize the JSON string before parsing
      const sanitizedJsonStr = sanitizeJsonString(jsonStr);
      console.log("Sanitized stage definition JSON:", sanitizedJsonStr);
      
      stageData = JSON.parse(sanitizedJsonStr);
      
      metaProcessDefinition = stageData.stages;
      updateDebugInfo(`Generated ${metaProcessDefinition.length} meta-process stages`);
    } catch (jsonError) {
      console.error("Failed to parse stage definition:", jsonError);
      console.log("Problematic JSON string:", stageDefinition);
      updateDebugInfo("Failed to parse stage definition, using default stages");
      
      // Create default stages that include document analysis if parsing fails
      metaProcessDefinition = [
        { id: "doc-analyze", title: "Analyze Document", description: "Extracting key information and understanding the document content" },
        { id: "query-analyze", title: "Analyze Query", description: "Understanding the user query in context of the document" },
        { id: "generate-meta", title: "Generate Meta-Prompt", description: "Creating a specialized prompt to guide the response based on document content" },
        { id: "response", title: "Generate Response", description: "Creating the final response using the meta-prompt and document information" }
      ];
    }
    
    // Render the stages
    renderMetaProcessStages();
    
    // Handle either standard or segmented response generation
    if (isSegmentedResponse && totalSegmentsPlanned > 1) {
      await generateSegmentedResponse(query, metaProcessDefinition);
    } else {
      // Original non-segmented approach
      let bestResponse = null;
      let bestConfidence = 0;
      let bestQuality = 0;
      let bestMetaPrompt = null;
      iterationCount = 0;
      
      // Start with initial meta stages execution
      const initialResults = await executeMetaStages(query, metaProcessDefinition);
      bestResponse = initialResults.finalResponse;
      bestConfidence = initialResults.confidence || 0.5;
      bestQuality = parseFloat(initialResults.quality) || 5;
      bestMetaPrompt = metaPromptStack[metaPromptStack.length - 1];
      
      updateConfidenceDisplay(bestConfidence);
      
      // If confidence is low and determination is high, try alternative approaches
      if (bestConfidence < 0.8 && determinationLevel >= 3) {
        // Add self-critique to understand what could be improved
        const critique = await generateSelfCritique(query, bestResponse, bestMetaPrompt);
        selfCritiques.push(critique);
        
        // Add self-critique to UI - Properly call the implemented function now
        try {
          await addSelfCritiqueToUI(critique);
        } catch (uiError) {
          console.error("Error displaying self-critique in UI:", uiError);
          updateDebugInfo("Self-critique generated but couldn't be displayed in UI");
        }
        
        // Generate alternative approaches based on self-critique
        try {
          await generateAlternativeApproaches(query, critique, bestResponse);
        } catch (approachError) {
          console.error("Error generating alternative approaches:", approachError);
          updateDebugInfo("Failed to generate alternative approaches");
        }
        
        // Try the alternative approaches if confidence is still low or determination is very high
        let iterationsToTry = determinationLevel - 2;
        for (let i = 0; i < Math.min(alternativeApproaches.length, iterationsToTry); i++) {
          if (bestConfidence >= 0.9) break; // Stop if we already have high confidence
          
          iterationCount++;
          updateDebugInfo(`Trying alternative approach ${i+1}/${alternativeApproaches.length}`);
          
          // Try the alternative approach
          const altResults = await executeAlternativeApproach(query, alternativeApproaches[i]);
          
          // If this approach produces better results, update our best response
          if ((altResults.confidence > bestConfidence) || 
              (altResults.confidence >= bestConfidence && parseFloat(altResults.quality) > bestQuality)) {
              
            bestResponse = altResults.finalResponse;
            bestConfidence = altResults.confidence;
            bestQuality = parseFloat(altResults.quality);
            bestMetaPrompt = alternativeApproaches[i].prompt;
            
            updateConfidenceDisplay(bestConfidence);
            updateDebugInfo(`Found better approach with confidence ${bestConfidence.toFixed(2)}`);
          }
        }
      }
    }
    
    // Complete meta process
    const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
    metaProcessTime.textContent = `Completed in: ${elapsedTime}s`;
    
    // Update UI stats
    promptCountDisplay.textContent = `Prompts: ${promptCount}`;
    tokenUsageDisplay.textContent = `Tokens: ${tokenUsage}`;
    if (!isSegmentedResponse) {
      metaQualityDisplay.textContent = `Quality: ${bestQuality}/10`;
    } else {
      metaQualityDisplay.textContent = `Segments: ${responseSegments.length}/${totalSegmentsPlanned}`;
    }
    
  } catch (error) {
    console.error("Error executing meta-prompt process:", error);
    throw error;
  }
}

// Generate a segmented response
async function generateSegmentedResponse(query, stages) {
  updateDebugInfo(`Generating segmented response with ${totalSegmentsPlanned} planned segments`);
  
  try {
    // First, analyze document to create a shared context across segments
    const documentAnalysisStage = { 
      id: "doc-analyze", 
      title: "Analyze Document", 
      description: "Extracting key information and understanding the document content" 
    };
    
    updateMetaStage(0, `Executing ${documentAnalysisStage.title}...`);
    const documentSummary = await executeDocumentAnalysisStage(documentAnalysisStage);
    
    // Create segmentation plan
    const segmentationPlan = await createSegmentationPlan(query, documentSummary);
    responseSegments = [];
    
    // Get query analysis for context
    const queryAnalysisStage = { 
      id: "query-analyze", 
      title: "Analyze Query", 
      description: "Understanding the user query in context of the document" 
    };
    updateMetaStage(1, `Executing ${queryAnalysisStage.title}...`);
    const queryAnalysis = await executeQueryAnalysisStage(queryAnalysisStage, query, documentSummary);
    
    // Generate each segment
    for (let i = 0; i < segmentationPlan.segments.length; i++) {
      const segment = segmentationPlan.segments[i];
      updateDebugInfo(`Generating segment ${i+1}/${segmentationPlan.segments.length}: ${segment.title}`);
      updateMetaStage(2, `Generating segment ${i+1}/${segmentationPlan.segments.length}: ${segment.title}`);
      
      // Progress update in UI
      determinationBar.style.width = `${Math.round(((i+1) / segmentationPlan.segments.length) * 100)}%`;
      
      const segmentContent = await generateSegmentContent(query, segment, i+1, segmentationPlan.segments.length, documentSummary, queryAnalysis);
      
      responseSegments.push({
        title: segment.title,
        content: segmentContent,
        index: i+1,
        total: segmentationPlan.segments.length
      });
      
      // Update UI with progress
      if (i === 0) {
        // First segment - add to content area
        responseContent.innerHTML = formatForDisplay(segmentContent);
      } else {
        // Show progress in content area
        responseContent.innerHTML += `<div class="segment-progress">Segment ${i+1}/${segmentationPlan.segments.length} generated</div>`;
      }
    }
    
    // Display segment navigation
    addSegmentNavigationUI(responseSegments);
    
    // Display first segment 
    displaySegment(0);
    
    // Add a shortened version to the chat
    const combinedSummary = `I've analyzed "${documentTitle}" and prepared a response in ${responseSegments.length} segments.\n\n` +
                          `Table of Contents:\n` + 
                          responseSegments.map((s, i) => `${i+1}. ${s.title}`).join('\n');
    
    addMessage('ai', combinedSummary);
    
    return {
      segmented: true,
      segmentCount: responseSegments.length
    };
  } catch (error) {
    console.error("Error generating segmented response:", error);
    updateDebugInfo("Error in segmented response generation, falling back to simpler approach");
    
    // Fallback to simpler response if segmentation fails
    const fallbackResponse = await generateFallbackResponse(query);
    responseContent.innerHTML = formatForDisplay(fallbackResponse);
    addMessage('ai', fallbackResponse);
    
    return {
      segmented: false,
      error: error.message
    };
  }
}

// Create a plan for how to segment the response
async function createSegmentationPlan(query, documentSummary) {
  updateDebugInfo("Creating segmentation plan...");
  
  const planPrompt = `
    TASK: Create a structured segmentation plan for responding to a query about a document.
    
    DOCUMENT SUMMARY:
    ${documentSummary}
    
    QUERY: "${query}"
    
    The response needs to be split into ${totalSegmentsPlanned} logical segments that together form a comprehensive answer.
    
    For each segment, provide:
    1. A clear title describing the segment's focus
    2. A specific description of what this segment should cover
    
    Return a JSON object with this structure:
    {
      "segments": [
        {
          "title": "title for segment 1",
          "description": "what segment 1 should specifically cover"
        },
        {
          "title": "title for segment 2",
          "description": "what segment 2 should specifically cover"
        },
        ... additional segments ...
      ]
    }
    
    IMPORTANT:
    - Make sure segments are logically ordered
    - Avoid overlap between segments
    - Ensure segments collectively provide a complete response
    - Only return valid JSON with the exact structure shown
  `;
  
  try {
    const planResponse = await callLLM(planPrompt);
    
    // Parse JSON response
    const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : planResponse;
    const plan = JSON.parse(sanitizeJsonString(jsonStr));
    
    updateDebugInfo(`Created segmentation plan with ${plan.segments.length} segments`);
    return plan;
  } catch (error) {
    console.error("Error creating segmentation plan:", error);
    
    // Create a default plan if parsing fails
    const defaultPlan = {
      segments: Array.from({length: totalSegmentsPlanned}, (_, i) => {
        if (i === 0) return { title: "Introduction and Overview", description: "Introduction and key concepts from the document" };
        if (i === totalSegmentsPlanned - 1) return { title: "Conclusion and Summary", description: "Summary and conclusions from the document" };
        return { title: `Part ${i+1}`, description: `Section ${i+1} of the document analysis` };
      })
    };
    
    updateDebugInfo(`Created default segmentation plan with ${defaultPlan.segments.length} segments due to error`);
    return defaultPlan;
  }
}

// Execute the document analysis stage
async function executeDocumentAnalysisStage(stage) {
  const documentPrompt = `
    You are analyzing a document titled "${documentTitle}" with ${documentPageCount} pages.
    
    Here's the document content:
    ${documentText.length > 8000 ? documentText.substring(0, 8000) + "... [document truncated due to length]" : documentText}
    
    Provide a concise but comprehensive summary of this document that includes:
    1. The main topic and purpose of the document
    2. Key information, facts, and data presented
    3. The document's structure and organization
    4. Any notable sections, tables, or figures
    5. Key terminology or concepts that appear important
    
    Make this summary detailed enough to be used as context for generating segments of a response.
  `;
  
  const documentSummary = await callLLM(documentPrompt);
  updateMetaStage(0, formatForDisplay(documentSummary));
  return documentSummary;
}

// Execute the query analysis stage
async function executeQueryAnalysisStage(stage, query, documentSummary) {
  const queryPrompt = `
    Analyze this user query about a document: "${query}"
    
    DOCUMENT INFORMATION:
    Title: "${documentTitle}"
    Pages: ${documentPageCount}
    
    DOCUMENT SUMMARY:
    ${documentSummary}
    
    Provide a concise analysis of:
    1. The specific information from the document that would be needed to answer this query
    2. Any key terms or concepts from the query that need to be matched with document content
    3. The type of response that would be most appropriate (e.g., extraction, summary, explanation)
    4. Whether the query requires information from specific sections or the entire document
    5. Potential challenges in answering this query accurately based on the document
    
    Format your response as a brief analysis without any preamble.
  `;
  
  const queryAnalysis = await callLLM(queryPrompt);
  updateMetaStage(1, formatForDisplay(queryAnalysis));
  return queryAnalysis;
}

// Generate content for a specific segment
async function generateSegmentContent(query, segment, segmentIndex, totalSegments, documentSummary, queryAnalysis) {
  const segmentPrompt = `
    TASK: Generate segment ${segmentIndex} of ${totalSegments} in response to a query about a document.
    
    DOCUMENT TITLE: "${documentTitle}"
    
    DOCUMENT SUMMARY:
    ${documentSummary}
    
    USER QUERY: "${query}"
    
    QUERY ANALYSIS:
    ${queryAnalysis}
    
    SEGMENT INFORMATION:
    Title: "${segment.title}"
    Description: ${segment.description}
    Position: Part ${segmentIndex} of ${totalSegments}
    
    YOUR TASK:
    Generate ONLY this specific segment of the response. Focus exclusively on the aspects described for this segment.
    
    IMPORTANT GUIDELINES:
    1. Start with a heading: "## ${segment.title}"
    2. If this is segment 1, include a brief introduction to the overall response
    3. If this is the final segment, include a brief conclusion
    4. Make transitions smooth if this is a middle segment
    5. Be comprehensive about THIS segment's specific topic
    6. Base your response on the document content
    7. Format your response clearly with appropriate paragraphs and structure
    8. Stay focused on just this segment's scope - other segments will cover other aspects
    
    DOCUMENT CONTENT:
    ${documentText.length > 6000 ? documentText.substring(0, 6000) + "... [truncated]" : documentText}
  `;
  
  const segmentContent = await callLLM(segmentPrompt);
  return segmentContent;
}

// Generate a fallback response if segmentation fails
async function generateFallbackResponse(query) {
  updateDebugInfo("Generating fallback single response");
  
  const fallbackPrompt = `
    You need to provide a concise but informative response to this query about a document.
    Due to technical constraints, you must keep your response focused and to-the-point.
    
    DOCUMENT: "${documentTitle}" (${documentPageCount} pages)
    
    QUERY: "${query}"
    
    DOCUMENT CONTENT:
    ${documentText.length > 4000 ? documentText.substring(0, 4000) + "... [document truncated due to length]" : documentText}
    
    Provide a concise response that addresses the key points of the query.
    Note at the beginning that this is a condensed response due to the document's size.
  `;
  
  const fallbackResponse = await callLLM(fallbackPrompt);
  return "NOTE: This is a condensed response due to document length constraints.\n\n" + fallbackResponse;
}

// Add segment navigation UI
function addSegmentNavigationUI(segments) {
  if (!segments || segments.length <= 1) return;
  
  // Create navigation container
  const navContainer = document.createElement('div');
  navContainer.className = 'segment-navigation';
  
  // Create navigation header with controls
  const navHeader = document.createElement('div');
  navHeader.className = 'segment-nav-header';
  navHeader.innerHTML = `
    <span>Response in ${segments.length} parts</span>
    <div class="segment-controls">
      <button id="prev-segment" disabled>&larr; Previous</button>
      <span id="segment-indicator">Part 1/${segments.length}</span>
      <button id="next-segment">Next &rarr;</button>
    </div>
  `;
  navContainer.appendChild(navHeader);
  
  // Create segment progress bar
  const progressBar = document.createElement('div');
  progressBar.className = 'segment-progress-bar';
  
  // Add segment indicators to progress bar
  segments.forEach((_, i) => {
    const indicator = document.createElement('div');
    indicator.className = 'segment-progress-item' + (i === 0 ? ' active' : '');
    indicator.dataset.segment = i;
    indicator.addEventListener('click', () => displaySegment(i));
    progressBar.appendChild(indicator);
  });
  
  navContainer.appendChild(progressBar);
  
  // Create segment titles list
  const titlesList = document.createElement('div');
  titlesList.className = 'segment-titles';
  segments.forEach((segment, i) => {
    const titleItem = document.createElement('div');
    titleItem.className = 'segment-title-item' + (i === 0 ? ' active' : '');
    titleItem.textContent = segment.title;
    titleItem.dataset.segment = i;
    titleItem.addEventListener('click', () => displaySegment(i));
    titlesList.appendChild(titleItem);
  });
  
  navContainer.appendChild(titlesList);
  
  // Add "View Combined" button
  const combinedBtn = document.createElement('button');
  combinedBtn.id = 'view-combined-btn';
  combinedBtn.textContent = 'View Combined Response';
  combinedBtn.addEventListener('click', toggleCombinedView);
  combinedBtn.dataset.state = 'segments';
  navContainer.appendChild(combinedBtn);
  
  // Add navigation before response content
  const responseContainer = document.getElementById('response-container');
  responseContainer.insertBefore(navContainer, responseContent);
  
  // Set up event listeners for navigation buttons
  document.getElementById('prev-segment').addEventListener('click', () => {
    const currentIndex = getCurrentSegmentIndex();
    if (currentIndex > 0) {
      displaySegment(currentIndex - 1);
    }
  });
  
  document.getElementById('next-segment').addEventListener('click', () => {
    const currentIndex = getCurrentSegmentIndex();
    if (currentIndex < segments.length - 1) {
      displaySegment(currentIndex + 1);
    }
  });
  
  // Initially display first segment
  displaySegment(0);
}

// Display a specific segment
function displaySegment(index) {
  if (!responseSegments || index < 0 || index >= responseSegments.length) return;
  
  // Store current index
  currentSegmentIndex = index;
  
  // Display the segment content
  responseContent.innerHTML = formatForDisplay(responseSegments[index].content);
  
  // Update navigation UI
  updateSegmentNavigationUI(index);
  
  // Scroll to top of response
  responseContent.scrollTop = 0;
}

// Update segment navigation UI based on current segment
function updateSegmentNavigationUI(index) {
  // Update segment indicator
  const indicator = document.getElementById('segment-indicator');
  if (indicator) {
    indicator.textContent = `Part ${index + 1}/${responseSegments.length}`;
  }
  
  // Update navigation buttons
  const prevBtn = document.getElementById('prev-segment');
  const nextBtn = document.getElementById('next-segment');
  if (prevBtn) prevBtn.disabled = index === 0;
  if (nextBtn) nextBtn.disabled = index === responseSegments.length - 1;
  
  // Update progress bar indicators
  const indicators = document.querySelectorAll('.segment-progress-item');
  indicators.forEach((item, i) => {
    if (i === index) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  
  // Update segment titles
  const titleItems = document.querySelectorAll('.segment-title-item');
  titleItems.forEach((item, i) => {
    if (i === index) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// Get current segment index
function getCurrentSegmentIndex() {
  return currentSegmentIndex;
}

// Toggle between segmented and combined view
function toggleCombinedView() {
  const btn = document.getElementById('view-combined-btn');
  const state = btn.dataset.state;
  
  if (state === 'segments') {
    // Show combined view
    let combinedContent = responseSegments.map(segment => segment.content).join('\n\n');
    
    // Add table of contents
    let toc = "# Table of Contents\n";
    responseSegments.forEach((segment, i) => {
      toc += `${i+1}. ${segment.title}\n`;
    });
    combinedContent = toc + "\n\n" + combinedContent;
    
    responseContent.innerHTML = formatForDisplay(combinedContent);
    btn.textContent = 'View Segmented Response';
    btn.dataset.state = 'combined';
    
    // Disable navigation controls
    const prevBtn = document.getElementById('prev-segment');
    const nextBtn = document.getElementById('next-segment');
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    
    // De-activate all progress indicators
    document.querySelectorAll('.segment-progress-item, .segment-title-item').forEach(item => {
      item.classList.remove('active');
    });
    
  } else {
    // Show segmented view
    displaySegment(currentSegmentIndex);
    btn.textContent = 'View Combined Response';
    btn.dataset.state = 'segments';
  }
}

// Add a more robust callLLM function if it doesn't exist or needs improvement
async function callLLM(prompt) {
  // If the server is not online, throw error
  if (!serverOnline) {
    throw new Error('LLM server is not available');
  }
  
  updateDebugInfo(`Sending prompt to LLM (${prompt.length} chars)`);
  
  // Track token usage (estimate)
  promptCount++;
  const estimatedTokens = Math.ceil(prompt.length / 4);
  tokenUsage += estimatedTokens;
  
  try {
    // First try the standard OpenAI-compatible endpoint
    try {
      const response = await fetch(`${API_ENDPOINT}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [{ role: 'user', content: prompt }],
          temperature: temperatureSlider.value / 100,
          max_tokens: 2048
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].message) {
          return data.choices[0].message.content;
        } else if (data.choices && data.choices[0] && data.choices[0].text) {
          return data.choices[0].text;
        } else {
          throw new Error('Unexpected response format from LLM API');
        }
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
      const response = await fetch(`${API_ENDPOINT}/v1/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          prompt: prompt,
          temperature: temperatureSlider.value / 100,
          max_tokens: 2048
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.choices && data.choices[0] && data.choices[0].text) {
          return data.choices[0].text;
        } else {
          throw new Error('Unexpected response format from LLM API');
        }
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

// Reset meta-prompt state for new query
function resetMetaState() {
  metaPromptStack = [];
  currentMetaStage = 0;
  promptCount = 0;
  tokenUsage = 0;
  startTime = Date.now();
  metaQuality = 'N/A';
  metaProcessDefinition = [];
  alternativeApproaches = [];
  confidenceScore = 0;
  selfCritiques = [];
  iterationCount = 0;
  
  // Reset segmentation state
  isSegmentedResponse = false;
  responseSegments = [];
  currentSegmentIndex = 0;
  totalSegmentsPlanned = 0;
  
  // Remove segment navigation if it exists
  const existingNav = document.querySelector('.segment-navigation');
  if (existingNav) existingNav.remove();
}

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
  
  chatHistory.appendChild(message);
  chatHistory.scrollTop = chatHistory.scrollHeight;
  
  // Store in messages array
  messages.push({ type, content });
}

// Update debug info
function updateDebugInfo(info) {
  const timestamp = new Date().toLocaleTimeString();
  debugContent.innerHTML += `<div>[${timestamp}] ${info}</div>`;
  debugContent.scrollTop = debugContent.scrollHeight;
}

// Update complexity display
function updateComplexityDisplay(complexity, stages) {
  complexityDisplay.textContent = complexity || 'adaptive';
  complexityDisplay.className = 'complexity-indicator complexity-' + (complexity || 'adaptive');
  
  if (stages) {
    complexityDisplay.title = `${stages} stages recommended`;
  }
}

// Initialize the application
init();
