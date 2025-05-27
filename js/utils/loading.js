/**
 * Loading screen utility
 */
(function() {
  // Create and show loading overlay when DOM is ready
  function createLoadingOverlay() {
    if (!document.body) return null;
    
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'loading-overlay';
    loadingOverlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: #18181b;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      z-index: 9999;
      transition: opacity 0.5s ease;
    `;
    
    const logoContainer = document.createElement('div');
    logoContainer.style.cssText = `
      margin-bottom: 2rem;
      font-size: 2.5rem;
      font-weight: bold;
      color: #6366f1;
    `;
    logoContainer.innerHTML = 'Document Reviewer';
    
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.style.cssText = `
      width: 50px;
      height: 50px;
      border: 5px solid rgba(99, 102, 241, 0.2);
      border-top-color: #6366f1;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    `;
    
    const loadingText = document.createElement('div');
    loadingText.className = 'loading-text';
    loadingText.style.cssText = `
      margin-top: 1.5rem;
      color: #a1a1aa;
      font-size: 1rem;
    `;
    loadingText.textContent = 'Loading modules...';
    
    // Add @keyframes for the spinner animation
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `;
    
    document.head.appendChild(styleSheet);
    loadingOverlay.appendChild(logoContainer);
    loadingOverlay.appendChild(spinner);
    loadingOverlay.appendChild(loadingText);
    document.body.appendChild(loadingOverlay);
    
    return loadingOverlay;
  }
  
  // Define an object at window.DocumentReviewer if it doesn't exist
  if (!window.DocumentReviewer) window.DocumentReviewer = {};
  
  // Load after DOM is ready
  window.DocumentReviewer.Loading = {
    overlay: null,
    
    // Show loading screen
    showLoading: function() {
      // Only create if DOM is ready
      const setupLoading = () => {
        if (!this.overlay) {
          this.overlay = createLoadingOverlay();
        }
      };
      
      if (document.readyState === 'loading') {
        // DOM not ready yet - wait for it
        document.addEventListener('DOMContentLoaded', setupLoading);
      } else {
        // DOM is ready - create now
        setupLoading();
      }
    },
    
    // Hide loading screen
    hideLoading: function() {
      if (!this.overlay) return;
      
      // Fade out then remove
      this.overlay.style.opacity = '0';
      setTimeout(() => {
        if (this.overlay && this.overlay.parentNode) {
          this.overlay.parentNode.removeChild(this.overlay);
        }
        this.overlay = null;
      }, 500);
    },
    
    // Update loading message
    updateLoadingText: function(message) {
      if (!this.overlay) return;
      
      const loadingText = this.overlay.querySelector('.loading-text');
      if (loadingText) {
        loadingText.textContent = message;
      }
    }
  };
  
  // Only show loading if DOM is already interactive or complete
  // (otherwise wait for DOMContentLoaded)
  if (document.readyState === 'interactive' || document.readyState === 'complete') {
    window.DocumentReviewer.Loading.showLoading();
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      window.DocumentReviewer.Loading.showLoading();
    });
  }
  
  // Hide loading when everything is loaded
  window.addEventListener('load', function() {
    setTimeout(() => {
      window.DocumentReviewer.Loading.hideLoading();
    }, 800);
  });
})();
