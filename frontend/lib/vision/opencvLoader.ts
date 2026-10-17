declare global {
  interface Window {
    cv: any;
  }
}

let opencvPromise: Promise<any> | null = null;

export function loadOpenCV(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Cannot load OpenCV on server"));
  }

  if (window.cv && window.cv.Mat) {
    return Promise.resolve(window.cv);
  }

  if (opencvPromise) {
    return opencvPromise;
  }

  opencvPromise = new Promise((resolve) => {
    // Check if script already exists
    const existingScript = document.getElementById("opencv-script");
    if (existingScript) {
      const checkInterval = setInterval(() => {
        if (window.cv && window.cv.Mat) {
          clearInterval(checkInterval);
          resolve(window.cv);
        }
      }, 50);

      // Fallback timeout
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve(window.cv?.Mat ? window.cv : null);
      }, 4000);
      return;
    }

    const script = document.createElement("script");
    script.id = "opencv-script";
    script.async = true;
    // Fast Cloudflare CDN mirror for OpenCV.js 4.8.0
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/opencv.js/4.8.0/opencv.js";

    let resolved = false;
    const safeResolve = (cvObj: any) => {
      if (!resolved) {
        resolved = true;
        resolve(cvObj);
      }
    };

    script.onload = () => {
      if (window.cv && window.cv.Mat) {
        safeResolve(window.cv);
      } else if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          safeResolve(window.cv);
        };
      }
    };

    script.onerror = () => {
      console.warn("Primary OpenCV CDN failed, loading secondary mirror...");
      const fallbackScript = document.createElement("script");
      fallbackScript.async = true;
      fallbackScript.src = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.9.0-release.1/dist/opencv.js";
      fallbackScript.onload = () => {
        if (window.cv && window.cv.Mat) {
          safeResolve(window.cv);
        } else if (window.cv) {
          window.cv.onRuntimeInitialized = () => {
            safeResolve(window.cv);
          };
        }
      };
      fallbackScript.onerror = () => {
        console.warn("Secondary OpenCV mirror failed. Native canvas vision will be used.");
        safeResolve(null);
      };
      document.body.appendChild(fallbackScript);
    };

    document.body.appendChild(script);

    // Timeout fallback after 5 seconds to prevent blocking UI
    setTimeout(() => {
      if (window.cv && window.cv.Mat) {
        safeResolve(window.cv);
      } else {
        console.warn("OpenCV.js runtime init deferred, proceeding with canvas vision.");
        safeResolve(window.cv?.Mat ? window.cv : null);
      }
    }, 5000);
  });

  return opencvPromise;
}
