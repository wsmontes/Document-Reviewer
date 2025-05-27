/**
 * Document Processor for handling various document types
 */
(function() {
  // State variables
  let documentText = '';
  let documentTitle = '';
  let documentPageCount = 0;
  let hasDocument = false;
  let loadedDocuments = []; // Array to store all loaded documents
  let currentDocumentIndex = 0; // Index of currently displayed document

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

  // Process file upload
  async function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    // Reset document variables for new upload
    loadedDocuments = [];
    DocumentReviewer.UI.updateDocumentStatus('Processing files...', 'warning');
    
    // Clear document content area
    DocumentReviewer.UI.clearDocumentContent();
    
    try {
      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        DocumentReviewer.UI.updateDocumentStatus(`Processing file ${i+1} of ${files.length}: ${file.name}`, 'warning');
        
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
        DocumentReviewer.UI.updateDocumentStatus(`${loadedDocuments.length} document(s) loaded successfully`, 'success');
        
        // Set current document to first loaded document
        currentDocumentIndex = 0;
        updateCurrentDocument(currentDocumentIndex);
        
        // Show document list if multiple documents were loaded
        if (loadedDocuments.length > 1) {
          renderDocumentsList();
          DocumentReviewer.UI.showDocumentsList();
        }
        
        // Update status
        hasDocument = true;
        
        // Update chat with document info
        if (loadedDocuments.length === 1) {
          DocumentReviewer.UI.addSystemMessage(`Document "${loadedDocuments[0].title}" loaded successfully.`);
        } else {
          DocumentReviewer.UI.addSystemMessage(`${loadedDocuments.length} documents loaded successfully.`);
        }
        
        // Update userInput placeholder
        DocumentReviewer.UI.updatePlaceholder("Ask a question about the document(s)...");
        
        // Show document view
        DocumentReviewer.UI.showDocumentView();
        
        // Log to debug
        DocumentReviewer.UI.updateDebugInfo(`Loaded ${loadedDocuments.length} document(s)`);
      } else {
        DocumentReviewer.UI.updateDocumentStatus('No valid documents found', 'error');
      }
    } catch (error) {
      console.error('Error processing files:', error);
      DocumentReviewer.UI.updateDocumentStatus(`Error: ${error.message || 'Failed to process files'}`, 'error');
      DocumentReviewer.UI.updateDebugInfo(`File processing error: ${error.message}`);
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
          DocumentReviewer.UI.updateDebugInfo(`Skipping unsupported file type: ${fileType} for ${file.name}`);
      }
    } catch (error) {
      DocumentReviewer.UI.updateDebugInfo(`Error processing file ${file.name}: ${error.message}`);
      throw error;
    }
  }

  // Handle ZIP files
  async function handleZipFile(file) {
    DocumentReviewer.UI.updateDebugInfo(`Processing ZIP file: ${file.name}`);
    
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
            DocumentReviewer.UI.updateDebugInfo(`Extracting ${fileName} from ZIP`);
            
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
      DocumentReviewer.UI.updateDebugInfo(`Processed ${filesProcessed} files from ZIP archive`);
      
    } catch (error) {
      console.error('Error processing ZIP file:', error);
      DocumentReviewer.UI.updateDebugInfo(`ZIP processing error: ${error.message}`);
      throw error;
    }
  }

  // Handle PDF files
  async function handlePdfFile(file) {
    DocumentReviewer.UI.updateDebugInfo(`Processing PDF: ${file.name}`);
    
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
    DocumentReviewer.UI.updateDebugInfo(`Processing Word document: ${file.name}`);
    
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
    DocumentReviewer.UI.updateDebugInfo(`Processing EPUB: ${file.name}`);
    
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
    DocumentReviewer.UI.updateDebugInfo(`Processing text file: ${file.name}`);
    
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
    DocumentReviewer.UI.updateDebugInfo(`Processing JSON file: ${file.name}`);
    
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
    DocumentReviewer.UI.updateDebugInfo(`Processing Excel file: ${file.name}`);
    
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
    DocumentReviewer.UI.updateDebugInfo(`Processing CSV file: ${file.name}`);
    
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
    document.getElementById('document-content').innerHTML = doc.content;
    
    // Update active document in the list
    const documentItems = document.querySelectorAll('.document-item');
    documentItems.forEach((item, i) => {
      item.classList.toggle('active', i === index);
    });
    
    DocumentReviewer.UI.updateDebugInfo(`Switched to document: ${doc.title}`);
  }

  // Toggle document view (expand/collapse)
  function toggleDocumentView() {
    const container = document.getElementById('document-view-container');
    const button = document.getElementById('toggle-document-btn');
    
    if (container.classList.contains('document-hidden')) {
      container.classList.remove('document-hidden');
      button.textContent = 'Hide';
    } else {
      container.classList.add('document-hidden');
      button.textContent = 'Show';
    }
  }

  function getCurrentDocument() {
    return {
      text: documentText,
      title: documentTitle,
      pageCount: documentPageCount,
      hasDocument: hasDocument
    };
  }

  // Ensure DocumentReviewer exists
  if (!window.DocumentReviewer) window.DocumentReviewer = {};

  // Export to namespace
  window.DocumentReviewer.DocumentProcessor = {
    handleFileUpload,
    toggleDocumentView,
    getCurrentDocument,
    updateCurrentDocument,
    renderDocumentsList
  };
})();
