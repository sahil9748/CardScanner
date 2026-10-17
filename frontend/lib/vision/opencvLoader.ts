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
      return;
    }

    const script = document.createElement("script");
    script.id = "opencv-script";
    script.async = true;
    // Standard fast CDN for OpenCV.js 4.8.0
    script.src = "https://docs.opencv.org/4.8.0/opencv.js";

    script.onload = () => {
      // OpenCV.js needs runtime initialization
      if (window.cv && window.cv.Mat) {
        resolve(window.cv);
      } else if (window.cv) {
        window.cv.onRuntimeInitialized = () => {
          resolve(window.cv);
        };
      }
    };

    script.onerror = () => {
      console.warn("Failed to load external OpenCV.js, fallback vision engine will be used.");
      resolve(null);
    };

    document.body.appendChild(script);

    // Timeout fallback after 6 seconds to avoid blocking
    setTimeout(() => {
      if (window.cv && window.cv.Mat) {
        resolve(window.cv);
      } else {
        console.warn("OpenCV.js loading timed out, falling back to native canvas vision.");
        resolve(null);
      }
    }, 6000);
  });

  return opencvPromise;
}
