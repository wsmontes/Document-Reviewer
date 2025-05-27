/**
 * Helper utility functions
 */
(function() {
  // Generate a unique ID
  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };

  // Format text for display with markdown-like formatting
  const formatForDisplay = (text) => {
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
  };

  // Enhanced JSON sanitization function
  const sanitizeJsonString = (jsonString) => {
    if (!jsonString) return "{}";
    
    try {
      // Check if the string starts with a markdown code block
      const codeBlockRegex = /^```(?:json)?\s*([\s\S]*?)```/i;
      const codeBlockMatch = jsonString.match(codeBlockRegex);
      
      if (codeBlockMatch) {
        // Extract just the JSON content from inside the code block
        jsonString = codeBlockMatch[1].trim();
        console.log("Extracted JSON from code block:", jsonString);
      }
      
      // First attempt: Try to parse as-is to see if it's already valid
      JSON.parse(jsonString);
      return jsonString;
    } catch (e) {
      console.log("Initial JSON parsing failed, applying sanitization:", e);
    }
    
    try {
      // Replace problematic control characters
      let cleaned = jsonString.trim();
      
      // Remove any remaining markdown code block indicators
      cleaned = cleaned.replace(/^```(?:json)?|```$/gi, '').trim();
      
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
        
        // For segmentation plans, look for segments
        const segmentsMatch = cleaned.match(/"segments":\s*\[(.*?)\]/s);
        
        // Build a clean JSON object from the extracted parts
        let manualBuild = {};
        
        // Handle critique format
        if (ratingMatch || confidenceMatch || strengthsMatch || weaknessesMatch) {
          manualBuild = {
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
        }
        // Handle segmentation plan format
        else if (segmentsMatch) {
          // Create at least an empty segments array
          manualBuild = {
            segments: []
          };
          
          // Try to parse segments from the matched content
          try {
            const segmentContent = segmentsMatch[1];
            const segmentObjects = segmentContent.split(/},\s*{/);
            
            // Process each segment
            segmentObjects.forEach((segObj, index) => {
              // Add braces if they were removed by splitting
              let segmentJson = segObj;
              if (!segmentJson.startsWith('{')) segmentJson = '{' + segmentJson;
              if (!segmentJson.endsWith('}')) segmentJson = segmentJson + '}';
              
              try {
                // Try to parse individual segment
                const segment = JSON.parse(segmentJson);
                manualBuild.segments.push({
                  title: segment.title || `Segment ${index + 1}`,
                  description: segment.description || `Content for segment ${index + 1}`
                });
              } catch (segErr) {
                // If parsing fails, add a default segment
                manualBuild.segments.push({
                  title: `Segment ${index + 1}`,
                  description: `Content for segment ${index + 1}`
                });
              }
            });
          } catch (segParseErr) {
            // If all segment parsing fails, create default segments
            manualBuild.segments = [
              { title: "Introduction", description: "Overview of the document" },
              { title: "Main Content", description: "Core information from the document" },
              { title: "Conclusion", description: "Summary and key takeaways" }
            ];
          }
        }
        
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
  };

  // Helper function to parse string arrays from JSON fragments
  const parseStringArray = (arrayText) => {
    // Handle empty arrays
    if (!arrayText || arrayText.trim() === '') return [];
    
    // Split by commas that are followed by quotes (to handle comma in strings)
    return arrayText.split(/"(?:\s*),(?:\s*)"/g)
      .map(item => item.replace(/^"/, '').replace(/"$/, '').trim())
      .filter(item => item.length > 0);
  };

  // Ensure DocumentReviewer exists
  if (!window.DocumentReviewer) window.DocumentReviewer = {};

  // Expose the utility functions to the namespace
  window.DocumentReviewer.Helpers = {
    generateId,
    formatForDisplay,
    sanitizeJsonString,
    parseStringArray
  };
})();
