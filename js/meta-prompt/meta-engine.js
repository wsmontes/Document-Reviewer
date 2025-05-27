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
    DocumentReviewer.UI.updateDebugInfo("Analyzing query complexity and planning approach...");
    
    try {
      // Get document info
      const doc = DocumentReviewer.DocumentProcessor.getCurrentDocument();
      
      // Completely enhanced prompt to give LLM full autonomy in process design and agent usage
      const complexityAnalysis = await DocumentReviewer.APIService.callLLM(`
        You are an advanced reasoning system with complete freedom to determine the best approach to solve problems.
        You can design your own process workflows, select specialized agents, and determine how to tackle this document analysis task.
        
        Analyze this query about the document to determine its complexity level and the optimal approach:
        
        "${query}"
        
        THE DOCUMENT: "${doc.title}" with ${doc.pageCount} pages.
        
        AGENT CAPABILITIES:
        You have access to specialized agents that can be used at ANY stage of your process:
        
        - Writer agents (specialized in creating clear, engaging content)
        - Reviewer agents (specialized in reviewing content for accuracy and completeness)
        - Critic agents (specialized in finding weaknesses in arguments or logic)
        - Evaluator agents (specialized in objective quality assessment)
        - Researcher agents (specialized in gathering relevant information)
        - Questioner agents (specialized in asking probing questions)
        - Planner agents (specialized in planning complex analytical approaches)
        
        Additionally, you have access to:
        - Agent Factory (can create NEW specialized agent types tailored for specific purposes)
        - Agent Coordinator (can manage teams of agents working together)
        
        KEY FEATURES YOU CAN UTILIZE:
        1. You can use specialized agents at ANY step of your process
        2. You can have agents collaborate in teams
        3. You can create tailored agents for specific sub-tasks
        4. You can implement self-critique and iterative refinement
        5. You determine the optimal number of steps in your process
        6. You can design a completely custom workflow that makes sense for this task
        7. You can use critic agents to review and refine conclusions
        
        YOUR TASK:
        Design an optimal document analysis and response workflow for this query, deciding:
        1. The complexity level of the query
        2. The optimal number of steps needed (no arbitrary limitations)
        3. Which specialized agents to use at each stage
        4. Whether to use iterative refinement with critic agents
        5. Whether custom tailored agents should be created for this specific task
        
        Return your analysis in the following JSON format without any other text:
        {
          "complexity": "low|medium|high|very_high",
          "optimal_stages": [number of stages you determine is best],
          "reasoning": "[brief explanation of your assessment]",
          "suggested_approach": "[description of recommended meta-prompting strategy]",
          "use_specialized_agents": true,
          "recommended_agents": [
            {"type": "agent type", "purpose": "what this agent will do", "stage": "which stage of the process"}
          ],
          "need_custom_agents": true/false,
          "custom_agent_descriptions": [
            {"role": "descriptive name", "specialization": "specific focus area", "purpose": "why this custom agent is needed"}
          ],
          "use_critic_review": true/false,
          "suggested_critique_approach": "[description of how critics should refine the response]"
        }
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
        
        // Check if specialized agents are recommended
        const useAgents = complexityData.use_specialized_agents !== false;
        const needCustomAgents = complexityData.need_custom_agents === true;
        const useCriticReview = complexityData.use_critic_review === true;
        
        if (useAgents && 
            window.DocumentReviewer.AgentManager && 
            window.DocumentReviewer.AgentManager.isAutoModeEnabled()) {
          DocumentReviewer.UI.updateDebugInfo(`Agent-based approach recommended with ${complexityData.recommended_agents?.length || 'unspecified'} agents`);
          
          if (needCustomAgents) {
            DocumentReviewer.UI.updateDebugInfo(`Custom agents requested: ${complexityData.custom_agent_descriptions?.length || 0} custom agents`);
          }
          
          if (useCriticReview) {
            DocumentReviewer.UI.updateDebugInfo(`Critic review process will be used for response refinement`);
          }
          
          // Create a multi-agent approach with auto agent selection and full LLM control
          return await executeEnhancedAgentApproach(query, complexityData);
        } else if (useAgents && window.DocumentReviewer.AgentManager) {
          // Use agent approach with custom process but manual agent selection
          return await executeCustomAgentProcess(query, complexityData);
        }
      } catch (jsonError) {
        console.error("Failed to parse complexity analysis:", jsonError);
        DocumentReviewer.UI.updateDebugInfo("Failed to parse complexity analysis, using standard approach");
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
   * Execute an enhanced agent approach with full LLM control over the process
   */
  async function executeEnhancedAgentApproach(query, complexityData) {
    DocumentReviewer.UI.updateDebugInfo("Executing enhanced agent approach with LLM-designed workflow");
    
    try {
      // Use the complexityData to build a custom process definition
      const customStages = [];
      let stageCount = complexityData.optimal_stages || 3;
      
      // Generate stage definitions if not provided
      if (complexityData.process_stages) {
        // Use directly provided stages
        customStages.push(...complexityData.process_stages);
      } else {
        // Generate stages based on recommended approach
        // Always include these key stages at minimum
        customStages.push(
          { id: "planning", title: "Process Planning", description: "Planning the analysis approach and agent assignments" },
          { id: "execution", title: "Analysis Execution", description: "Analyzing document and executing the planned approach" }
        );
        
        // Add critique phase if requested
        if (complexityData.use_critic_review) {
          customStages.push({ 
            id: "critique", 
            title: "Critical Review", 
            description: "Critically reviewing initial findings to identify improvements" 
          });
        }
        
        // Add refinement phase if critic review is enabled
        if (complexityData.use_critic_review) {
          customStages.push({ 
            id: "refinement", 
            title: "Response Refinement", 
            description: "Refining the response based on critical feedback" 
          });
        }
        
        // Always add a synthesis/final response stage
        customStages.push({ 
          id: "synthesis", 
          title: "Response Synthesis", 
          description: "Creating the final comprehensive response" 
        });
      }
      
      // Update UI with custom process stages
      DocumentReviewer.UI.setMetaProcessDefinition(customStages);
      DocumentReviewer.UI.renderMetaProcessStages();
      
      // Create stage mapping for agent assignments
      const stageAgentMap = new Map();
      let customAgentsNeeded = [];
      
      // Map recommended agents to stages
      if (complexityData.recommended_agents && Array.isArray(complexityData.recommended_agents)) {
        complexityData.recommended_agents.forEach(agentRec => {
          const stage = agentRec.stage || "execution"; // Default to execution stage if not specified
          if (!stageAgentMap.has(stage)) {
            stageAgentMap.set(stage, []);
          }
          stageAgentMap.get(stage).push({
            type: agentRec.type,
            purpose: agentRec.purpose
          });
        });
      }
      
      // Collect custom agent needs
      if (complexityData.need_custom_agents && complexityData.custom_agent_descriptions) {
        customAgentsNeeded = complexityData.custom_agent_descriptions;
      }
      
      // First stage: Setup and planning
      DocumentReviewer.UI.updateMetaStage(0, "Setting up agent workflow...");
      
      // Create any custom agents needed
      const customAgents = [];
      if (customAgentsNeeded.length > 0) {
        DocumentReviewer.UI.updateDebugInfo("Creating custom agents for this task...");
        
        try {
          // Get the factory agent
          const factoryAgent = await ensureAgentExists('factory');
          
          // Create each custom agent
          for (const customAgentSpec of customAgentsNeeded) {
            DocumentReviewer.UI.updateMetaStage(0, `Creating custom ${customAgentSpec.role} agent...`);
            
            const newAgentResult = await DocumentReviewer.AgentManager.createCustomAgentFromFactory(
              factoryAgent.id,
              `Create a specialized agent with role: ${customAgentSpec.role}
               Specialization: ${customAgentSpec.specialization}
               Purpose: ${customAgentSpec.purpose}
               This agent will be used for a document analysis task: "${query}"`,
              { query, additionalContext: `This agent should be highly specialized for: ${customAgentSpec.specialization}` }
            );
            
            if (newAgentResult && newAgentResult.newAgent) {
              customAgents.push(newAgentResult.newAgent);
              DocumentReviewer.UI.updateDebugInfo(`Created custom agent: ${newAgentResult.newAgent.name}`);
            }
          }
        } catch (error) {
          console.error("Error creating custom agents:", error);
          DocumentReviewer.UI.updateDebugInfo(`Error creating custom agents: ${error.message}`);
        }
      }
      
      // Mark planning stage as complete
      DocumentReviewer.UI.updateMetaStage(0, "Agent workflow planned", true);
      
      // Execute each subsequent stage with appropriate agents
      let finalResponse = "";
      let lastStageOutput = "";
      let critiquesGenerated = [];
      
      for (let i = 1; i < customStages.length; i++) {
        const stage = customStages[i];
        DocumentReviewer.UI.updateMetaStage(i, `Executing ${stage.title}...`);
        
        if (stage.id === "critique" && complexityData.use_critic_review) {
          // Special handling for critique stage
          const critiquesResult = await executeMultiAgentCritique(lastStageOutput, query);
          critiquesGenerated = critiquesResult.critiques;
          DocumentReviewer.UI.updateMetaStage(i, critiquesResult.summary, true);
        } 
        else if (stage.id === "refinement" && critiquesGenerated.length > 0) {
          // Special handling for refinement stage based on critiques
          const refinementResult = await executeResponseRefinement(lastStageOutput, critiquesGenerated, query);
          lastStageOutput = refinementResult.refinedResponse;
          finalResponse = refinementResult.refinedResponse;
          DocumentReviewer.UI.updateMetaStage(i, "Response refined based on critiques", true);
        }
        else {
          // Standard stage execution with assigned agents
          const stageAgents = stageAgentMap.get(stage.id) || [];
          const defaultAgentType = getDefaultAgentTypeForStage(stage.id);
          
          // If no agents assigned to this stage, ensure we have at least one appropriate agent
          if (stageAgents.length === 0 && defaultAgentType) {
            stageAgents.push({ type: defaultAgentType, purpose: `Handle ${stage.title} stage` });
          }
          
          // Add custom agents appropriate for this stage
          customAgents.forEach(agent => {
            if (agent.specialization && isAgentSuitableForStage(agent, stage.id)) {
              stageAgents.push({ 
                id: agent.id, // Use specific agent ID for custom agents
                type: 'custom',
                purpose: `Provide specialized ${agent.specialization} analysis`
              });
            }
          });
          
          // Execute the stage with appropriate agents
          const stageResult = await executeStageWithAgents(
            stageAgents, 
            stage, 
            query,
            lastStageOutput, // Pass previous stage output as context
            i === customStages.length - 1 // Is this the final stage?
          );
          
          lastStageOutput = stageResult.response;
          if (i === customStages.length - 1) {
            finalResponse = stageResult.response;
          }
          
          DocumentReviewer.UI.updateMetaStage(i, stageResult.summary, true);
        }
      }
      
      // Display the final response in the response area
      DocumentReviewer.UI.displayResponse(finalResponse);
      
      // Add the response as an AI message
      DocumentReviewer.UI.addAIMessage(finalResponse);
      
      // Complete meta process
      const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
      DocumentReviewer.UI.updateProcessTime(elapsedTime);
      
      // Update UI stats
      const apiState = DocumentReviewer.APIService.getState();
      DocumentReviewer.UI.updateStats(apiState.promptCount, apiState.tokenUsage, metaQuality);
      
      return true;
    } catch (error) {
      console.error("Error in enhanced agent approach:", error);
      DocumentReviewer.UI.updateDebugInfo(`Enhanced agent approach error: ${error.message}`);
      
      // Try fallback response
      return await createFallbackResponse(query);
    }
  }

  /**
   * Execute a stage with the assigned agents
   */
  async function executeStageWithAgents(stageAgents, stage, query, previousOutput, isFinalStage) {
    DocumentReviewer.UI.updateDebugInfo(`Executing ${stage.title} with ${stageAgents.length} agents`);
    
    try {
      const agentIds = [];
      
      // Convert agent specs to actual agent IDs
      for (const agentSpec of stageAgents) {
        if (agentSpec.id) {
          // If ID is already provided (for custom agents)
          agentIds.push(agentSpec.id);
        } else {
          // Otherwise find or create an agent of the specified type
          try {
            const agent = await ensureAgentExists(agentSpec.type, {
              specialization: `${stage.title} - ${agentSpec.purpose}`
            });
            agentIds.push(agent.id);
          } catch (error) {
            console.error(`Error ensuring agent exists for ${agentSpec.type}:`, error);
            DocumentReviewer.UI.updateDebugInfo(`Could not create agent of type ${agentSpec.type}`);
          }
        }
      }
      
      // Skip if no valid agents were found/created
      if (agentIds.length === 0) {
        return { 
          response: previousOutput || "No agents available to process this stage.", 
          summary: "Stage skipped - no valid agents"
        };
      }
      
      // Prepare the task for agents
      const taskDescription = `
        STAGE: ${stage.title}
        DESCRIPTION: ${stage.description}
        
        QUERY: "${query}"
        
        ${previousOutput ? `PREVIOUS STAGE OUTPUT:\n${previousOutput}\n` : ''}
        
        ${isFinalStage ? 'This is the final stage. Generate a comprehensive, well-formatted response to the query.' : ''}
      `;
      
      // Run collaboration with the selected agents
      const collaborationResult = await DocumentReviewer.AgentManager.runAgentCollaboration(
        agentIds, 
        taskDescription, 
        { query, previousOutput, isFinalStage }
      );
      
      return {
        response: collaborationResult.synthesis,
        summary: `${stageAgents.length} agents collaboratively executed this stage`,
        agents: collaborationResult.contributors
      };
    } catch (error) {
      console.error(`Error executing stage ${stage.title}:`, error);
      DocumentReviewer.UI.updateDebugInfo(`Stage execution error: ${error.message}`);
      
      return { 
        response: previousOutput || `Error: Could not complete ${stage.title} stage.`, 
        summary: `Error: ${error.message}`
      };
    }
  }

  /**
   * Execute multi-agent critique of an initial response
   */
  async function executeMultiAgentCritique(initialResponse, query) {
    DocumentReviewer.UI.updateDebugInfo("Executing multi-agent critique process");
    
    try {
      // Ensure we have critic agents
      const critic1 = await ensureAgentExists('critic', {
        specialization: "Logical consistency and evidence analysis"
      });
      
      const critic2 = await ensureAgentExists('critic', {
        specialization: "Completeness and addressing the query"
      });
      
      const questioner = await ensureAgentExists('questioner', {
        specialization: "Identifying unanswered aspects"
      });
      
      const taskDescription = `
        CRITIQUE TASK
        
        Analyze this response to the query and provide a detailed critique:
        
        QUERY: "${query}"
        
        RESPONSE TO CRITIQUE:
        ${initialResponse}
        
        Provide specific, actionable criticism that can be used to improve the response.
        Focus on logical consistency, evidence, completeness, and how well it addresses the query.
      `;
      
      // Run collaboration with critics
      const critiquesResult = await DocumentReviewer.AgentManager.runAgentCollaboration(
        [critic1.id, critic2.id, questioner.id],
        taskDescription,
        { query }
      );
      
      return {
        critiques: [critiquesResult.synthesis],
        summary: "Response critically analyzed for improvements",
      };
    } catch (error) {
      console.error("Error in multi-agent critique:", error);
      DocumentReviewer.UI.updateDebugInfo(`Critique process error: ${error.message}`);
      
      return { 
        critiques: [],
        summary: `Critique process encountered an error: ${error.message}`
      };
    }
  }

  /**
   * Refine response based on critiques
   */
  async function executeResponseRefinement(initialResponse, critiques, query) {
    DocumentReviewer.UI.updateDebugInfo("Executing response refinement based on critiques");
    
    try {
      // Get a writer agent for refinement
      const writer = await ensureAgentExists('writer', {
        specialization: "Response refinement based on critique"
      });
      
      const taskDescription = `
        REFINEMENT TASK
        
        Revise and improve this response based on the provided critiques:
        
        ORIGINAL QUERY: "${query}"
        
        ORIGINAL RESPONSE:
        ${initialResponse}
        
        CRITIQUES TO ADDRESS:
        ${critiques.join('\n\n')}
        
        Create an improved version that addresses all the issues identified in the critiques.
        Maintain any strengths of the original response while fixing the weaknesses.
        Provide a comprehensive, well-structured final response.
      `;
      
      // Send refinement task to writer agent
      const refinementResult = await DocumentReviewer.AgentManager.sendTaskToAgent(
        writer.id,
        taskDescription,
        { query }
      );
      
      return {
        refinedResponse: refinementResult.response,
        summary: "Response refined based on critical feedback"
      };
    } catch (error) {
      console.error("Error in response refinement:", error);
      DocumentReviewer.UI.updateDebugInfo(`Refinement process error: ${error.message}`);
      
      // Return original response if refinement fails
      return { 
        refinedResponse: initialResponse,
        summary: `Refinement process encountered an error: ${error.message}`
      };
    }
  }

  /**
   * Ensure that an agent of the specified type exists, creating it if needed
   */
  async function ensureAgentExists(agentType, customizations = {}) {
    try {
      // Find an existing agent of this type
      const existingAgents = DocumentReviewer.AgentManager.getActiveAgents().filter(
        a => a.type === agentType
      );
      
      // If we have specialization requirements, check for that
      if (customizations.specialization && existingAgents.length > 0) {
        const specializedAgent = existingAgents.find(a => 
          a.specialization && 
          a.specialization.includes(customizations.specialization)
        );
        
        if (specializedAgent) {
          return specializedAgent;
        }
      }
      
      // If any agent of this type exists and we don't need specialization, use the first one
      if (existingAgents.length > 0 && !customizations.specialization) {
        return existingAgents[0];
      }
      
      // Otherwise create a new agent
      return DocumentReviewer.AgentManager.createAgent(agentType, customizations);
      
    } catch (error) {
      console.error(`Error ensuring agent exists for type ${agentType}:`, error);
      throw new Error(`Failed to create or find agent of type ${agentType}`);
    }
  }

  /**
   * Get default agent type for a particular stage
   */
  function getDefaultAgentTypeForStage(stageId) {
    switch (stageId) {
      case 'planning': return 'planner';
      case 'research': return 'researcher';
      case 'analysis': return 'researcher';
      case 'execution': return 'researcher';
      case 'critique': return 'critic';
      case 'refinement': return 'writer';
      case 'synthesis': return 'writer';
      default: return 'researcher'; // Default fallback
    }
  }

  /**
   * Check if an agent is suitable for a particular stage based on its specialization
   */
  function isAgentSuitableForStage(agent, stageId) {
    if (!agent.specialization) return false;
    
    const spec = agent.specialization.toLowerCase();
    
    switch (stageId) {
      case 'planning': 
        return spec.includes('plan') || spec.includes('strategy') || spec.includes('approach');
      case 'research': 
        return spec.includes('research') || spec.includes('information') || spec.includes('gather');
      case 'analysis': 
        return spec.includes('analy') || spec.includes('evaluate') || spec.includes('assess');
      case 'execution': 
        return true; // Custom agents can generally help with execution
      case 'critique': 
        return spec.includes('critic') || spec.includes('review') || spec.includes('evaluat');
      case 'refinement': 
        return spec.includes('refin') || spec.includes('improv') || spec.includes('enhanc');
      case 'synthesis': 
        return spec.includes('synth') || spec.includes('summar') || spec.includes('writ');
      default: return true; // By default allow custom agents in any stage
    }
  }

  /**
   * Execute the meta stages
   */
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

  /**
   * Add self-critique to UI
   */
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
      } else {
        console.warn("Could not find content element in evaluate stage");
      }
    } else {
      // If we can't find the evaluate stage, try to create one
      try {
        const metaProcess = document.getElementById('meta-process-stages');
        if (metaProcess) {
          // Create a new evaluate stage
          const newStage = document.createElement('div');
          newStage.id = 'stage-evaluate';
          newStage.className = 'meta-process-stage';
          
          newStage.innerHTML = `
            <h3>Response Evaluation</h3>
            <div class="stage-content">
              <div class="self-critique">
                <strong>Rating: ${critique.rating || 'N/A'}/10</strong> 
                (Confidence: ${Math.round((critique.confidence_score || 0.5) * 100)}%)<br>
                <strong>Strengths:</strong> <ul>${critique.strengths ? critique.strengths.map(s => `<li>${s}</li>`).join('') : '<li>No strengths identified</li>'}</ul><br>
                <strong>Weaknesses:</strong> <ul>${critique.weaknesses ? critique.weaknesses.map(w => `<li>${w}</li>`).join('') : '<li>No weaknesses identified</li>'}</ul><br>
                <strong>Suggestions:</strong> <ul>${critique.improvement_suggestions ? critique.improvement_suggestions.map(i => `<li>${i}</li>`).join('') : '<li>No specific suggestions</li>'}</ul><br>
                <strong>Overall:</strong> ${critique.overall_assessment || 'No overall assessment provided'}
              </div>
            </div>
          `;
          
          metaProcess.appendChild(newStage);
          newStage.classList.add('completed-stage');
          
          DocumentReviewer.UI.updateDebugInfo("Created new evaluation stage for self-critique");
        } else {
          console.warn("Could not find meta-process container to add evaluation stage");
        }
      } catch (e) {
        console.error("Error creating evaluation stage:", e);
      }
    }
    
    // Update confidence display if that function exists
    if (typeof DocumentReviewer.UI.updateConfidenceDisplay === 'function') {
      DocumentReviewer.UI.updateConfidenceDisplay(critique.confidence_score || 0.7);
    }
  }

  /**
   * Generate self-critique for a response
   */
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
        
        // Log the raw JSON for debugging
        console.log("Raw critique JSON:", jsonStr);
        
        // Sanitize the JSON string before parsing
        const sanitizedJsonStr = DocumentReviewer.Helpers.sanitizeJsonString(jsonStr);
        console.log("Sanitized critique JSON:", sanitizedJsonStr);
        
        const critique = JSON.parse(sanitizedJsonStr);
        
        // Update confidence display
        DocumentReviewer.UI.updateConfidenceDisplay(parseFloat(critique.confidence_score) || 0.5);
        
        return critique;
      } catch (jsonError) {
        console.error("Failed to parse critique:", jsonError);
        console.log("Problematic JSON string:", critiqueTxt);
        
        // Create a default critique object as fallback
        return {
          rating: 6,
          confidence_score: 0.5,
          strengths: ["Addressed the query"],
          weaknesses: ["Could be more comprehensive", "JSON parsing error occurred"],
          improvement_suggestions: ["Consider alternative perspectives", "Provide more structured response"],
          overall_assessment: "Response is adequate but could be improved. Note: This is a fallback assessment due to JSON parsing error."
        };
      }
    } catch (error) {
      console.error("Error generating self-critique:", error);
      // Return a fallback critique
      return {
        rating: 5,
        confidence_score: 0.5,
        strengths: ["Unknown"],
        weaknesses: ["Error evaluating response"],
        improvement_suggestions: ["Try a different approach"],
        overall_assessment: "Could not properly evaluate due to an error"
      };
    }
  }

  /**
   * Get status information about the meta-engine
   */
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
    executeEnhancedAgentApproach,
    generateSelfCritique,
    getState
  };
})();
