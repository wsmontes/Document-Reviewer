/**
 * Debug and Initialization Check for Meta-Engine
 * This script confirms that critical components are properly defined and logs their status
 */
(function() {
  // Set a small delay to ensure all other scripts have loaded
  setTimeout(function() {
    console.log("== Document Reviewer Debug Check ==");
    
    // Check the DocumentReviewer namespace
    if (window.DocumentReviewer) {
      console.log("✅ DocumentReviewer namespace is defined");
      
      // Check critical components
      const components = [
        "MetaEngine", "UI", "DocumentProcessor", 
        "APIService", "Helpers", "AgentManager",
        "Segmentation", "Config"
      ];
      
      components.forEach(component => {
        if (window.DocumentReviewer[component]) {
          console.log(`✅ DocumentReviewer.${component} is defined`);
          
          // Additional check for key methods in MetaEngine
          if (component === "MetaEngine") {
            const methods = ["processQuery", "executeMetaStages", "resetMetaState"];
            methods.forEach(method => {
              if (typeof window.DocumentReviewer.MetaEngine[method] === "function") {
                console.log(`  ✅ DocumentReviewer.MetaEngine.${method} is a function`);
              } else {
                console.error(`  ❌ DocumentReviewer.MetaEngine.${method} is missing or not a function`);
              }
            });
          }
        } else {
          console.error(`❌ DocumentReviewer.${component} is missing`);
        }
      });
    } else {
      console.error("❌ DocumentReviewer namespace is not defined");
    }
    
    console.log("== Debug Check Complete ==");
  }, 1000); // Wait 1 second after page load
})();
