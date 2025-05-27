/**
 * Agent Manager - Handles creation and management of specialized AI agents
 */
(function() {
  // Registry of available agent templates
  const agentTemplates = {
    writer: {
      name: "Content Writer",
      icon: "✍️",
      description: "Specialized in creating clear, engaging, and well-structured content",
      systemPrompt: "You are an expert content writer with exceptional skills in clarity, engaging narrative, and proper structure. Your focus is on creating high-quality content that effectively communicates complex ideas in an accessible way. Approach all tasks with creativity and precision."
    },
    reviewer: {
      name: "Content Reviewer",
      icon: "🔍",
      description: "Specialized in reviewing content for accuracy, completeness and structure",
      systemPrompt: "You are an expert content reviewer with exceptional attention to detail. Your focus is on ensuring accuracy, completeness, and logical structure. Evaluate content critically and provide specific, actionable feedback without rewriting the content yourself."
    },
    critic: {
      name: "Content Critic",
      icon: "⚖️",
      description: "Specialized in critical analysis and identifying weaknesses in arguments or reasoning",
      systemPrompt: "You are an expert content critic with deep analytical skills. Your focus is on identifying logical fallacies, evaluating evidence quality, and pinpointing weak reasoning. Be constructive but thorough in your critique, providing explanations for each issue identified."
    },
    evaluator: {
      name: "Quality Evaluator",
      icon: "📊",
      description: "Specialized in objective evaluation against defined quality metrics",
      systemPrompt: "You are an expert quality evaluator with a methodical approach to assessment. Your focus is on objectively measuring content against defined quality metrics. Provide numerical scores with justifications and highlight exemplary elements as well as areas for improvement."
    },
    researcher: {
      name: "Research Specialist",
      icon: "🔬",
      description: "Specialized in information gathering and fact verification",
      systemPrompt: "You are an expert researcher with exceptional skills in information synthesis. Your focus is on gathering relevant information from the document, identifying key facts, and organizing them logically. Be thorough and detail-oriented in your approach."
    },
    questioner: {
      name: "Strategic Questioner",
      icon: "❓",
      description: "Specialized in asking probing questions to reveal deeper insights",
      systemPrompt: "You are an expert at asking insightful questions. Your focus is on probing beneath surface-level information to reveal deeper insights and challenge assumptions. Your questions should be specific, thought-provoking, and designed to expand understanding."
    },
    planner: {
      name: "Strategic Planner",
      icon: "📝",
      description: "Specialized in planning complex analytical approaches",
      systemPrompt: "You are an expert strategic planner with exceptional organizational skills. Your focus is on breaking down complex tasks into logical steps, anticipating challenges, and designing efficient workflows. Create structured, actionable plans that optimize for both thoroughness and efficiency."
    },
    factory: {
      name: "Agent Factory",
      icon: "🏭",
      description: "Specialized in creating and configuring new agents when needed",
      systemPrompt: "You are an expert agent architect with the unique ability to identify needs for new specialized agents and create them. Your focus is on analyzing tasks to determine when existing agents are insufficient and designing new agents with appropriate specializations, names, and system prompts. Always consider whether existing agents can handle a task before creating new ones."
    },
    coordinator: {
      name: "Agent Coordinator",
      icon: "🎮",
      description: "Specialized in determining optimal agent selection for tasks",
      systemPrompt: "You are an expert agent coordinator with exceptional skills in analyzing tasks and determining which specialized agents should handle them. Your focus is on understanding complex requirements and matching them to agent capabilities. You can identify when an agent team needs additional specialized agents and request them from the Agent Factory."
    }
  };

  // Store for active agents
  let activeAgents = [];
  let agentConversations = {};
  let nextAgentId = 1;
  let autoModeEnabled = true; // By default, auto mode is enabled
  
  // Create a coordinator and factory agent at initialization
  function initializeSystemAgents() {
    // Only initialize if there are no agents yet
    if (activeAgents.length === 0) {
      // Create coordinator first
      const coordinator = createAgent('coordinator', {
        name: "Agent Coordinator",
        specialization: "Determining optimal agent selection for tasks"
      });
      
      // Create factory second
      const factory = createAgent('factory', {
        name: "Agent Factory",
        specialization: "Creating specialized agents on demand"
      });
      
      return { 
        coordinator: coordinator.id, 
        factory: factory.id 
      };
    }
    
    // If agents already exist, find coordinator and factory
    const coordinator = activeAgents.find(agent => agent.type === 'coordinator');
    const factory = activeAgents.find(agent => agent.type === 'factory');
    
    return { 
      coordinator: coordinator ? coordinator.id : null, 
      factory: factory ? factory.id : null 
    };
  }
  
  /**
   * Create a new agent with specified type and optional customizations
   */
  function createAgent(agentType, customizations = {}) {
    if (!agentTemplates[agentType]) {
      throw new Error(`Unknown agent type: ${agentType}`);
    }
    
    const template = agentTemplates[agentType];
    const agentId = `agent-${nextAgentId++}`;
    
    // Create new agent by combining template with customizations
    const agent = {
      id: agentId,
      type: agentType,
      name: customizations.name || template.name,
      icon: customizations.icon || template.icon,
      description: customizations.description || template.description,
      systemPrompt: customizations.systemPrompt || template.systemPrompt,
      specialization: customizations.specialization || null,
      createdAt: Date.now(),
      metrics: {
        promptsHandled: 0,
        insightsGenerated: 0,
        questionsAsked: 0,
        suggestionsProvided: 0
      }
    };
    
    // Add to active agents
    activeAgents.push(agent);
    
    // Initialize conversation history for this agent
    agentConversations[agentId] = [];
    
    window.DocumentReviewer.UI.updateDebugInfo(`Created ${agent.name} (${agent.id})`);
    
    // If the agent panel exists, update it
    updateAgentDisplay();
    
    return agent;
  }
  
  /**
   * Get an agent by ID
   */
  function getAgent(agentId) {
    return activeAgents.find(agent => agent.id === agentId) || null;
  }
  
  /**
   * Remove an agent by ID
   */
  function removeAgent(agentId) {
    const index = activeAgents.findIndex(agent => agent.id === agentId);
    if (index !== -1) {
      const removed = activeAgents.splice(index, 1)[0];
      delete agentConversations[agentId];
      updateAgentDisplay();
      window.DocumentReviewer.UI.updateDebugInfo(`Removed agent: ${removed.name} (${removed.id})`);
      return true;
    }
    return false;
  }
  
  /**
   * Toggle automatic agent management mode
   */
  function toggleAutoMode(enable) {
    autoModeEnabled = enable === undefined ? !autoModeEnabled : !!enable;
    window.DocumentReviewer.UI.updateDebugInfo(`Auto agent mode ${autoModeEnabled ? 'enabled' : 'disabled'}`);
    return autoModeEnabled;
  }
  
  /**
   * Get the automatic mode status
   */
  function isAutoModeEnabled() {
    return autoModeEnabled;
  }
  
  /**
   * Automatically analyze task and select appropriate agents
   */
  async function analyzeTaskAndSelectAgents(task, context = {}) {
    // Make sure we have system agents
    const systemAgents = initializeSystemAgents();
    
    if (!systemAgents.coordinator) {
      throw new Error("Coordinator agent not found");
    }
    
    const coordinator = getAgent(systemAgents.coordinator);
    
    // Ask the coordinator to determine which agents we need - enhanced to allow full LLM control
    const agentSelectionPrompt = `
      TASK ANALYSIS REQUEST
      
      I need you to analyze this task and determine the optimal specialist agents to handle it.
      
      TASK: ${task}
      
      ${context.query ? `USER QUERY: ${context.query}` : ''}
      
      ${context.additionalContext || ''}
      ${context.customAgentHint ? `CUSTOM AGENT SUGGESTION: ${context.customAgentHint}` : ''}
      ${context.previousOutput ? `PREVIOUS OUTPUT: ${context.previousOutput.substring(0, 500)}... [truncated]` : ''}
      
      YOU HAVE FULL AUTONOMY: You can decide exactly which agents should be created, how they should be specialized,
      and how they should work together for optimal results. Don't be constrained by conventional approaches.
      
      Available agent types:
      ${Object.keys(agentTemplates)
        .filter(type => !['coordinator', 'factory'].includes(type)) // Filter out system agents
        .map(type => `- ${agentTemplates[type].name} (${type}): ${agentTemplates[type].description}`)
        .join('\n')}
        
      For each recommended agent:
      1. Specify the agent type (must be one of the available types listed above)
      2. Explain why this specific agent is needed for this task
      3. Define a highly tailored specialization that makes the agent optimized for this specific task
      4. Assign a priority level (1=highest) to indicate the agent's importance
      
      Additionally:
      - If you think a completely new specialized agent type is needed, describe it in detail
      - You can recommend as many agents as you believe necessary for optimal results
      - Consider creating complementary agent teams that can work together effectively
      
      Return your recommendation in JSON format only:
      {
        "recommended_agents": [
          {
            "type": "agent_type_key",
            "reason": "why this agent is needed",
            "specialization": "highly tailored specialization description",
            "priority": 1-5
          }
        ],
        "needs_new_agent": true/false,
        "new_agent_descriptions": [
          {
            "name": "suggested name for new agent",
            "purpose": "detailed description of what this new agent should do",
            "specialization": "specific focus area for this agent",
            "justification": "why this new agent type is needed"
          }
        ],
        "suggested_workflow": "brief description of how these agents should work together"
      }
    `;
    
    window.DocumentReviewer.UI.updateDebugInfo("Analyzing task to determine agent requirements...");
    
    try {
      // Send the prompt to the coordinator agent
      const agentSelectionResult = await sendTaskToAgent(systemAgents.coordinator, agentSelectionPrompt, context);
      
      // Parse the result
      let selection;
      try {
        const jsonMatch = agentSelectionResult.response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : agentSelectionResult.response;
        selection = JSON.parse(window.DocumentReviewer.Helpers.sanitizeJsonString(jsonStr));
      } catch (parseError) {
        console.error("Error parsing agent selection:", parseError);
        throw new Error("Failed to parse agent selection response");
      }
      
      // Initialize the list of agents to use
      const agentsToUse = [];
      
      // Sort recommended agents by priority
      if (selection.recommended_agents) {
        selection.recommended_agents.sort((a, b) => (a.priority || 3) - (b.priority || 3));
      }
      
      // Create recommended agents if they don't already exist
      for (const recommendation of selection.recommended_agents || []) {
        // Check if we already have an agent of this type with similar specialization
        const existingAgent = activeAgents.find(agent => 
          agent.type === recommendation.type && 
          (!recommendation.specialization || 
           (agent.specialization && agent.specialization.includes(recommendation.specialization)))
        );
        
        if (existingAgent && !context.preferTailored) {
          // Use existing agent only if we don't prefer tailored agents
          agentsToUse.push(existingAgent.id);
          window.DocumentReviewer.UI.updateDebugInfo(`Using existing ${existingAgent.name} (${existingAgent.id})`);
        } else {
          // Create new agent with tailored specialization
          try {
            const newAgent = createAgent(recommendation.type, {
              specialization: recommendation.specialization || 
                `Specialized for: ${context.query || task.substring(0, 50)}...`
            });
            agentsToUse.push(newAgent.id);
            window.DocumentReviewer.UI.updateDebugInfo(`Created new ${newAgent.name} (${newAgent.id}) with specialization: ${newAgent.specialization || 'none'}`);
          } catch (createError) {
            console.error(`Error creating agent of type ${recommendation.type}:`, createError);
            window.DocumentReviewer.UI.updateDebugInfo(`Failed to create agent of type ${recommendation.type}: ${createError.message}`);
          }
        }
      }
      
      // Create custom agents if needed
      if (selection.needs_new_agent && selection.new_agent_descriptions && selection.new_agent_descriptions.length > 0 && systemAgents.factory) {
        window.DocumentReviewer.UI.updateDebugInfo(`Creating ${selection.new_agent_descriptions.length} custom agent(s)...`);
        
        for (const agentDesc of selection.new_agent_descriptions) {
          try {
            // Ask the factory to create a new agent
            const newAgentResult = await createCustomAgentFromFactory(
              systemAgents.factory,
              `Create a new specialized agent:
               Name: ${agentDesc.name}
               Purpose: ${agentDesc.purpose}
               Specialization: ${agentDesc.specialization}
               Justification: ${agentDesc.justification}`,
              context
            );
            
            if (newAgentResult && newAgentResult.newAgent) {
              agentsToUse.push(newAgentResult.newAgent.id);
              window.DocumentReviewer.UI.updateDebugInfo(`Created custom agent: ${newAgentResult.newAgent.name}`);
            }
          } catch (factoryError) {
            console.error(`Error creating custom agent "${agentDesc.name}":`, factoryError);
            window.DocumentReviewer.UI.updateDebugInfo(`Failed to create custom agent "${agentDesc.name}": ${factoryError.message}`);
          }
        }
      }
      
      return {
        agentsToUse: agentsToUse,
        analysisResult: selection
      };
    } catch (error) {
      console.error("Error analyzing task and selecting agents:", error);
      window.DocumentReviewer.UI.updateDebugInfo(`Agent selection error: ${error.message}`);
      
      // Return a minimal default set of agents (researcher + writer)
      let researcher;
      let writer;
      
      try {
        researcher = activeAgents.find(agent => agent.type === 'researcher') || 
                   createAgent('researcher', {});
      } catch (e) {
        console.error("Error creating researcher fallback:", e);
        researcher = null;
      }
      
      try {
        writer = activeAgents.find(agent => agent.type === 'writer') || 
               createAgent('writer', {});
      } catch (e) {
        console.error("Error creating writer fallback:", e);
        writer = null;
      }
      
      const agentsToUse = [];
      if (researcher) agentsToUse.push(researcher.id);
      if (writer) agentsToUse.push(writer.id);
      
      if (agentsToUse.length === 0) {
        throw new Error("Could not create any agents to handle the task");
      }
      
      return {
        agentsToUse: agentsToUse,
        analysisResult: {
          recommended_agents: [
            ...(researcher ? [{ type: 'researcher', reason: "Default agent selection" }] : []),
            ...(writer ? [{ type: 'writer', reason: "Default agent selection" }] : [])
          ],
          needs_new_agent: false
        }
      };
    }
  }
  
  /**
   * Have the Agent Factory create a custom agent based on requirements
   */
  async function createCustomAgentFromFactory(factoryAgentId, agentRequirements, context = {}) {
    const factory = getAgent(factoryAgentId);
    
    if (!factory) {
      throw new Error("Agent Factory not found");
    }
    
    // Format the prompt for creating a new agent with complete creative freedom
    const createAgentPrompt = `
      NEW AGENT CREATION REQUEST
      
      Design a new highly specialized agent based on these requirements:
      
      REQUIREMENTS: ${agentRequirements}
      
      ${context.query ? `TASK CONTEXT: ${context.query}` : ''}
      
      ${context.additionalContext || ''}
      
      IMPORTANT DIRECTIVES:
      
      1. You have COMPLETE CREATIVE FREEDOM to design the most effective agent possible
      2. Make this agent HIGHLY SPECIALIZED and precisely tailored to the specific task
      3. The agent should have a very specific focus area - avoid generic capabilities
      4. Design the most effective system prompt to guide the agent's behavior
      5. Be innovative - don't be limited by conventional agent types
      
      For this new agent, define:
      1. A specific agent name that clearly indicates its specialized function
      2. An appropriate emoji icon that represents its function
      3. A concise description of its specialized capabilities
      4. A detailed system prompt that will guide its behavior (be specific and tailored)
      5. A very specific specialization focus for this instance
      
      Return your agent design in JSON format only:
      {
        "agent_name": "Name of the agent",
        "icon": "Single emoji icon",
        "description": "Concise description of capabilities",
        "system_prompt": "Detailed prompt to guide agent behavior",
        "specialization": "Specific focus for this instance",
        "reasoning": "Why this design is optimal for the task"
      }
    `;
    
    window.DocumentReviewer.UI.updateDebugInfo("Requesting new agent design from Agent Factory...");
    
    try {
      // Send the design request to the factory agent
      const designResult = await sendTaskToAgent(factoryAgentId, createAgentPrompt, context);
      
      // Parse the result
      let agentDesign;
      try {
        const jsonMatch = designResult.response.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : designResult.response;
        agentDesign = JSON.parse(window.DocumentReviewer.Helpers.sanitizeJsonString(jsonStr));
      } catch (parseError) {
        console.error("Error parsing agent design:", parseError);
        throw new Error("Failed to parse agent design");
      }
      
      // Create a custom agent based on the design
      const customAgent = {
        id: `custom-agent-${nextAgentId++}`,
        type: 'custom',
        name: agentDesign.agent_name,
        icon: agentDesign.icon,
        description: agentDesign.description,
        systemPrompt: agentDesign.system_prompt,
        specialization: agentDesign.specialization,
        createdAt: Date.now(),
        metrics: {
          promptsHandled: 0,
          insightsGenerated: 0,
          questionsAsked: 0,
          suggestionsProvided: 0
        }
      };
      
      // Add to active agents
      activeAgents.push(customAgent);
      
      // Initialize conversation history for this agent
      agentConversations[customAgent.id] = [];
      
      window.DocumentReviewer.UI.updateDebugInfo(`Created custom agent: ${customAgent.name} (${customAgent.id})`);
      
      // Update agent display
      updateAgentDisplay();
      
      return {
        factoryId: factoryAgentId,
        designResponse: agentDesign,
        newAgent: customAgent
      };
    } catch (error) {
      console.error("Error creating custom agent:", error);
      window.DocumentReviewer.UI.updateDebugInfo(`Custom agent creation error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Automate agent collaboration based on task analysis
   */
  async function runAutoAgentProcess(task, context = {}) {
    if (!autoModeEnabled) {
      throw new Error("Auto mode is disabled");
    }
    
    window.DocumentReviewer.UI.updateDebugInfo("Starting automated agent process...");
    
    try {
      // Step 1: Analyze task and select appropriate agents
      const { agentsToUse } = await analyzeTaskAndSelectAgents(task, context);
      
      if (!agentsToUse || agentsToUse.length === 0) {
        throw new Error("No agents selected for task");
      }
      
      window.DocumentReviewer.UI.updateDebugInfo(`Selected ${agentsToUse.length} agents for collaboration`);
      
      // Step 2: Run collaboration with selected agents
      return await runAgentCollaboration(agentsToUse, task, context);
    } catch (error) {
      console.error("Error in auto agent process:", error);
      window.DocumentReviewer.UI.updateDebugInfo(`Auto agent process error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Send a task to an agent and get a response
   */
  async function sendTaskToAgent(agentId, task, context = {}) {
    const agent = getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    
    // Get context information
    const doc = window.DocumentReviewer.DocumentProcessor.getCurrentDocument();
    const documentContext = doc.text.length > 5000 ? 
                         doc.text.substring(0, 5000) + "... [truncated]" : 
                         doc.text;
    
    // Format the prompt for the agent
    const prompt = `
      ${agent.systemPrompt}
      
      ${agent.specialization ? `SPECIALIZATION: ${agent.specialization}` : ''}
      
      TASK: ${task}
      
      ${context.query ? `USER QUERY: ${context.query}` : ''}
      
      ${context.additionalContext || ''}
      
      DOCUMENT TITLE: "${doc.title}"
      
      DOCUMENT CONTENT (may be truncated):
      ${documentContext}
      
      Respond in your role as ${agent.name}. Be thorough but focused specifically on your expertise area.
    `;
    
    try {
      // Record the interaction in the agent's conversation history
      agentConversations[agentId].push({
        role: 'system',
        content: task,
        timestamp: Date.now()
      });
      
      // Call the LLM
      const response = await window.DocumentReviewer.APIService.callLLM(prompt);
      
      // Record the response
      agentConversations[agentId].push({
        role: 'agent',
        content: response,
        timestamp: Date.now()
      });
      
      // Update agent metrics
      agent.metrics.promptsHandled++;
      
      // Update agent panel
      updateAgentActivityInUI(agentId, task, response);
      
      return {
        agentId,
        name: agent.name,
        type: agent.type,
        response: response
      };
    } catch (error) {
      console.error(`Agent ${agentId} task error:`, error);
      window.DocumentReviewer.UI.updateDebugInfo(`Agent ${agent.name} error: ${error.message}`);
      
      // Record the error
      agentConversations[agentId].push({
        role: 'error',
        content: error.message,
        timestamp: Date.now()
      });
      
      throw error;
    }
  }
  
  /**
   * Have one agent question another agent
   */
  async function agentQuestionAgent(questionerAgentId, targetAgentId, topic, context = {}) {
    const questioner = getAgent(questionerAgentId);
    const target = getAgent(targetAgentId);
    
    if (!questioner || !target) {
      throw new Error("Both questioner and target agents must exist");
    }
    
    // First, have the questioner generate questions
    const questionGenPrompt = `
      ${questioner.systemPrompt}
      
      You need to generate 3-5 insightful and probing questions about this topic: "${topic}"
      
      ${context.additionalContext || ''}
      
      These questions will be sent to another specialist agent (${target.name}) who is an expert in this area.
      
      Your questions should be direct, specific, and designed to extract valuable insights.
      Format your response as a numbered list of questions only, without any introduction or conclusion.
    `;
    
    try {
      // Generate questions
      const questionsResponse = await window.DocumentReviewer.APIService.callLLM(questionGenPrompt);
      
      // Record in conversation history
      agentConversations[questionerAgentId].push({
        role: 'agent',
        content: `Generated questions for ${target.name}: ${questionsResponse}`,
        timestamp: Date.now()
      });
      
      // Update metrics
      questioner.metrics.questionsAsked += (questionsResponse.match(/\d+\./g) || []).length;
      
      // Send questions to target agent
      const targetPrompt = `
        ${target.systemPrompt}
        
        Another specialist (${questioner.name}) has asked you these questions about: "${topic}"
        
        QUESTIONS:
        ${questionsResponse}
        
        Please answer each question thoroughly based on your expertise.
        Number your answers to correspond with each question.
        
        ${context.additionalContext || ''}
      `;
      
      const answersResponse = await window.DocumentReviewer.APIService.callLLM(targetPrompt);
      
      // Record in conversation history
      agentConversations[targetAgentId].push({
        role: 'agent',
        content: `Answered questions from ${questioner.name}: ${answersResponse}`,
        timestamp: Date.now()
      });
      
      // Update agent activity in UI
      updateAgentInteractionInUI(questionerAgentId, targetAgentId, questionsResponse, answersResponse);
      
      return {
        questioner: {
          id: questionerAgentId,
          name: questioner.name,
          questions: questionsResponse
        },
        target: {
          id: targetAgentId,
          name: target.name,
          answers: answersResponse
        }
      };
    } catch (error) {
      console.error("Agent questioning error:", error);
      window.DocumentReviewer.UI.updateDebugInfo(`Agent questioning error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Plan and create a new agent based on identified needs
   */
  async function planNewAgent(plannerAgentId, taskDescription, context = {}) {
    const planner = getAgent(plannerAgentId);
    
    if (!planner) {
      throw new Error("Planner agent must exist");
    }
    
    // Have the planner recommend an agent type and customizations
    const planningPrompt = `
      ${planner.systemPrompt}
      
      TASK: You need to determine the ideal type of specialized agent to handle this task:
      "${taskDescription}"
      
      ${context.additionalContext || ''}
      
      Available agent types:
      ${Object.keys(agentTemplates).map(type => 
        `- ${agentTemplates[type].name} (${type}): ${agentTemplates[type].description}`
      ).join('\n')}
      
      Based on the task requirements, recommend:
      1. Which agent type would be most appropriate
      2. Any specialization or customization needed for this specific task
      3. A suitable name for this specialized agent
      
      Return your recommendation in this JSON format only:
      {
        "recommendedType": "[agent type key]",
        "agentName": "[custom name for this agent instance]",
        "specialization": "[brief description of specialized focus]",
        "justification": "[explanation for your recommendation]"
      }
    `;
    
    try {
      const planResponse = await window.DocumentReviewer.APIService.callLLM(planningPrompt);
      
      // Parse the recommendation
      let recommendation;
      try {
        const jsonMatch = planResponse.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : planResponse;
        recommendation = JSON.parse(window.DocumentReviewer.Helpers.sanitizeJsonString(jsonStr));
      } catch (parseError) {
        console.error("Error parsing agent recommendation:", parseError);
        throw new Error("Failed to parse agent recommendation");
      }
      
      // Record in conversation history
      agentConversations[plannerAgentId].push({
        role: 'agent',
        content: `Planned new agent: ${recommendation.agentName} (${recommendation.recommendedType}) - ${recommendation.specialization}`,
        timestamp: Date.now()
      });
      
      // Create the recommended agent
      const newAgent = createAgent(recommendation.recommendedType, {
        name: recommendation.agentName,
        specialization: recommendation.specialization
      });
      
      // Update agent metrics
      planner.metrics.suggestionsProvided++;
      
      // Update UI
      updateAgentPlanningInUI(plannerAgentId, recommendation, newAgent.id);
      
      return {
        planner: {
          id: plannerAgentId,
          name: planner.name,
          recommendation: recommendation
        },
        newAgent: {
          id: newAgent.id,
          name: newAgent.name,
          type: newAgent.type,
          specialization: newAgent.specialization
        }
      };
    } catch (error) {
      console.error("Agent planning error:", error);
      window.DocumentReviewer.UI.updateDebugInfo(`Agent planning error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Run a collaboration between multiple agents with improved flexibility
   */
  async function runAgentCollaboration(agents, task, context = {}) {
    if (!Array.isArray(agents) || agents.length === 0) {
      throw new Error("Collaboration requires at least 1 agent");
    }
    
    // Filter out any undefined or invalid agent IDs
    const validAgents = agents.filter(agentId => {
      if (!agentId) {
        console.warn("Undefined agent ID found in collaboration request");
        return false;
      }
      
      const agent = getAgent(agentId);
      if (!agent) {
        console.warn(`Agent not found for ID: ${agentId}`);
        return false;
      }
      
      return true;
    });
    
    if (validAgents.length === 0) {
      throw new Error("No valid agents available for collaboration");
    }
    
    const collaborationResults = [];
    const finalSynthesis = {};
    
    try {
      // ENHANCED: Get collaboration approach from coordinator for multi-agent teams
      let collaborationApproach = null;
      if (validAgents.length > 1) {
        try {
          const systemAgents = initializeSystemAgents();
          if (systemAgents.coordinator) {
            const coordinator = getAgent(systemAgents.coordinator);
            
            // Get collaboration approach from coordinator
            const collaborationPlan = await sendTaskToAgent(systemAgents.coordinator, `
              COLLABORATION PLANNING TASK
              
              You need to determine the best collaboration approach for a team of agents working on this task:
              "${task}"
              
              The team consists of:
              ${validAgents.map(id => {
                const agent = getAgent(id);
                return `- ${agent.name} (${agent.type})${agent.specialization ? ': ' + agent.specialization : ''}`;
              }).join('\n')}
              
              Determine:
              1. How these agents should collaborate (sequential, parallel, or hybrid approach)
              2. What information should be shared between agents
              3. How to synthesize their individual outputs
              
              Return your recommendation in JSON format only:
              {
                "approach": "sequential|parallel|hybrid",
                "workflow": "description of recommended agent collaboration",
                "synthesis_strategy": "how to combine the agent outputs"
              }
            `, context);
            
            try {
              const jsonMatch = collaborationPlan.response.match(/\{[\s\S]*\}/);
              const jsonStr = jsonMatch ? jsonMatch[0] : collaborationPlan.response;
              collaborationApproach = JSON.parse(window.DocumentReviewer.Helpers.sanitizeJsonString(jsonStr));
            } catch (jsonError) {
              console.error("Error parsing collaboration plan:", jsonError);
            }
          }
        } catch (planError) {
          console.error("Error getting collaboration plan:", planError);
        }
      }
      
      // Default to parallel approach if planning failed
      const approach = collaborationApproach?.approach || "parallel";
      
      // Step 1: Have each agent work on the task according to the decided approach
      let individualResults;
      
      if (approach === "sequential") {
        // Sequential approach: each agent builds on the previous agent's work
        individualResults = [];
        let currentOutput = "";
        
        for (let i = 0; i < validAgents.length; i++) {
          const agentId = validAgents[i];
          const agent = getAgent(agentId);
          
          // For sequential work, include the previous agent's output
          const sequentialContext = {
            ...context,
            previousOutput: currentOutput,
            collaborationPhase: `Step ${i+1}/${validAgents.length}`
          };
          
          // Update collaborative task for sequential work
          const sequentialTask = `
            ${task}
            
            ${i > 0 ? `PREVIOUS AGENT OUTPUT (from ${getAgent(validAgents[i-1]).name}):\n${currentOutput}\n\nYour task is to build upon and improve this work.` : 'You are the first agent in this sequential collaboration.'}
          `;
          
          const result = await sendTaskToAgent(agentId, sequentialTask, sequentialContext);
          individualResults.push(result);
          currentOutput = result.response;
        }
      } else {
        // Parallel approach: all agents work independently
        const individualResultPromises = validAgents.map(agentId => {
          return sendTaskToAgent(agentId, task, {
            ...context,
            collaborationPhase: "Parallel work"
          }).catch(error => {
            console.error(`Error with agent ${agentId}:`, error);
            // Return a placeholder result for failed agent
            const agent = getAgent(agentId) || { id: agentId, name: "Unknown Agent", type: "unknown" };
            return {
              agentId,
              name: agent.name,
              type: agent.type,
              response: `Error: ${error.message || "Unknown error"}`
            };
          });
        });
        
        individualResults = await Promise.all(individualResultPromises);
      }
      
      // Record individual contributions
      for (const result of individualResults) {
        collaborationResults.push({
          phase: "individual",
          agentId: result.agentId,
          agentName: result.name,
          content: result.response
        });
      }
      
      // If we only have a single agent, no synthesis needed
      if (validAgents.length === 1) {
        finalSynthesis.content = individualResults[0].response;
        finalSynthesis.contributors = individualResults.map(r => ({ id: r.agentId, name: r.name, type: r.type }));
        
        // Update the UI with results
        updateCollaborationInUI(collaborationResults, finalSynthesis);
        
        return {
          individualResults: collaborationResults,
          synthesis: finalSynthesis.content,
          contributors: finalSynthesis.contributors
        };
      }
      
      // Step 2: Synthesize the results based on the determined strategy
      // Try to use a writer agent for synthesis if available
      let synthesizerAgent = null;
      
      // Look for a writer among active agents
      const writers = activeAgents.filter(agent => agent.type === 'writer');
      if (writers.length > 0) {
        synthesizerAgent = writers[0].id;
      } else {
        // Otherwise use the first agent
        synthesizerAgent = validAgents[0];
      }
      
      // Step 3: Synthesize the results
      const allResponses = individualResults
        .map(r => `${r.name} (${r.type}${getAgent(r.agentId)?.specialization ? ': ' + getAgent(r.agentId).specialization : ''}): ${r.response}`)
        .join("\n\n---\n\n");
      
      // Use any custom synthesis strategy provided by coordinator
      const synthesisStrategy = collaborationApproach?.synthesis_strategy || 
        "Create a unified response that leverages the strengths of each agent";
      
      const synthesisPrompt = `
        SYNTHESIS TASK
        
        You are coordinating a team of specialized agents who have each analyzed this task:
        "${task}"
        
        Each agent has provided their insights from their unique perspective.
        
        AGENT RESPONSES:
        ${allResponses}
        
        YOUR SYNTHESIS STRATEGY:
        ${synthesisStrategy}
        
        Your job is to synthesize these perspectives into a cohesive final response that:
        1. Highlights areas of agreement
        2. Notes interesting differences in perspective
        3. Creates a unified response that leverages the strengths of each agent
        
        Provide your synthesis in a clear, structured format suitable for the final response.
      `;
      
      try {
        const synthesisResponse = await sendTaskToAgent(synthesizerAgent, synthesisPrompt, context);
        
        collaborationResults.push({
          phase: "synthesis",
          agentId: synthesizerAgent,
          content: synthesisResponse.response
        });
        
        finalSynthesis.content = synthesisResponse.response;
        finalSynthesis.contributors = individualResults.map(r => ({ id: r.agentId, name: r.name, type: r.type }));
      } catch (synthesisError) {
        console.error("Error during synthesis:", synthesisError);
        
        // Use the first agent's response as a fallback
        finalSynthesis.content = `[Synthesis failed: Using best individual response]\n\n${individualResults[0].response}`;
        finalSynthesis.contributors = individualResults.map(r => ({ id: r.agentId, name: r.name, type: r.type }));
        
        collaborationResults.push({
          phase: "synthesis",
          agentId: synthesizerAgent,
          content: finalSynthesis.content
        });
      }
      
      // Update the UI with collaboration results
      updateCollaborationInUI(collaborationResults, finalSynthesis);
      
      return {
        individualResults: collaborationResults.filter(r => r.phase === "individual"),
        synthesis: finalSynthesis.content,
        contributors: individualResults.map(r => ({ id: r.agentId, name: r.name, type: r.type }))
      };
    } catch (error) {
      console.error("Agent collaboration error:", error);
      window.DocumentReviewer.UI.updateDebugInfo(`Agent collaboration error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Update the agent display panel in the UI
   */
  function updateAgentDisplay() {
    // Check if agent panel exists and create if needed
    let agentPanel = document.getElementById('agent-panel');
    
    if (!agentPanel && activeAgents.length > 0) {
      // Create agent panel
      agentPanel = createAgentPanel();
    } else if (agentPanel && activeAgents.length === 0) {
      // Remove panel if no agents
      agentPanel.remove();
      return;
    } else if (!agentPanel) {
      return;
    }
    
    // Update content
    const agentList = agentPanel.querySelector('.agent-list') || document.createElement('div');
    agentList.className = 'agent-list';
    agentList.innerHTML = '';
    
    // Add each agent to the display
    activeAgents.forEach(agent => {
      const agentCard = document.createElement('div');
      agentCard.className = 'agent-card';
      agentCard.dataset.agentId = agent.id;
      
      agentCard.innerHTML = `
        <div class="agent-header">
          <span class="agent-icon">${agent.icon}</span>
          <span class="agent-name">${agent.name}</span>
          <button class="agent-remove-btn" data-agent-id="${agent.id}">×</button>
        </div>
        <div class="agent-description">${agent.description}</div>
        ${agent.specialization ? `<div class="agent-specialization">${agent.specialization}</div>` : ''}
        <div class="agent-metrics">
          <span title="Prompts Handled">${agent.metrics.promptsHandled} 📝</span>
          <span title="Questions Asked">${agent.metrics.questionsAsked} ❓</span>
        </div>
        <div class="agent-actions">
          <button class="agent-task-btn" data-agent-id="${agent.id}">Assign Task</button>
          <button class="agent-convo-btn" data-agent-id="${agent.id}">History</button>
        </div>
      `;
      
      agentList.appendChild(agentCard);
      
      // Add event listeners
      agentCard.querySelector('.agent-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        removeAgent(agent.id);
      });
      
      agentCard.querySelector('.agent-task-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showAgentTaskDialog(agent.id);
      });
      
      agentCard.querySelector('.agent-convo-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showAgentConversationHistory(agent.id);
      });
    });
    
    // Refresh the panel content
    if (agentPanel.querySelector('.agent-list')) {
      agentPanel.replaceChild(agentList, agentPanel.querySelector('.agent-list'));
    } else {
      agentPanel.appendChild(agentList);
    }
  }
  
  /**
   * Create the agent panel in the UI
   */
  function createAgentPanel() {
    const panel = document.createElement('div');
    panel.id = 'agent-panel';
    panel.className = 'agent-panel';
    
    const header = document.createElement('div');
    header.className = 'agent-panel-header';
    header.innerHTML = `
      <h3>Specialist Agents</h3>
      <div class="agent-panel-controls">
        <button id="create-agent-btn">+ New Agent</button>
        <button id="agent-collab-btn">Collaborate</button>
        <button id="toggle-auto-mode-btn" class="${autoModeEnabled ? 'active' : ''}">Auto Mode: ${autoModeEnabled ? 'ON' : 'OFF'}</button>
      </div>
    `;
    
    panel.appendChild(header);
    
    // Add to the canvas area
    document.getElementById('canvas').appendChild(panel);
    
    // Add event listeners
    document.getElementById('create-agent-btn').addEventListener('click', showCreateAgentDialog);
    document.getElementById('agent-collab-btn').addEventListener('click', showCollaborationDialog);
    document.getElementById('toggle-auto-mode-btn').addEventListener('click', () => {
      const newState = toggleAutoMode();
      document.getElementById('toggle-auto-mode-btn').textContent = `Auto Mode: ${newState ? 'ON' : 'OFF'}`;
      document.getElementById('toggle-auto-mode-btn').className = newState ? 'active' : '';
    });
    
    return panel;
  }
  
  /**
   * Show dialog to create a new agent
   */
  function showCreateAgentDialog() {
    // Create modal dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal agent-modal';
    dialog.style.display = 'block';
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    content.innerHTML = `
      <span class="close-btn">&times;</span>
      <h2>Create New Specialist Agent</h2>
      
      <div class="agent-type-selector">
        ${Object.entries(agentTemplates).map(([type, template]) => `
          <div class="agent-type-option" data-type="${type}">
            <div class="agent-type-icon">${template.icon}</div>
            <div class="agent-type-info">
              <div class="agent-type-name">${template.name}</div>
              <div class="agent-type-desc">${template.description}</div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <div class="agent-customize-form" style="display:none;">
        <div class="form-group">
          <label for="agent-name">Agent Name:</label>
          <input type="text" id="agent-name">
        </div>
        <div class="form-group">
          <label for="agent-specialization">Specialization (optional):</label>
          <input type="text" id="agent-specialization" placeholder="E.g., Legal documents, Technical content, etc.">
        </div>
        <button id="create-agent-confirm" class="primary-btn">Create Agent</button>
      </div>
    `;
    
    dialog.appendChild(content);
    document.body.appendChild(dialog);
    
    // Selected agent type
    let selectedType = null;
    
    // Add event listeners
    const closeBtn = content.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
      dialog.remove();
    });
    
    // Agent type selection
    const typeOptions = content.querySelectorAll('.agent-type-option');
    typeOptions.forEach(option => {
      option.addEventListener('click', () => {
        // Deselect all
        typeOptions.forEach(opt => opt.classList.remove('selected'));
        
        // Select this one
        option.classList.add('selected');
        selectedType = option.dataset.type;
        
        // Show customization form
        content.querySelector('.agent-customize-form').style.display = 'block';
        
        // Pre-fill name
        content.querySelector('#agent-name').value = agentTemplates[selectedType].name;
      });
    });
    
    // Create button
    const createBtn = content.querySelector('#create-agent-confirm');
    createBtn.addEventListener('click', () => {
      if (!selectedType) {
        window.DocumentReviewer.UI.updateDebugInfo("No agent type selected");
        return;
      }
      
      const name = content.querySelector('#agent-name').value.trim() || agentTemplates[selectedType].name;
      const specialization = content.querySelector('#agent-specialization').value.trim();
      
      createAgent(selectedType, {
        name,
        specialization: specialization || null
      });
      
      dialog.remove();
    });
    
    // Close when clicking outside
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }
  
  /**
   * Show dialog to assign a task to an agent
   */
  function showAgentTaskDialog(agentId) {
    const agent = getAgent(agentId);
    if (!agent) return;
    
    // Create modal dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal agent-modal';
    dialog.style.display = 'block';
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    content.innerHTML = `
      <span class="close-btn">&times;</span>
      <h2>Assign Task to ${agent.name}</h2>
      
      <div class="form-group">
        <label for="agent-task">Task Description:</label>
        <textarea id="agent-task" rows="4" placeholder="Describe the task for this agent..."></textarea>
      </div>
      
      <div class="form-group">
        <label for="agent-task-context">Additional Context (optional):</label>
        <textarea id="agent-task-context" rows="3" placeholder="Any additional context for the agent..."></textarea>
      </div>
      
      <div class="agent-task-options">
        <div class="form-group option-group">
          <input type="checkbox" id="include-query" checked>
          <label for="include-query">Include current query</label>
        </div>
      </div>
      
      <button id="assign-task-btn" class="primary-btn">Assign Task</button>
    `;
    
    dialog.appendChild(content);
    document.body.appendChild(dialog);
    
    // Add event listeners
    const closeBtn = content.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
      dialog.remove();
    });
    
    // Get current query if available
    let currentQuery = '';
    const chatMessages = document.querySelectorAll('#chat-history .message.user');
    if (chatMessages.length > 0) {
      const lastMessage = chatMessages[chatMessages.length - 1];
      currentQuery = lastMessage.querySelector('.bubble').textContent;
    }
    
    // Assign task button
    const assignBtn = content.querySelector('#assign-task-btn');
    assignBtn.addEventListener('click', async () => {
      const task = content.querySelector('#agent-task').value.trim();
      if (!task) {
        window.DocumentReviewer.UI.updateDebugInfo("Task description is required");
        return;
      }
      
      const additionalContext = content.querySelector('#agent-task-context').value.trim();
      const includeQuery = content.querySelector('#include-query').checked;
      
      // Disable button and show loading
      assignBtn.disabled = true;
      assignBtn.textContent = 'Processing...';
      
      try {
        // Send task to agent
        const context = {
          query: includeQuery ? currentQuery : '',
          additionalContext
        };
        
        await sendTaskToAgent(agentId, task, context);
        
        // Close dialog
        dialog.remove();
        
      } catch (error) {
        console.error("Error assigning task:", error);
        window.DocumentReviewer.UI.updateDebugInfo(`Task assignment error: ${error.message}`);
        
        // Re-enable button
        assignBtn.disabled = false;
        assignBtn.textContent = 'Try Again';
      }
    });
    
    // Close when clicking outside
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }
  
  /**
   * Show dialog for agent collaboration
   */
  function showCollaborationDialog() {
    if (activeAgents.length < 2) {
      window.DocumentReviewer.UI.updateDebugInfo("Need at least 2 agents for collaboration");
      return;
    }
    
    // Create modal dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal agent-modal';
    dialog.style.display = 'block';
    
    const content = document.createElement('div');
    content.className = 'modal-content';
    
    content.innerHTML = `
      <span class="close-btn">&times;</span>
      <h2>Agent Collaboration</h2>
      
      <div class="form-group">
        <label>Select Agents for Collaboration:</label>
        <div class="agent-selection-list">
          ${activeAgents.map(agent => `
            <div class="agent-select-item">
              <input type="checkbox" id="select-${agent.id}" data-agent-id="${agent.id}" class="agent-select-checkbox">
              <label for="select-${agent.id}">${agent.icon} ${agent.name}</label>
            </div>
          `).join('')}
        </div>
      </div>
      
      <div class="form-group">
        <label for="collab-task">Collaboration Task:</label>
        <textarea id="collab-task" rows="4" placeholder="Describe the task for the selected agents..."></textarea>
      </div>
      
      <div class="form-group">
        <label for="collab-context">Additional Context (optional):</label>
        <textarea id="collab-context" rows="3" placeholder="Any additional context for the collaboration..."></textarea>
      </div>
      
      <div class="agent-collaboration-options">
        <div class="form-group option-group">
          <input type="checkbox" id="collab-include-query" checked>
          <label for="collab-include-query">Include current query</label>
        </div>
      </div>
      
      <button id="start-collab-btn" class="primary-btn">Start Collaboration</button>
    `;
    
    dialog.appendChild(content);
    document.body.appendChild(dialog);
    
    // Add event listeners
    const closeBtn = content.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
      dialog.remove();
    });
    
    // Get current query if available
    let currentQuery = '';
    const chatMessages = document.querySelectorAll('#chat-history .message.user');
    if (chatMessages.length > 0) {
      const lastMessage = chatMessages[chatMessages.length - 1];
      currentQuery = lastMessage.querySelector('.bubble').textContent;
    }
    
    // Start collaboration button
    const startBtn = content.querySelector('#start-collab-btn');
    startBtn.addEventListener('click', async () => {
      const selectedAgentIds = Array.from(content.querySelectorAll('.agent-select-checkbox:checked'))
        .map(checkbox => checkbox.dataset.agentId);
        
      if (selectedAgentIds.length < 2) {
        window.DocumentReviewer.UI.updateDebugInfo("Please select at least 2 agents");
        return;
      }
      
      const task = content.querySelector('#collab-task').value.trim();
      if (!task) {
        window.DocumentReviewer.UI.updateDebugInfo("Task description is required");
        return;
      }
      
      const additionalContext = content.querySelector('#collab-context').value.trim();
      const includeQuery = content.querySelector('#collab-include-query').checked;
      
      // Disable button and show loading
      startBtn.disabled = true;
      startBtn.textContent = 'Processing...';
      
      try {
        // Start collaboration
        const context = {
          query: includeQuery ? currentQuery : '',
          additionalContext
        };
        
        await runAgentCollaboration(selectedAgentIds, task, context);
        
        // Close dialog
        dialog.remove();
        
      } catch (error) {
        console.error("Error starting collaboration:", error);
        window.DocumentReviewer.UI.updateDebugInfo(`Collaboration error: ${error.message}`);
        
        // Re-enable button
        startBtn.disabled = false;
        startBtn.textContent = 'Try Again';
      }
    });
    
    // Close when clicking outside
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }
  
  /**
   * Show agent conversation history
   */
  function showAgentConversationHistory(agentId) {
    const agent = getAgent(agentId);
    if (!agent) return;
    
    const conversation = agentConversations[agentId] || [];
    
    // Create modal dialog
    const dialog = document.createElement('div');
    dialog.className = 'modal agent-modal';
    dialog.style.display = 'block';
    
    const content = document.createElement('div');
    content.className = 'modal-content agent-history-content';
    
    content.innerHTML = `
      <span class="close-btn">&times;</span>
      <h2>${agent.icon} ${agent.name} - Conversation History</h2>
      
      <div class="agent-conversation">
        ${conversation.length > 0 ? conversation.map(msg => `
          <div class="agent-message ${msg.role}">
            <div class="agent-message-header">
              <span class="agent-message-role">${msg.role}</span>
              <span class="agent-message-time">${new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>
            <div class="agent-message-content">${msg.content}</div>
          </div>
        `).join('') : '<div class="empty-history">No conversation history yet</div>'}
      </div>
    `;
    
    dialog.appendChild(content);
    document.body.appendChild(dialog);
    
    // Add event listeners
    const closeBtn = content.querySelector('.close-btn');
    closeBtn.addEventListener('click', () => {
      dialog.remove();
    });
    
    // Close when clicking outside
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }
  
  /**
   * Update UI to show agent activity
   */
  function updateAgentActivityInUI(agentId, task, response) {
    const agent = getAgent(agentId);
    if (!agent) return;
    
    // Create or find agent activity container in meta-process area
    let agentActivity = document.querySelector(`#agent-activity-${agentId}`);
    
    if (!agentActivity) {
      // Create new agent activity section
      agentActivity = document.createElement('div');
      agentActivity.id = `agent-activity-${agentId}`;
      agentActivity.className = 'meta-process-stage agent-activity';
      agentActivity.innerHTML = `
        <h3>${agent.icon} ${agent.name} - Activity</h3>
        <div class="agent-activity-content"></div>
      `;
      
      // Find meta-process container
      const metaProcess = document.getElementById('meta-process');
      if (metaProcess) {
        metaProcess.appendChild(agentActivity);
      } else {
        // If meta-process doesn't exist, append to canvas
        const canvas = document.getElementById('canvas');
        if (canvas) {
          canvas.appendChild(agentActivity);
        }
      }
    }
    
    // Update activity content
    const activityContent = agentActivity.querySelector('.agent-activity-content');
    
    // Add new activity entry
    const activityEntry = document.createElement('div');
    activityEntry.className = 'agent-activity-entry';
    
    activityEntry.innerHTML = `
      <div class="agent-activity-task">
        <strong>Task:</strong> ${task}
      </div>
      <div class="agent-activity-response">
        <strong>Response:</strong>
        <div class="agent-activity-response-content">${window.DocumentReviewer.Helpers.formatForDisplay(response)}</div>
      </div>
    `;
    
    // Add to content
    activityContent.appendChild(activityEntry);
    
    // Scroll to show this activity
    agentActivity.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  /**
   * Update UI to show agent interaction
   */
  function updateAgentInteractionInUI(questionerAgentId, targetAgentId, questions, answers) {
    const questioner = getAgent(questionerAgentId);
    const target = getAgent(targetAgentId);
    
    if (!questioner || !target) return;
    
    // Create agent interaction container
    const interactionContainer = document.createElement('div');
    interactionContainer.className = 'meta-process-stage agent-interaction';
    interactionContainer.innerHTML = `
      <h3>${questioner.icon} ${questioner.name} ↔️ ${target.icon} ${target.name}</h3>
      <div class="agent-interaction-content">
        <div class="agent-questions">
          <div class="agent-icon-small">${questioner.icon}</div>
          <div class="agent-message-content">${window.DocumentReviewer.Helpers.formatForDisplay(questions)}</div>
        </div>
        <div class="agent-answers">
          <div class="agent-icon-small">${target.icon}</div>
          <div class="agent-message-content">${window.DocumentReviewer.Helpers.formatForDisplay(answers)}</div>
        </div>
      </div>
    `;
    
    // Find meta-process container
    const metaProcess = document.getElementById('meta-process');
    if (metaProcess) {
      metaProcess.appendChild(interactionContainer);
    } else {
      // If meta-process doesn't exist, append to canvas
      const canvas = document.getElementById('canvas');
      if (canvas) {
        canvas.appendChild(interactionContainer);
      }
    }
    
    // Scroll to show this interaction
    interactionContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  /**
   * Update UI to show agent planning
   */
  function updateAgentPlanningInUI(plannerAgentId, recommendation, newAgentId) {
    const planner = getAgent(plannerAgentId);
    const newAgent = getAgent(newAgentId);
    
    if (!planner || !newAgent) return;
    
    // Create agent planning container
    const planningContainer = document.createElement('div');
    planningContainer.className = 'meta-process-stage agent-planning';
    planningContainer.innerHTML = `
      <h3>${planner.icon} ${planner.name} - Agent Planning</h3>
      <div class="agent-planning-content">
        <div class="agent-planning-recommendation">
          <strong>Recommended Agent Type:</strong> ${recommendation.recommendedType}<br>
          <strong>Name:</strong> ${recommendation.agentName}<br>
          <strong>Specialization:</strong> ${recommendation.specialization}<br>
          <strong>Justification:</strong> ${recommendation.justification}
        </div>
        <div class="agent-planning-result">
          <div class="agent-created-icon">${newAgent.icon}</div>
          <div class="agent-created-info">
            <div class="agent-created-name">${newAgent.name}</div>
            <div class="agent-created-type">${newAgent.type}</div>
            <div class="agent-created-specialization">${newAgent.specialization || ''}</div>
          </div>
        </div>
      </div>
    `;
    
    // Find meta-process container
    const metaProcess = document.getElementById('meta-process');
    if (metaProcess) {
      metaProcess.appendChild(planningContainer);
    } else {
      // If meta-process doesn't exist, append to canvas
      const canvas = document.getElementById('canvas');
      if (canvas) {
        canvas.appendChild(planningContainer);
      }
    }
    
    // Scroll to show this planning
    planningContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  /**
   * Update UI to show collaboration results
   */
  function updateCollaborationInUI(results, synthesis) {
    // Create collaboration container
    const collabContainer = document.createElement('div');
    collabContainer.className = 'meta-process-stage agent-collaboration';
    
    // Generate HTML for individual contributions
    const individualHtml = results
      .filter(r => r.phase === "individual")
      .map(result => {
        const agent = getAgent(result.agentId);
        if (!agent) {
          return `
            <div class="agent-contribution">
              <div class="agent-contribution-header">
                <span class="agent-icon-small">❓</span>
                <span class="agent-name">Unknown Agent (${result.agentId || 'unknown'})</span>
              </div>
              <div class="agent-contribution-content">
                ${window.DocumentReviewer.Helpers.formatForDisplay(result.content)}
              </div>
            </div>
          `;
        }
        
        return `
          <div class="agent-contribution">
            <div class="agent-contribution-header">
              <span class="agent-icon-small">${agent.icon}</span>
              <span class="agent-name">${agent.name}</span>
            </div>
            <div class="agent-contribution-content">
              ${window.DocumentReviewer.Helpers.formatForDisplay(result.content)}
            </div>
          </div>
        `;
      })
      .join('');
    
    // Generate HTML for synthesis
    const synthesisResult = results.find(r => r.phase === "synthesis");
    const synthesisHtml = synthesisResult ? `
      <div class="agent-synthesis">
        <div class="agent-synthesis-header">
          <h4>Synthesized Response</h4>
        </div>
        <div class="agent-synthesis-content">
          ${window.DocumentReviewer.Helpers.formatForDisplay(synthesisResult.content)}
        </div>
      </div>
    ` : '';
    
    // Contributors list
    const contributorsHtml = synthesis.contributors && synthesis.contributors.length > 0 ? `
      <div class="agent-contributors">
        <h4>Contributors:</h4>
        <div class="agent-contributors-list">
          ${synthesis.contributors.map(c => {
            const agent = getAgent(c.id);
            return agent ? `
              <div class="agent-contributor">
                <span class="agent-icon-small">${agent.icon}</span>
                <span class="agent-name">${agent.name}</span>
              </div>
            ` : '';
          }).filter(Boolean).join('')}
        </div>
      </div>
    ` : '';
    
    // Set the container content
    collabContainer.innerHTML = `
      <h3>Agent Collaboration</h3>
      <div class="agent-collaboration-content">
        <div class="agent-contributions">
          <h4>Individual Contributions</h4>
          ${individualHtml}
        </div>
        ${synthesisHtml}
        ${contributorsHtml}
      </div>
    `;
    
    // Find meta-process container
    const metaProcess = document.getElementById('meta-process');
    if (metaProcess) {
      metaProcess.appendChild(collabContainer);
    } else {
      // If meta-process doesn't exist, append to canvas
      const canvas = document.getElementById('canvas');
      if (canvas) {
        canvas.appendChild(collabContainer);
      }
    }
    
    // Also add synthesis to response content
    if (synthesisResult && synthesis.content) {
      // Get response container
      const responseContent = document.getElementById('response-content');
      if (responseContent) {
        responseContent.innerHTML = window.DocumentReviewer.Helpers.formatForDisplay(synthesis.content);
        
        // Add as AI message
        window.DocumentReviewer.UI.addAIMessage(synthesis.content);
      }
    }
    
    // Scroll to show collaboration
    collabContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  
  // Initialize system agents on script load
  initializeSystemAgents();

  // Expose the API
  // Ensure DocumentReviewer exists
  if (!window.DocumentReviewer) window.DocumentReviewer = {};
  
  // Add to namespace
  window.DocumentReviewer.AgentManager = {
    createAgent,
    getAgent,
    removeAgent,
    sendTaskToAgent,
    agentQuestionAgent,
    planNewAgent,
    runAgentCollaboration,
    analyzeTaskAndSelectAgents,
    runAutoAgentProcess,
    createCustomAgentFromFactory,
    toggleAutoMode,
    isAutoModeEnabled,
    getActiveAgents: () => [...activeAgents],
    getAgentTemplates: () => ({...agentTemplates}),
    showAgentPanel: updateAgentDisplay
  };
  
})();
