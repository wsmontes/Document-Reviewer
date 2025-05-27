/**
 * Meta-Prompt Engine - Core meta-prompting functionality
 */
(function() {
  // State variables
  let metaPromptStack = [];
  let currentMetaStage = 0;
  let startTime = 0;
  let alternativeApproaches = [];
  let selfCritiques = [];
  let iterationCount = 0;
  let determinationLevel = 5; // Set to maximum by default - system will adapt as needed
  let confidenceScore = 0;
  let metaQuality = 'N/A';

  // Set determination level - enhanced to handle automatic determination
  function setDeterminationLevel(level) {
    // If level is "auto" (0) or max value, set to maximum and let LLM decide
    if (level === 0 || level === 5) {
      determinationLevel = 5; // Maximum value
      DocumentReviewer.UI.updateDebugInfo("Determination level set to automatic (no limits)");
    } else {
      determinationLevel = level;
      DocumentReviewer.UI.updateDebugInfo(`Determination level set to ${level}`);
    }
  }

  // Reset meta-prompt state
  function resetMetaState() {
    metaPromptStack = [];
    currentMetaStage = 0;
    startTime = Date.now();
    alternativeApproaches = [];
    selfCritiques = [];
    iterationCount = 0;
    confidenceScore = 0;
    metaQuality = 'N/A';
    
    // Reset API counters
    DocumentReviewer.APIService.resetCounters();
    
    // Reset segmentation state
    DocumentReviewer.Segmentation.reset();
    
    // Remove segment navigation if it exists
    const existingNav = document.querySelector('.segment-navigation');
    if (existingNav) existingNav.remove();
  }

  // Process user query with improved prompts for self-determination
  async function processQuery(query) {
    // Reset state for new query
    resetMetaState();
    
    try {
      // Pre-analyze to determine if segmentation might be needed
      await DocumentReviewer.Segmentation.determinePotentialResponseSize(query);
      
      // Start the meta-prompt process
      await executeMetaPromptProcess(query);
      return true;
    } catch (error) {
      console.error('Error during meta-prompt process:', error);
      DocumentReviewer.UI.addSystemMessage(`Error: ${error.message || 'An error occurred during processing'}`);
      DocumentReviewer.UI.updateDebugInfo(`Error: ${error.message || 'Unknown error'}`);
      return false;
    }
  }

  // Execute meta prompt process with enhanced self-determination
  async function executeMetaPromptProcess(query) {
    // Start the timer
    startTime = Date.now();
    
    // First, analyze query complexity to determine the optimal meta-depth
    DocumentReviewer.UI.updateDebugInfo("Analyzing query complexity...");
    
    try {
      // Get document info
      const doc = DocumentReviewer.DocumentProcessor.getCurrentDocument();
      
      // Enhanced prompt to encourage LLM autonomy and agent creation
      const complexityAnalysis = await DocumentReviewer.APIService.callLLM(`
        You are an advanced reasoning system that can freely decide the optimal approach to solve problems.
        
        Analyze this query about the document to determine its complexity level and the optimal approach:
        
        "${query}"
        
        Consider factors like:
        1. Ambiguity and clarity
        2. Technical complexity
        3. Number of sub-questions or components
        4. Domain knowledge requirements
        5. Need for reasoning versus factual recall
        
        The query is about a document titled "${doc.title}" with ${doc.pageCount} pages.
        
        You have access to specialized agents that can help with specific parts of this task:
        - Writer agents (specialized in creating clear, engaging content)
        - Reviewer agents (specialized in reviewing content for accuracy and completeness)
        - Critic agents (specialized in finding weaknesses in arguments)
        - Evaluator agents (specialized in objective quality assessment)
        - Researcher agents (specialized in gathering relevant information)
        - Questioner agents (specialized in asking probing questions)
        - Planner agents (specialized in planning complex analytical approaches)
        - Agent Factory (specialized in creating new custom agents when needed)
        
        IMPORTANT: You have full autonomy to determine the optimal complexity level, number of stages, and whether to use specialized agents.
        
        Return your analysis in the following JSON format without any other text:
        {
          "complexity": "low|medium|high|very_high",
          "optimal_stages": [number between 2 and 10],
          "reasoning": "[brief explanation of your assessment]",
          "suggested_approach": "[brief description of recommended meta-prompting strategy]",
          "use_specialized_agents": true/false,
          "recommended_agents": [
            {"type": "agent type", "purpose": "what this agent will do"}
          ]
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
        const sanitizedJsonStr = DocumentReviewer.Helpers.sanitizeJsonString(jsonStr);
        complexityData = JSON.parse(sanitizedJsonStr);
        
        DocumentReviewer.UI.updateDebugInfo(`Complexity analysis: ${complexityData.complexity}, ${complexityData.optimal_stages} stages`);
        DocumentReviewer.UI.updateComplexityDisplay(complexityData.complexity, complexityData.optimal_stages);
        
        // Check if agents are recommended and auto mode is enabled
        if (complexityData.use_specialized_agents && 
            window.DocumentReviewer.AgentManager && 
            window.DocumentReviewer.AgentManager.isAutoModeEnabled()) {
          DocumentReviewer.UI.updateDebugInfo(`Agent usage recommended: ${complexityData.recommended_agents?.length || 'unspecified'} agents`);
          
          // Create a multi-agent approach with auto agent selection
          return await executeMultiAgentApproach(query, complexityData, true);
        } else if (complexityData.use_specialized_agents && 
                  window.DocumentReviewer.AgentManager) {
          // Use agent approach but with manual selection
          return await executeMultiAgentApproach(query, complexityData, false);
        }
      } catch (jsonError) {
        console.error("Failed to parse complexity analysis:", jsonError);
        DocumentReviewer.UI.updateDebugInfo("Failed to parse complexity analysis, using default approach");
        
        // Default values if parsing fails
        complexityData = {
          complexity: "medium",
          optimal_stages: 3,
          reasoning: "Using default approach due to analysis error",
          suggested_approach: "Standard multi-stage approach with query analysis, meta-prompt, and response generation",
          use_specialized_agents: false
        };
        
        DocumentReviewer.UI.updateComplexityDisplay(complexityData.complexity, complexityData.optimal_stages);
      }
      
      // Generate the optimal meta-process stages with unlimited flexibility
      const stageDefinition = await DocumentReviewer.APIService.callLLM(`
        Based on your analysis of the query complexity (${complexityData.complexity}) and optimal number of stages (${complexityData.optimal_stages}),
        create an optimized meta-prompting workflow with exactly ${complexityData.optimal_stages} distinct stages.
        
        You have complete freedom to design the most effective workflow. There are no artificial constraints.
        
        The workflow should be tailored to best answer this query about a document: "${query}"
        
        The document is titled "${doc.title}" and has ${doc.pageCount} pages.
        
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
        
        Make sure your workflow includes all necessary stages for complete and accurate response.
      `);
      
      // Parse the stage definition
      let stageData;
      let metaProcessDefinition;
      try {
        // Extract JSON from potential text response
        const jsonMatch = stageDefinition.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : stageDefinition;
        
        // Sanitize the JSON string before parsing
        const sanitizedJsonStr = DocumentReviewer.Helpers.sanitizeJsonString(jsonStr);
        stageData = JSON.parse(sanitizedJsonStr);
        
        metaProcessDefinition = stageData.stages;
        DocumentReviewer.UI.updateDebugInfo(`Generated ${metaProcessDefinition.length} meta-process stages`);
      } catch (jsonError) {
        console.error("Failed to parse stage definition:", jsonError);
        DocumentReviewer.UI.updateDebugInfo("Failed to parse stage definition, using default stages");
        
        // Create default stages that include document analysis if parsing fails
        metaProcessDefinition = [
          { id: "doc-analyze", title: "Analyze Document", description: "Extracting key information and understanding the document content" },
          { id: "query-analyze", title: "Analyze Query", description: "Understanding the user query in context of the document" },
          { id: "generate-meta", title: "Generate Meta-Prompt", description: "Creating a specialized prompt to guide the response based on document content" },
          { id: "response", title: "Generate Response", description: "Creating the final response using the meta-prompt and document information" }
        ];
      }
      
      // Update UI with stages
      DocumentReviewer.UI.setMetaProcessDefinition(metaProcessDefinition);
      DocumentReviewer.UI.renderMetaProcessStages();
      
      // Handle either standard or segmented response generation
      if (DocumentReviewer.Segmentation.isSegmentedResponse() && DocumentReviewer.Segmentation.getTotalSegmentsPlanned() > 1) {
        await DocumentReviewer.Segmentation.generateSegmentedResponse(query, metaProcessDefinition);
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
        confidenceScore = bestConfidence;
        metaQuality = bestQuality;
        
        DocumentReviewer.UI.updateConfidenceDisplay(bestConfidence);
        
        // If confidence is low and determination is high, try alternative approaches
        if (bestConfidence < 0.8 && determinationLevel >= 3) {
          // Add self-critique to understand what could be improved
          const critique = await generateSelfCritique(query, bestResponse, bestMetaPrompt);
          selfCritiques.push(critique);
          
          // Add self-critique to UI
          try {
            await addSelfCritiqueToUI(critique);
          } catch (uiError) {
            console.error("Error displaying self-critique in UI:", uiError);
            DocumentReviewer.UI.updateDebugInfo("Self-critique generated but couldn't be displayed in UI");
          }
          
          // Generate alternative approaches based on self-critique
          try {
            await generateAlternativeApproaches(query, critique, bestResponse);
          } catch (approachError) {
            console.error("Error generating alternative approaches:", approachError);
            DocumentReviewer.UI.updateDebugInfo("Failed to generate alternative approaches");
          }
          
          // Try the alternative approaches if confidence is still low or determination is very high
          let iterationsToTry = determinationLevel - 2;
          for (let i = 0; i < Math.min(alternativeApproaches.length, iterationsToTry); i++) {
            if (bestConfidence >= 0.9) break; // Stop if we already have high confidence
            
            iterationCount++;
            DocumentReviewer.UI.updateDebugInfo(`Trying alternative approach ${i+1}/${alternativeApproaches.length}`);
            
            // Update determination progress
            DocumentReviewer.UI.updateDeterminationProgress((iterationCount / iterationsToTry) * 100);
            
            // Try the alternative approach
            const altResults = await executeAlternativeApproach(query, alternativeApproaches[i]);
            
            // If this approach produces better results, update our best response
            if ((altResults.confidence > bestConfidence) || 
                (altResults.confidence >= bestConfidence && parseFloat(altResults.quality) > bestQuality)) {
                
              bestResponse = altResults.finalResponse;
              bestConfidence = altResults.confidence;
              bestQuality = parseFloat(altResults.quality);
              bestMetaPrompt = alternativeApproaches[i].prompt;
              confidenceScore = bestConfidence;
              metaQuality = bestQuality;
              
              DocumentReviewer.UI.updateConfidenceDisplay(bestConfidence);
              DocumentReviewer.UI.updateDebugInfo(`Found better approach with confidence ${bestConfidence.toFixed(2)}`);
            }
          }
        }
      }
      
      // Complete meta process
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      DocumentReviewer.UI.updateProcessTime(elapsedTime);
      
      // Update UI stats
      const apiState = DocumentReviewer.APIService.getState();
      DocumentReviewer.UI.updateStats(apiState.promptCount, apiState.tokenUsage, metaQuality);
      
    } catch (error) {
      console.error("Error executing meta-prompt process:", error);
      throw error;
    }
  }

  /**
   * Enhanced multi-agent approach with option for automatic agent selection
   */
  async function executeMultiAgentApproach(query, complexityData, useAutoAgents = false) {
    DocumentReviewer.UI.updateDebugInfo(`Executing ${useAutoAgents ? 'automatic' : 'manual'} multi-agent approach`);
    
    try {
      // Set up meta process stages
      const metaProcessDefinition = [
        { id: "agent-selection", title: "Agent Selection", description: "Selecting specialized agents for this query" },
        { id: "agent-execution", title: "Agent Execution", description: "Executing specialized agent tasks" },
        { id: "response-synthesis", title: "Response Synthesis", description: "Synthesizing agent outputs into a final response" }
      ];
      
      DocumentReviewer.UI.setMetaProcessDefinition(metaProcessDefinition);
      DocumentReviewer.UI.renderMetaProcessStages();
      DocumentReviewer.UI.updateMetaStage(0, "Selecting agents...");
      
      let result;
      
      if (useAutoAgents) {
        // Use the automatic agent selection and execution process
        const taskDescription = `Analyze document "${DocumentReviewer.DocumentProcessor.getCurrentDocument().title}" to answer: ${query}`;
        
        DocumentReviewer.UI.updateDebugInfo("Using automated agent selection");
        
        // Update stage with auto selection info
        DocumentReviewer.UI.updateMetaStage(0, "Automatically analyzing task and selecting optimal agents...", false);
        
        try {
          // Run the automated process
          result = await DocumentReviewer.AgentManager.runAutoAgentProcess(
            taskDescription,
            { query }
          );
          
          // Mark selection stage as complete
          const agentCount = result.contributors ? result.contributors.length : 'unknown number of';
          DocumentReviewer.UI.updateMetaStage(0, `Selected ${agentCount} specialized agents automatically`, true);
        } catch (agentError) {
          // Handle agent error and provide fallback response
          console.error("Auto agent process failed:", agentError);
          DocumentReviewer.UI.updateMetaStage(0, `Agent selection failed: ${agentError.message}`, true);
          
          // Create fallback response
          const fallbackResponse = await createFallbackResponse(query);
          
          // Mark stages as completed
          DocumentReviewer.UI.updateMetaStage(1, "Using direct query approach due to agent error", true);
          DocumentReviewer.UI.updateMetaStage(2, "Generated fallback response", true);
          
          // Display the fallback response
          DocumentReviewer.UI.displayResponse(fallbackResponse);
          DocumentReviewer.UI.addAIMessage(fallbackResponse);
          
          // Return success to avoid further error handling
          return true;
        }
      } else {
        // Create a planner agent first
        const planner = DocumentReviewer.AgentManager.createAgent('planner', {
          name: "Process Coordinator",
          specialization: `Planning for ${complexityData.complexity} complexity ${query.length > 20 ? query.substring(0, 20) + '...' : query}`
        });
        
        // Ask the planner to design the agent team based on the initial recommendations
        const planningRequest = `
          Based on this query: "${query}"
          
          And the initial complexity analysis:
          - Complexity: ${complexityData.complexity}
          - Optimal stages: ${complexityData.optimal_stages}
          - Reasoning: ${complexityData.reasoning}
          
          Design an optimal team of agents to handle this task.
          
          ${complexityData.recommended_agents && complexityData.recommended_agents.length > 0 ? 
            `Initial agent recommendations:
            ${complexityData.recommended_agents.map(agent => 
              `- ${agent.type} for ${agent.purpose}`
            ).join('\n')}` : 
            ''}
          
          For each agent, specify:
          1. The exact type of agent
          2. A specialized name for the agent
          3. The specific tasks/responsibilities for this agent
          4. How the agent will interact with other agents
          
          Be strategic in your planning - don't just create agents for the sake of it, but ensure each agent has a distinct, valuable role.
        `;
        
        // Send the planning request to the planner agent
        const planningResult = await DocumentReviewer.AgentManager.sendTaskToAgent(
          planner.id, 
          planningRequest, 
          { query }
        );
        
        // Update the planning stage with the result
        DocumentReviewer.UI.updateMetaStage(0, `${planningResult.response}`, true);
        
        // Continue with existing agent creation from planner results
        // ... existing code for extracting agent data and creating agents ...
      }
      
      // Mark execution stage as completed
      DocumentReviewer.UI.updateMetaStage(1, "Agent tasks completed", true);
      
      // Update synthesis stage with result
      const synthesisResult = result && result.synthesis ? result.synthesis : "Agents completed their analysis but no synthesis was generated.";
      DocumentReviewer.UI.updateMetaStage(2, synthesisResult, true);
      
      // Display the final response in the response area
      DocumentReviewer.UI.displayResponse(synthesisResult);
      
      // Add the response as an AI message
      DocumentReviewer.UI.addAIMessage(synthesisResult);
      
      // Complete meta process
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      DocumentReviewer.UI.updateProcessTime(elapsedTime);
      
      // Update UI stats
      const apiState = DocumentReviewer.APIService.getState();
      DocumentReviewer.UI.updateStats(apiState.promptCount, apiState.tokenUsage);
      
      return true;
    } catch (error) {
      console.error("Error in multi-agent approach:", error);
      DocumentReviewer.UI.updateDebugInfo(`Multi-agent approach error: ${error.message}`);
      
      // Return false to signal that we should fall back to standard approach
      return false;
    }
  }
  
  /**
   * Create a fallback response when the agent approach fails
   */
  async function createFallbackResponse(query) {
    DocumentReviewer.UI.updateDebugInfo("Creating fallback response without agents");
    
    try {
      const doc = DocumentReviewer.DocumentProcessor.getCurrentDocument();
      
      const prompt = `
        I need you to analyze this document and answer a question about it directly.
        
        DOCUMENT TITLE: "${doc.title}"
        
        DOCUMENT CONTENT:
        ${doc.text.length > 6000 ? doc.text.substring(0, 6000) + "... [truncated for length]" : doc.text}
        
        USER QUERY: "${query}"
        
        Please provide a comprehensive, well-structured response to the query.
        Begin by addressing the core question, then provide relevant details from the document.
        Include specific information from the document to support your points.
      `;
      
      const response = await DocumentReviewer.APIService.callLLM(prompt);
      return response;
    } catch (error) {
      console.error("Error creating fallback response:", error);
      return "I apologize, but I encountered an error analyzing the document. Please try again or rephrase your query.";
    }
  }
  
  // Execute the meta stages
  async function executeMetaStages(query, stages) {
    DocumentReviewer.UI.updateDebugInfo("Executing meta stages...");
    let finalResponse = "";
    let confidence = 0.7;
    let quality = 7;
    
    // Get document info
    const doc = DocumentReviewer.DocumentProcessor.getCurrentDocument();
    
    // Execute each stage
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      DocumentReviewer.UI.updateDebugInfo(`Executing stage ${i+1}/${stages.length}: ${stage.title}`);
      DocumentReviewer.UI.updateMetaStage(i, `Processing ${stage.title}...`);
      
      // Prepare the prompt based on stage
      let stagePrompt = "";
      
      if (i === 0) {
        // Document analysis stage
        stagePrompt = `
          Analyze this document:
          Title: "${doc.title}"
          Content: 
          ${doc.text.length > 6000 ? doc.text.substring(0, 6000) + "... [truncated]" : doc.text}
          
          Provide a concise analysis focusing on key information related to: "${query}"
        `;
      } else if (i === stages.length - 1) {
        // Final response generation stage
        stagePrompt = `
          Generate a comprehensive response to this query about a document:
          
          QUERY: "${query}"
          
          DOCUMENT TITLE: "${doc.title}"
          
          Use the following analysis to inform your response:
          ${metaPromptStack.join('\n\n')}
          
          DOCUMENT CONTENT:
          ${doc.text.length > 6000 ? doc.text.substring(0, 6000) + "... [truncated]" : doc.text}
          
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
          
          DOCUMENT TITLE: "${doc.title}"
          
          PREVIOUS ANALYSIS:
          ${metaPromptStack.join('\n\n')}
          
          DOCUMENT CONTENT:
          ${doc.text.length > 6000 ? doc.text.substring(0, 6000) + "... [truncated]" : doc.text}
          
          Provide your ${stage.title.toLowerCase()} focusing on answering the query.
        `;
      }
      
      try {
        // Call LLM with this stage's prompt
        const stageResponse = await DocumentReviewer.APIService.callLLM(stagePrompt);
        
        // Add to meta prompt stack
        metaPromptStack.push(stageResponse);
        
        // Update UI
        DocumentReviewer.UI.updateMetaStage(i, DocumentReviewer.Helpers.formatForDisplay(stageResponse), true);
        
        // If final stage, this is our response
        if (i === stages.length - 1) {
          finalResponse = stageResponse;
          DocumentReviewer.UI.displayResponse(finalResponse);
          DocumentReviewer.UI.addAIMessage(finalResponse);
          
          // Generate a quality assessment for this response
          const qualityAssessment = await estimateResponseQuality(query, finalResponse);
          quality = qualityAssessment.quality || 7;
          confidence = qualityAssessment.confidence || 0.7;
        }
      } catch (error) {
        console.error(`Error in stage ${i+1}:`, error);
        DocumentReviewer.UI.updateDebugInfo(`Error in stage ${stage.title}: ${error.message}`);
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

  // Estimate the quality of a response
  async function estimateResponseQuality(query, response) {
    try {
      const qualityPrompt = `
        You are evaluating the quality of a response to a query.
        
        QUERY: "${query}"
        
        RESPONSE:
        ${response}
        
        Evaluate this response on a scale of 1-10 and provide a confidence score.
        Return only a JSON object in this format:
        {
          "quality": [number between 1-10],
          "confidence": [number between 0-1]
        }
      `;
      
      const qualityResponse = await DocumentReviewer.APIService.callLLM(qualityPrompt);
      
      try {
        // Extract JSON from potential text response
        const jsonMatch = qualityResponse.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : qualityResponse;
        
        // Sanitize the JSON string before parsing
        const sanitizedJsonStr = DocumentReviewer.Helpers.sanitizeJsonString(jsonStr);
        return JSON.parse(sanitizedJsonStr);
      } catch (error) {
        console.error("Error parsing quality assessment:", error);
        return { quality: 7, confidence: 0.7 };
      }
    } catch (error) {
      console.error("Error estimating response quality:", error);
      return { quality: 7, confidence: 0.7 };
    }
  }

  // Generate self-critique
  async function generateSelfCritique(query, response, metaPrompt) {
    DocumentReviewer.UI.updateDebugInfo("Generating self-critique...");
    
    try {
      const critiqueTxt = await DocumentReviewer.APIService.callLLM(`
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
        
        // Sanitize the JSON string before parsing
        const sanitizedJsonStr = DocumentReviewer.Helpers.sanitizeJsonString(jsonStr);
        
        const critique = JSON.parse(sanitizedJsonStr);
        
        // Update confidence display
        DocumentReviewer.UI.updateConfidenceDisplay(parseFloat(critique.confidence_score) || 0.5);
        
        return critique;
      } catch (jsonError) {
        console.error("Failed to parse critique:", jsonError);
        
        // Create a default critique object as fallback
        const fallbackCritique = {
          rating: 6,
          confidence_score: 0.5,
          strengths: ["Addressed the query"],
          weaknesses: ["Could be more comprehensive", "JSON parsing error occurred"],
          improvement_suggestions: ["Consider alternative perspectives", "Provide more structured response"],
          overall_assessment: "Response is adequate but could be improved. Note: This is a fallback assessment due to JSON parsing error."
        };
        
        DocumentReviewer.UI.updateConfidenceDisplay(0.5);
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
      
      DocumentReviewer.UI.updateConfidenceDisplay(0.5);
      return errorCritique;
    }
  }

  // Add self-critique to UI
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

  // Generate alternative approaches
  async function generateAlternativeApproaches(query, critique, currentResponse) {
    DocumentReviewer.UI.updateDebugInfo("Generating alternative approaches based on critique");
    
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
      
      const altApproachesResponse = await DocumentReviewer.APIService.callLLM(altApproachesPrompt);
      
      try {
        // Extract JSON
        const jsonMatch = altApproachesResponse.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : altApproachesResponse;
        const parsedApproaches = JSON.parse(DocumentReviewer.Helpers.sanitizeJsonString(jsonStr));
        
        if (parsedApproaches.approaches && Array.isArray(parsedApproaches.approaches)) {
          alternativeApproaches = parsedApproaches.approaches;
          DocumentReviewer.UI.updateDebugInfo(`Generated ${alternativeApproaches.length} alternative approaches`);
        } else {
          throw new Error("Invalid format for alternative approaches");
        }
      } catch (jsonError) {
        console.error("Error parsing alternative approaches:", jsonError);
        
        // Get document info
        const doc = DocumentReviewer.DocumentProcessor.getCurrentDocument();
        
        // Create fallback approaches
        alternativeApproaches = [
          {
            title: "More focused approach",
            rationale: "Focus more specifically on the query",
            prompt: `
              Provide a highly focused response to this query about the document:
              QUERY: "${query}"
              
              DOCUMENT CONTENT:
              ${doc.text.length > 4000 ? doc.text.substring(0, 4000) + "... [truncated]" : doc.text}
              
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
              ${doc.text.length > 4000 ? doc.text.substring(0, 4000) + "... [truncated]" : doc.text}
              
              Include all relevant details from the document, and structure your response clearly.
            `
          }
        ];
        
        DocumentReviewer.UI.updateDebugInfo("Created fallback alternative approaches due to parsing error");
      }
      
      return alternativeApproaches;
    } catch (error) {
      console.error("Error generating alternative approaches:", error);
      DocumentReviewer.UI.updateDebugInfo(`Failed to generate alternative approaches: ${error.message}`);
      
      // Get document info
      const doc = DocumentReviewer.DocumentProcessor.getCurrentDocument();
      
      // Return fallback approaches
      alternativeApproaches = [
        {
          title: "Fallback detailed approach",
          rationale: "Provide more comprehensive information",
          prompt: `
            Answer this query about the document with extra detail:
            QUERY: "${query}"
            
            DOCUMENT CONTENT:
            ${doc.text.length > 4000 ? doc.text.substring(0, 4000) + "... [truncated]" : doc.text}
          `
        }
      ];
      
      return alternativeApproaches;
    }
  }

  // Execute an alternative approach
  async function executeAlternativeApproach(query, approach) {
    DocumentReviewer.UI.updateDebugInfo(`Executing alternative approach: ${approach.title || 'Unnamed approach'}`);
    
    try {
      // Call LLM with the alternative prompt
      const response = await DocumentReviewer.APIService.callLLM(approach.prompt || `
        Alternative approach to answer query about document:
        QUERY: "${query}"
        
        DOCUMENT TITLE: "${DocumentReviewer.DocumentProcessor.getCurrentDocument().title}"
        
        DOCUMENT CONTENT:
        ${DocumentReviewer.DocumentProcessor.getCurrentDocument().text.length > 6000 ? 
          DocumentReviewer.DocumentProcessor.getCurrentDocument().text.substring(0, 6000) + "... [truncated]" : 
          DocumentReviewer.DocumentProcessor.getCurrentDocument().text}
        
        Provide a comprehensive response that directly answers the query.
      `);
      
      // Show in UI temporarily
      DocumentReviewer.UI.displayResponse(response);
      
      // Generate quality assessment
      const qualityAssessment = await estimateResponseQuality(query, response);
      const quality = qualityAssessment.quality || 7;  
      const confidence = qualityAssessment.confidence || 0.7;
      
      return {
        finalResponse: response,
        confidence: confidence,
        quality: quality
      };
    } catch (error) {
      console.error("Error executing alternative approach:", error);
      DocumentReviewer.UI.updateDebugInfo(`Alternative approach failed: ${error.message}`);
      
      // Return default values
      return {
        finalResponse: "Error generating alternative response",
        confidence: 0.5,
        quality: 5
      };
    }
  }

  // Get state
  function getState() {
    return {
      metaQuality,
      confidenceScore,
      iterationCount,
      determinationLevel
    };
  }

  // Ensure DocumentReviewer exists
  if (!window.DocumentReviewer) window.DocumentReviewer = {};

  // Export to namespace
  window.DocumentReviewer.MetaEngine = {
    setDeterminationLevel,
    resetMetaState,
    processQuery,
    executeMetaPromptProcess,
    executeMetaStages,
    addSelfCritiqueToUI,
    getState
  };
})();
