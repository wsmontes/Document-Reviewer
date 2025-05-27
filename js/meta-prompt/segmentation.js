/**
 * Segmentation - Handles response segmentation for large documents
 */
(function() {
  // State variables
  let isSegmentedResponse = false;
  let responseSegments = [];
  let currentSegmentIndex = 0;
  let totalSegmentsPlanned = 0;
  let segmentationThreshold = 6000; // Default, will update from config

  // Reset segmentation state
  function reset() {
    isSegmentedResponse = false;
    responseSegments = [];
    currentSegmentIndex = 0;
    totalSegmentsPlanned = 0;
    
    // Remove segment navigation if it exists
    const existingNav = document.querySelector('.segment-navigation');
    if (existingNav) existingNav.remove();
  }

  // Analyze query to determine if it might need a segmented response
  async function determinePotentialResponseSize(query) {
    // Skip for small documents
    if (!window.DocumentReviewer || !window.DocumentReviewer.DocumentProcessor) {
      return { needs_segmentation: false, estimated_segments: 1 };
    }
    
    const doc = window.DocumentReviewer.DocumentProcessor.getCurrentDocument();
    
    // Skip for small documents
    if (doc.text && doc.text.length < 5000) {
      return { needs_segmentation: false, estimated_segments: 1 };
    }
    
    window.DocumentReviewer.UI.updateDebugInfo("Analyzing query for potential response size...");
    
    try {
      const analysisPrompt = `
        You will analyze a query about a document to determine if the response is likely to be very large.
        
        DOCUMENT INFO:
        Title: "${doc.title}"
        Pages: ${doc.pageCount}
        Size: ${doc.text.length} characters
        
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
      
      const analysis = await window.DocumentReviewer.APIService.callLLM(analysisPrompt);
      
      try {
        // Extract and parse JSON response
        const jsonMatch = analysis.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : analysis;
        const parsedAnalysis = JSON.parse(window.DocumentReviewer.Helpers.sanitizeJsonString(jsonStr));
        
        isSegmentedResponse = parsedAnalysis.needs_segmentation === true;
        totalSegmentsPlanned = parsedAnalysis.estimated_segments || 1;
        
        if (isSegmentedResponse) {
          window.DocumentReviewer.UI.updateDebugInfo(`Response size analysis: Likely needs segmentation into ${totalSegmentsPlanned} parts`);
          window.DocumentReviewer.UI.updateDebugInfo(`Reasoning: ${parsedAnalysis.reasoning}`);
        } else {
          window.DocumentReviewer.UI.updateDebugInfo("Response size analysis: Single response should be sufficient");
        }
        
        return parsedAnalysis;
      } catch (error) {
        console.error("Error parsing response size analysis:", error);
        window.DocumentReviewer.UI.updateDebugInfo("Error in size analysis, proceeding with standard approach");
        return { needs_segmentation: false, estimated_segments: 1 };
      }
    } catch (error) {
      console.error("Error determining response size:", error);
      window.DocumentReviewer.UI.updateDebugInfo("Error in response size check, proceeding with standard approach");
      return { needs_segmentation: false, estimated_segments: 1 };
    }
  }

  // Generate a segmented response
  async function generateSegmentedResponse(query, stages) {
    window.DocumentReviewer.UI.updateDebugInfo(`Generating segmented response with ${totalSegmentsPlanned} planned segments`);
    
    try {
      // First, analyze document to create a shared context across segments
      const documentAnalysisStage = { 
        id: "doc-analyze", 
        title: "Analyze Document", 
        description: "Extracting key information and understanding the document content" 
      };
      
      window.DocumentReviewer.UI.updateMetaStage(0, `Executing ${documentAnalysisStage.title}...`);
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
      window.DocumentReviewer.UI.updateMetaStage(1, `Executing ${queryAnalysisStage.title}...`);
      const queryAnalysis = await executeQueryAnalysisStage(queryAnalysisStage, query, documentSummary);
      
      // Generate each segment
      for (let i = 0; i < segmentationPlan.segments.length; i++) {
        const segment = segmentationPlan.segments[i];
        window.DocumentReviewer.UI.updateDebugInfo(`Generating segment ${i+1}/${segmentationPlan.segments.length}: ${segment.title}`);
        window.DocumentReviewer.UI.updateMetaStage(2, `Generating segment ${i+1}/${segmentationPlan.segments.length}: ${segment.title}`);
        
        // Progress update in UI
        const determinationBar = document.getElementById('determination-bar');
        if (determinationBar) {
          determinationBar.style.width = `${Math.round(((i+1) / segmentationPlan.segments.length) * 100)}%`;
        }
        
        const segmentContent = await generateSegmentContent(query, segment, i+1, segmentationPlan.segments.length, documentSummary, queryAnalysis);
        
        responseSegments.push({
          title: segment.title,
          content: segmentContent,
          index: i+1,
          total: segmentationPlan.segments.length
        });
        
        // Update UI with progress
        const responseContent = document.getElementById('response-content');
        if (responseContent) {
          if (i === 0) {
            // First segment - add to content area
            responseContent.innerHTML = window.DocumentReviewer.Helpers.formatForDisplay(segmentContent);
          } else {
            // Show progress in content area
            responseContent.innerHTML += `<div class="segment-progress">Segment ${i+1}/${segmentationPlan.segments.length} generated</div>`;
          }
        }
      }
      
      // Display segment navigation
      addSegmentNavigationUI(responseSegments);
      
      // Display first segment 
      displaySegment(0);
      
      // Add a shortened version to the chat
      const doc = window.DocumentReviewer.DocumentProcessor.getCurrentDocument();
      const combinedSummary = `I've analyzed "${doc.title}" and prepared a response in ${responseSegments.length} segments.\n\n` +
                            `Table of Contents:\n` + 
                            responseSegments.map((s, i) => `${i+1}. ${s.title}`).join('\n');
      
      window.DocumentReviewer.UI.addAIMessage(combinedSummary);
      
      return {
        segmented: true,
        segmentCount: responseSegments.length
      };
    } catch (error) {
      console.error("Error generating segmented response:", error);
      window.DocumentReviewer.UI.updateDebugInfo("Error in segmented response generation, falling back to simpler approach");
      
      // Fallback to simpler response if segmentation fails
      const fallbackResponse = await generateFallbackResponse(query);
      const responseContent = document.getElementById('response-content');
      if (responseContent) {
        responseContent.innerHTML = window.DocumentReviewer.Helpers.formatForDisplay(fallbackResponse);
      }
      window.DocumentReviewer.UI.addAIMessage(fallbackResponse);
      
      return {
        segmented: false,
        error: error.message
      };
    }
  }

  // Create a plan for how to segment the response
  async function createSegmentationPlan(query, documentSummary) {
    window.DocumentReviewer.UI.updateDebugInfo("Creating segmentation plan...");
    
    const doc = window.DocumentReviewer.DocumentProcessor.getCurrentDocument();
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
      const planResponse = await window.DocumentReviewer.APIService.callLLM(planPrompt);
      
      // Parse JSON response
      const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : planResponse;
      const sanitizedJsonStr = window.DocumentReviewer.Helpers.sanitizeJsonString(jsonStr);
      const plan = JSON.parse(sanitizedJsonStr);
      
      // Validate the plan structure
      if (!plan || !plan.segments || !Array.isArray(plan.segments) || plan.segments.length === 0) {
        throw new Error("Invalid segmentation plan format");
      }
      
      window.DocumentReviewer.UI.updateDebugInfo(`Created segmentation plan with ${plan.segments.length} segments`);
      return plan;
    } catch (error) {
      console.error("Error creating segmentation plan:", error);
      
      // Create a default plan if parsing fails
      const defaultPlan = {
        segments: []
      };
      
      // Generate segments based on the planned total
      for (let i = 0; i < totalSegmentsPlanned; i++) {
        if (i === 0) {
          defaultPlan.segments.push({ 
            title: "Introduction and Overview", 
            description: "Introduction and key concepts from the document" 
          });
        } else if (i === totalSegmentsPlanned - 1) {
          defaultPlan.segments.push({ 
            title: "Conclusion and Summary", 
            description: "Summary and conclusions from the document" 
          });
        } else {
          defaultPlan.segments.push({ 
            title: `Part ${i+1}`, 
            description: `Section ${i+1} of the document analysis` 
          });
        }
      }
      
      window.DocumentReviewer.UI.updateDebugInfo(`Created default segmentation plan with ${defaultPlan.segments.length} segments due to error`);
      return defaultPlan;
    }
  }

  // Execute the document analysis stage
  async function executeDocumentAnalysisStage(stage) {
    const doc = window.DocumentReviewer.DocumentProcessor.getCurrentDocument();
    const documentPrompt = `
      You are analyzing a document titled "${doc.title}" with ${doc.pageCount} pages.
      
      Here's the document content:
      ${doc.text.length > 8000 ? doc.text.substring(0, 8000) + "... [document truncated due to length]" : doc.text}
      
      Provide a concise but comprehensive summary of this document that includes:
      1. The main topic and purpose of the document
      2. Key information, facts, and data presented
      3. The document's structure and organization
      4. Any notable sections, tables, or figures
      5. Key terminology or concepts that appear important
      
      Make this summary detailed enough to be used as context for generating segments of a response.
    `;
    
    const documentSummary = await window.DocumentReviewer.APIService.callLLM(documentPrompt);
    window.DocumentReviewer.UI.updateMetaStage(0, window.DocumentReviewer.Helpers.formatForDisplay(documentSummary));
    return documentSummary;
  }

  // Execute the query analysis stage
  async function executeQueryAnalysisStage(stage, query, documentSummary) {
    const doc = window.DocumentReviewer.DocumentProcessor.getCurrentDocument();
    const queryPrompt = `
      Analyze this user query about a document: "${query}"
      
      DOCUMENT INFORMATION:
      Title: "${doc.title}"
      Pages: ${doc.pageCount}
      
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
    
    const queryAnalysis = await window.DocumentReviewer.APIService.callLLM(queryPrompt);
    window.DocumentReviewer.UI.updateMetaStage(1, window.DocumentReviewer.Helpers.formatForDisplay(queryAnalysis));
    return queryAnalysis;
  }

  // Generate content for a specific segment
  async function generateSegmentContent(query, segment, segmentIndex, totalSegments, documentSummary, queryAnalysis) {
    const doc = window.DocumentReviewer.DocumentProcessor.getCurrentDocument();
    const segmentPrompt = `
      TASK: Generate segment ${segmentIndex} of ${totalSegments} in response to a query about a document.
      
      DOCUMENT TITLE: "${doc.title}"
      
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
      ${doc.text.length > 6000 ? doc.text.substring(0, 6000) + "... [truncated]" : doc.text}
    `;
    
    const segmentContent = await window.DocumentReviewer.APIService.callLLM(segmentPrompt);
    return segmentContent;
  }

  // Generate a fallback response if segmentation fails
  async function generateFallbackResponse(query) {
    window.DocumentReviewer.UI.updateDebugInfo("Generating fallback single response");
    
    const doc = window.DocumentReviewer.DocumentProcessor.getCurrentDocument();
    const fallbackPrompt = `
      You need to provide a concise but informative response to this query about a document.
      Due to technical constraints, you must keep your response focused and to-the-point.
      
      DOCUMENT: "${doc.title}" (${doc.pageCount} pages)
      
      QUERY: "${query}"
      
      DOCUMENT CONTENT:
      ${doc.text.length > 4000 ? doc.text.substring(0, 4000) + "... [document truncated due to length]" : doc.text}
      
      Provide a concise response that addresses the key points of the query.
      Note at the beginning that this is a condensed response due to the document's size.
    `;
    
    const fallbackResponse = await window.DocumentReviewer.APIService.callLLM(fallbackPrompt);
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
    responseContainer.insertBefore(navContainer, document.getElementById('response-content'));
    
    // Set up event listeners for navigation buttons
    document.getElementById('prev-segment').addEventListener('click', () => {
      if (currentSegmentIndex > 0) {
        displaySegment(currentSegmentIndex - 1);
      }
    });
    
    document.getElementById('next-segment').addEventListener('click', () => {
      if (currentSegmentIndex < segments.length - 1) {
        displaySegment(currentSegmentIndex + 1);
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
    const responseContent = document.getElementById('response-content');
    if (responseContent) {
      responseContent.innerHTML = window.DocumentReviewer.Helpers.formatForDisplay(responseSegments[index].content);
      
      // Scroll to top of response
      responseContent.scrollTop = 0;
    }
    
    // Update navigation UI
    updateSegmentNavigationUI(index);
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
      
      const responseContent = document.getElementById('response-content');
      if (responseContent) {
        responseContent.innerHTML = window.DocumentReviewer.Helpers.formatForDisplay(combinedContent);
      }
      
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

  // State accessors
  function getResponseSegments() {
    return responseSegments;
  }

  function isSegmented() {
    return isSegmentedResponse;
  }

  function getTotalSegmentsPlanned() {
    return totalSegmentsPlanned;
  }
  
  // Init function to set config values
  function init() {
    if (window.DocumentReviewer && window.DocumentReviewer.Config) {
      segmentationThreshold = window.DocumentReviewer.Config.get('SEGMENTATION_THRESHOLD') || 6000;
    }
  }

  // Ensure DocumentReviewer exists
  if (!window.DocumentReviewer) window.DocumentReviewer = {};

  // Export to namespace
  window.DocumentReviewer.Segmentation = {
    reset,
    init,
    determinePotentialResponseSize,
    generateSegmentedResponse,
    displaySegment,
    toggleCombinedView,
    getResponseSegments,
    isSegmentedResponse: isSegmented,
    getTotalSegmentsPlanned
  };
})();
